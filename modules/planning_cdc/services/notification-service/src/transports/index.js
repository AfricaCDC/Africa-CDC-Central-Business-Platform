/**
 * Email transport selection for the outbox worker.
 *
 * Drivers (EMAIL_DRIVER):
 *   - 'smtp'      → nodemailer over SMTP (today's behaviour, default)
 *   - 'graph'     → Microsoft Graph app-only send (Mail.Send)
 *   - 'composite' → Graph primary with automatic SMTP fallback when a
 *                   send throws, so a throttled/blocked sender never
 *                   silently kills all notifications.
 *
 * When the requested driver's credentials are missing, we degrade loudly
 * (warn log) to the next viable option — SMTP if configured, otherwise
 * the dev logger that only logs and never touches the network.
 * Spec: docs/superpowers/specs/2026-08-17-prod-email-delivery-design.md
 */

'use strict';

const nodemailer = require('nodemailer');
const { buildGraphTransport } = require('./graphTransport');

function buildSmtpTransport(config) {
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
    pool: true,
    maxConnections: config.outbox.concurrency,
  });
}

function buildDevLogger(log) {
  return {
    /** Dev fallback — logs only, does not touch the network. */
    sendMail: async (opts) => {
      log.info('smtp.dev_send', { to: opts.to, subject: opts.subject });
      return { messageId: `dev-${Date.now()}`, accepted: [opts.to] };
    },
  };
}

/**
 * Try the primary backend; on any send error, warn and fall back to the
 * secondary. Exported for unit tests.
 *
 * @param {{sendMail:Function}} primary
 * @param {{sendMail:Function}} secondary
 * @param {{warn:Function}} log
 * @returns {{sendMail:Function, close:Function}}
 * @example buildComposite(graph, smtp, log)
 */
function buildComposite(primary, secondary, log) {
  return {
    async sendMail(opts) {
      try {
        return await primary.sendMail(opts);
      } catch (err) {
        log.warn('email.primary_transport_failed', { error: String((err && err.message) || err) });
        return secondary.sendMail(opts);
      }
    },
    close() {
      if (typeof primary.close === 'function') primary.close();
      if (typeof secondary.close === 'function') secondary.close();
    },
  };
}

/**
 * Resolve a graph/composite driver request. Returns null when Graph creds
 * are missing (after a loud warn) so the caller falls through to SMTP.
 */
function resolveGraphDriver({ driver, hasGraph, hasSmtp, graph, smtp, log }) {
  if (hasGraph && hasSmtp && driver === 'composite') {
    return { transport: buildComposite(graph(), smtp(), log), mode: 'composite' };
  }
  if (hasGraph) {
    if (driver === 'composite') log.warn('email.composite_without_smtp', { mode: 'graph-only' });
    return { transport: graph(), mode: 'graph' };
  }
  // Graph requested but creds missing — degrade loudly, never silently.
  log.warn('email.graph_not_configured', { requested: driver, fallback: hasSmtp ? 'smtp' : 'dev-logger' });
  return null;
}

/**
 * Build the transport for the configured driver, degrading loudly when
 * credentials are missing.
 *
 * @param {object} config - notification-service config (smtp, graph, email, outbox)
 * @param {{info:Function, warn:Function}} log
 * @returns {{transport: {sendMail:Function}, mode: string}}
 * @example const { transport, mode } = buildEmailTransport(config, log);
 */
/** Availability flags + requested driver, computed once. */
function transportFlags(config) {
  const g = config.graph || {};
  return {
    g,
    hasSmtp: !!(config.smtp.host && config.smtp.user && config.smtp.pass),
    hasGraph: !!(g.tenantId && g.clientId && g.clientSecret),
    driver: (config.email && config.email.driver) || 'smtp',
  };
}

function buildEmailTransport(config, log) {
  const { g, hasSmtp, hasGraph, driver } = transportFlags(config);

  const smtp = () => buildSmtpTransport(config);
  const graph = () => buildGraphTransport({
    tenantId: g.tenantId,
    clientId: g.clientId,
    clientSecret: g.clientSecret,
    fromAddress: g.from,
  });

  if (driver === 'graph' || driver === 'composite') {
    const resolved = resolveGraphDriver({ driver, hasGraph, hasSmtp, graph, smtp, log });
    if (resolved) return resolved;
  }

  if (hasSmtp) return { transport: smtp(), mode: 'smtp' };

  log.warn('smtp.not_configured', { mode: 'dev-logger' });
  return { transport: buildDevLogger(log), mode: 'dev-logger' };
}

module.exports = { buildEmailTransport, buildComposite };
