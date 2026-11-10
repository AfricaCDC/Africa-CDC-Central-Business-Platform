/**
 * notification-service / worker.js — polls `notification_outbox`, renders
 * templates, sends via SMTP, terminates rows on success or retries up to
 * `config.outbox.maxAttempts` before DLQ'ing to `status='failed'`.
 *
 * Single-instance deploy assumption (master-plan §R-03). When horizontal
 * scaling is required, swap this module for BullMQ + Redis without
 * touching the enqueue path — the outbox table is the contract.
 */

const { createLogger } = require('@rbm/lib/logger');
const config = require('./config');
const outbox = require('./outbox');
const { resolveTemplate } = require('./templates');
const { buildEmailTransport } = require('./transports');

const log = createLogger('notification-service', { component: 'worker' });

let transporter = null;
let timer = null;
let inFlight = false;
let stopped = false;

function getTransporter() {
  if (transporter) return transporter;
  // Driver selection (smtp | graph | composite) lives in ./transports so
  // sendRow never has to know which backend is active (D-20260817-01).
  const built = buildEmailTransport(config, log);
  log.info('email.transport_selected', { mode: built.mode });
  transporter = built.transport;
  return transporter;
}

/**
 * Build `List-Unsubscribe` headers per RFC 2369 / RFC 8058. Both
 * `mailto:` and optional `https:` entries are included when configured.
 *
 * @returns {Record<string, string>}
 */
function unsubscribeHeaders() {
  const parts = [`<mailto:${config.unsubscribe.mailto}>`];
  if (config.unsubscribe.url) parts.push(`<${config.unsubscribe.url}>`);
  return {
    'List-Unsubscribe': parts.join(', '),
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/** Copy list set by the emitter for a mailbox email (e.g. org set-up, D-20261015-07). */
const copyList = (data) => (Array.isArray(data.cc) && data.cc.length ? { cc: data.cc } : {});

/**
 * Render and send a single outbox row. Throws on any failure so the
 * caller can invoke `markFailed`.
 *
 * @param {object} row
 * @returns {Promise<{ messageId: string }>}
 */
async function sendRow(row) {
  const { entry: template } = resolveTemplate(row);
  const data = typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload || {});
  const html = template.render(data);
  // A template subject may be a function of the payload (e.g. the report code).
  const templateSubject = typeof template.subject === 'function' ? template.subject(data) : template.subject;
  const subject = row.subject || data.subject || templateSubject || `Africa CDC RBM — ${row.event_key}`;
  const messageId = outbox.buildMessageId(row.id);

  const info = await getTransporter().sendMail({
    from: config.smtp.from,
    to: row.recipient,
    ...copyList(data),
    subject,
    html,
    messageId,
    headers: {
      ...unsubscribeHeaders(),
      'X-Correlation-ID': row.correlation_id || String(row.id),
    },
  });

  return { messageId: info.messageId || messageId };
}

/**
 * Process one poll tick: claim a batch, send in parallel (bounded by the
 * pool's maxConnections), transition each row.
 *
 * @returns {Promise<{ processed: number, sent: number, failed: number }>}
 */
async function tick() {
  if (inFlight) return { processed: 0, sent: 0, failed: 0 };
  inFlight = true;
  try {
    const rows = await outbox.claimBatch(config.outbox.batchSize);
    if (rows.length === 0) return { processed: 0, sent: 0, failed: 0 };

    const results = await Promise.allSettled(rows.map((r) => sendRow(r)));

    let sent = 0;
    let failed = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const res = results[i];
      if (res.status === 'fulfilled') {
        await outbox.markSent(row.id);
        sent += 1;
      } else {
        await outbox.markFailed(row, res.reason);
        failed += 1;
      }
    }

    log.info('worker.tick', { processed: rows.length, sent, failed });
    return { processed: rows.length, sent, failed };
  } catch (err) {
    log.error('worker.tick_error', { error: err && err.message ? err.message : String(err) });
    return { processed: 0, sent: 0, failed: 0 };
  } finally {
    inFlight = false;
  }
}

/**
 * Start the polling loop. Idempotent — calling twice is a no-op.
 *
 * @returns {void}
 */
function start() {
  if (timer || stopped) return;
  const interval = config.outbox.pollIntervalMs;
  log.info('worker.started', { intervalMs: interval, batchSize: config.outbox.batchSize });
  timer = setInterval(() => {
    tick().catch((err) => log.error('worker.unhandled', { error: err.message }));
  }, interval);
  // Let the event loop exit during graceful shutdown.
  if (timer.unref) timer.unref();
}

/**
 * Stop the polling loop. Safe to call multiple times.
 *
 * @returns {Promise<void>}
 */
async function stop() {
  stopped = true;
  if (timer) clearInterval(timer);
  timer = null;
  if (transporter && typeof transporter.close === 'function') {
    try { transporter.close(); } catch { /* noop */ }
  }
}

module.exports = { start, stop, tick, sendRow };
