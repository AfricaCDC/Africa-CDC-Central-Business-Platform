/**
 * Microsoft Graph email transport (app-only / client-credentials).
 *
 * A drop-in replacement for the nodemailer SMTP transport: it exposes the
 * same `sendMail(mailOptions)` contract ({ from, to, cc, subject, html,
 * text, attachments, replyTo }), so the worker's sendRow() never has to
 * know which backend is active.
 *
 * Why Graph and not SMTP: Microsoft 365 disables basic-auth SMTP AUTH for
 * africacdc.org mailboxes, so they can only be driven through Graph's
 * POST /users/{mailbox}/sendMail with an OAuth client-credentials token
 * (Mail.Send application permission). Ported from phahm-platform
 * (apps/api/src/shared/email/graphTransport.js) — same proven flow, CJS.
 */

'use strict';

const { readFileSync } = require('node:fs');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_SCOPE = 'https://graph.microsoft.com/.default';
const GRAPH_ACCEPTED_STATUS = 202; // sendMail returns 202 Accepted on success
const TOKEN_REFRESH_SKEW_MS = 60_000; // refresh a minute before actual expiry
const DEFAULT_TOKEN_TTL_S = 3600;
const MS_PER_SECOND = 1000;
const ERR_DETAIL_MAX = 300;

/**
 * Recipients arrive as a string, a nodemailer {name,address}, or an array of
 * either. A string may hold several addresses separated by commas (grouped
 * alerts put every recipient on one message), as nodemailer accepts.
 */
function toRecipientList(value) {
  if (!value) return [];
  const arr = (Array.isArray(value) ? value : [value])
    .flatMap((v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : [v]));
  return arr.map((v) => (typeof v === 'string'
    ? { emailAddress: { address: v } }
    : { emailAddress: { address: v.address, name: v.name } }));
}

/** `from` is "Display Name <addr@x>" or {name,address}; Graph wants a recipient object. */
function toFromRecipient(from) {
  if (!from) return undefined;
  if (typeof from !== 'string') return { emailAddress: { address: from.address, name: from.name } };
  const match = /<([^>]+)>/.exec(from);
  if (!match) return { emailAddress: { address: from } };
  // Strip RFC 5322 quoting: '"Africa CDC RBM" <a@x>' → 'Africa CDC RBM'.
  const name = from.slice(0, from.indexOf('<')).trim().replace(/^"(.*)"$/, '$1');
  return { emailAddress: { address: match[1], name: name || undefined } };
}

/** nodemailer attachments → Graph fileAttachment with base64 contentBytes. */
function toGraphAttachments(attachments) {
  if (!attachments || !attachments.length) return undefined;
  return attachments.map((a) => {
    const bytes = a.content
      ? Buffer.from(a.content).toString('base64')
      : readFileSync(a.path).toString('base64');
    return {
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.filename,
      contentType: a.contentType,
      contentBytes: bytes,
      contentId: a.cid,
      isInline: a.cid ? true : a.contentDisposition === 'inline',
    };
  });
}

/**
 * Pure mapping (no network) so it can be unit-tested in isolation.
 *
 * @param {{from?:*,to:*,cc?:*,subject?:string,html?:string,text?:string,attachments?:Array,replyTo?:*}} opts
 * @returns {{message: object, saveToSentItems: boolean}}
 * @example buildGraphMessage({ to: 'a@x.org', subject: 'Hi', html: '<b>x</b>' })
 */
function buildGraphMessage({ from, to, cc, subject, html, text, attachments, replyTo }) {
  const message = {
    subject: subject || '',
    body: html
      ? { contentType: 'HTML', content: html }
      : { contentType: 'Text', content: text || '' },
    toRecipients: toRecipientList(to),
  };
  const ccList = toRecipientList(cc);
  if (ccList.length > 0) message.ccRecipients = ccList;
  const fromRecipient = toFromRecipient(from);
  if (fromRecipient) message.from = fromRecipient;
  const replyToList = toRecipientList(replyTo);
  if (replyToList.length > 0) message.replyTo = replyToList;
  const graphAttachments = toGraphAttachments(attachments);
  if (graphAttachments) message.attachments = graphAttachments;
  return { message, saveToSentItems: false };
}

function resolveMailbox(sender, fromAddress) {
  if (sender) return sender;
  const match = /<([^>]+)>/.exec(fromAddress || '');
  return match ? match[1] : fromAddress;
}

function displayName(value) {
  if (!value) return undefined;
  if (typeof value !== 'string') return value.name;
  const idx = value.indexOf('<');
  if (idx <= 0) return undefined;
  // Strip RFC 5322 quoting: '"Africa CDC RBM" <a@x>' → 'Africa CDC RBM'.
  const name = value.slice(0, idx).trim().replace(/^"(.*)"$/, '$1');
  return name || undefined;
}

/**
 * Force the From to this transport's own mailbox identity (`ownFrom`),
 * keeping the caller's display name when it set one. Graph and Exchange
 * both reject send-as for a foreign address.
 *
 * @param {string} ownFrom - configured mailbox, e.g. `"RBM" <noreply@x>`
 * @param {*} callerFrom - what the caller passed (string or {name,address})
 * @returns {{name?:string, address:string}}
 * @example stampFrom('"RBM" <noreply@x.org>', 'Alerts <other@y>') // {name:'Alerts', address:'noreply@x.org'}
 */
function stampFrom(ownFrom, callerFrom) {
  const match = /<([^>]+)>/.exec(ownFrom || '');
  const address = match ? match[1] : ownFrom;
  const name = displayName(callerFrom) || displayName(ownFrom);
  return name ? { name, address } : { address };
}

/** Cached client-credentials token provider (one token call per TTL, not per email). */
function createTokenProvider({ tenantId, clientId, clientSecret, fetchImpl }) {
  let cachedToken = null;
  let tokenExpiresAt = 0;
  return async function getAccessToken() {
    const now = Date.now();
    if (cachedToken && now < tokenExpiresAt - TOKEN_REFRESH_SKEW_MS) return cachedToken;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: TOKEN_SCOPE,
      grant_type: 'client_credentials',
    });
    const res = await fetchImpl(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`graph_token_failed ${res.status}: ${detail.slice(0, ERR_DETAIL_MAX)}`);
    }
    const json = await res.json();
    cachedToken = json.access_token;
    tokenExpiresAt = now + (json.expires_in || DEFAULT_TOKEN_TTL_S) * MS_PER_SECOND;
    return cachedToken;
  };
}

/**
 * Build the Graph transport. Same `sendMail` contract as nodemailer.
 *
 * @param {{tenantId:string, clientId:string, clientSecret:string, sender?:string, fromAddress:string, fetchImpl?:Function}} opts
 * @returns {{sendMail: Function, close: Function}}
 * @throws {Error} graph_token_failed / graph_send_failed on non-2xx responses
 * @example const t = buildGraphTransport({ tenantId, clientId, clientSecret, fromAddress: '"RBM" <noreply@x.org>' });
 */
function buildGraphTransport({ tenantId, clientId, clientSecret, sender, fromAddress, fetchImpl = fetch }) {
  const mailbox = resolveMailbox(sender, fromAddress);
  const getAccessToken = createTokenProvider({ tenantId, clientId, clientSecret, fetchImpl });

  return {
    async sendMail(mailOptions) {
      const accessToken = await getAccessToken();
      // Always send as this app's own mailbox; keep the caller's display name.
      const from = stampFrom(fromAddress, mailOptions.from);
      const payload = buildGraphMessage({ ...mailOptions, from });
      const res = await fetchImpl(`${GRAPH_BASE}/users/${encodeURIComponent(mailbox)}/sendMail`, {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status !== GRAPH_ACCEPTED_STATUS) {
        const detail = await res.text();
        throw new Error(`graph_send_failed ${res.status}: ${detail.slice(0, ERR_DETAIL_MAX)}`);
      }
      // Loosely mirror nodemailer's info object so messageId logging keeps working.
      return {
        messageId: res.headers.get('request-id') || 'graph-accepted',
        accepted: toRecipientList(mailOptions.to).map((r) => r.emailAddress.address),
      };
    },
    close() {},
  };
}

module.exports = { buildGraphTransport, buildGraphMessage, stampFrom };
