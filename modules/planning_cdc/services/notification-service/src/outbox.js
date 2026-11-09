/**
 * notification-service / outbox.js — durable replacement for the old
 * in-memory queue (D-05).
 *
 * Responsibilities:
 *   - `enqueue()` — write one or more rows with `status='queued'`.
 *   - `claimBatch()` — atomically pull N queued rows and mark them `draft`
 *     so the worker can process them without double-send races.
 *   - `markSent()` / `markFailed()` — terminal transitions.
 *   - `validateResetUrl()` — reject `reset_url` payloads whose host is not
 *     on the allow-list (fixes F-010 open-redirect).
 *
 * All reads and writes go through the single Knex instance exported by
 * `./db.js` so connection pooling stays centralized (CSP-12).
 */

const db = require('./db');
const config = require('./config');
const { NOTIFICATION_TYPES, NOTIFICATION_TYPE_ALIASES } = require('@rbm/lib/enums');
const { createLogger } = require('@rbm/lib/logger');

const log = createLogger('notification-service', { component: 'outbox' });

const TABLE = 'notification_outbox';
const CANONICAL_TYPES = new Set(Object.values(NOTIFICATION_TYPES));

/**
 * Normalize legacy kebab-case keys to the canonical NOTIFICATION_TYPES value.
 *
 * @param {string} eventKey
 * @returns {string} canonical value.
 * @throws {Error} when the key is neither canonical nor a known alias.
 */
function normalizeEventKey(eventKey) {
  if (CANONICAL_TYPES.has(eventKey)) return eventKey;
  const aliased = NOTIFICATION_TYPE_ALIASES[eventKey];
  if (aliased) return aliased;
  throw new Error(`Unknown notification event key '${eventKey}'`);
}

/**
 * Allow-list validator for `data.reset_url`. Accepts only URLs whose host
 * ends with an entry in `config.security.resetUrlHostAllowlist`.
 * Returns `{ ok: true }` when the field is absent — the allow-list only
 * guards against OPEN-REDIRECTS, not against callers that never set the
 * field.
 *
 * @param {Record<string, *>} data
 * @returns {{ ok: boolean, reason?: string }}
 */
function validateResetUrl(data) {
  if (!data || !data.reset_url) return { ok: true };
  let parsed;
  try {
    parsed = new URL(data.reset_url);
  } catch {
    return { ok: false, reason: 'reset_url is not a valid URL' };
  }
  const host = parsed.hostname.toLowerCase();
  const allowlist = config.security.resetUrlHostAllowlist.map((h) => h.toLowerCase());
  const allowed = allowlist.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  if (!allowed) {
    return { ok: false, reason: `reset_url host '${host}' is not in the allow-list` };
  }
  return { ok: true };
}

/**
 * @typedef {object} EnqueueInput
 * @property {string} eventKey — NOTIFICATION_TYPES value or legacy alias.
 * @property {string[]} recipients — one outbox row per email.
 * @property {string} [subject]
 * @property {Record<string, *>} [data]
 * @property {string} [correlationId]
 */

/**
 * Insert one row per recipient. Returns the inserted ids.
 *
 * @param {EnqueueInput} input
 * @returns {Promise<{ ids: number[], correlationId?: string }>}
 * @throws {Error} when `eventKey` is unknown or `data.reset_url` fails
 *   allow-list validation.
 */
// eslint-disable-next-line complexity -- fan-out enqueue: recipient dedupe + URL validation + dev override + batch insert, clearer flat.
async function enqueue(input) {
  const eventKey = normalizeEventKey(input.eventKey);
  const recipients = (input.recipients || []).filter(Boolean);
  if (recipients.length === 0) {
    throw new Error('enqueue: at least one recipient required');
  }

  const urlCheck = validateResetUrl(input.data);
  if (!urlCheck.ok) {
    throw new Error(`enqueue: ${urlCheck.reason}`);
  }

  const payload = JSON.stringify(input.data || {});
  const now = new Date();
  // HARD gate: redirect only when DEV_EMAIL_OVERRIDE is set AND
  // NODE_ENV is NOT production/staging. Real HODs must get real
  // emails outside of local dev.
  const env = String(process.env.NODE_ENV || '').toLowerCase();
  const isSensitiveEnv = env === 'production' || env === 'staging' || env === 'prod';
  const devOverride = (!isSensitiveEnv && process.env.DEV_EMAIL_OVERRIDE) || null;

  const rows = recipients.map((email) => ({
    event_key:      eventKey,
    recipient:      devOverride || email,
    subject:        input.subject || null,
    payload,
    headers:        null,
    status:         'queued',
    attempts:       0,
    last_error:     null,
    correlation_id: input.correlationId || null,
    created_at:     now,
    updated_at:     now,
    sent_at:        null,
  }));

  const firstId = await db(TABLE).insert(rows);
  // MySQL returns the id of the FIRST inserted row; remaining ids are
  // contiguous by the engine's auto-increment contract.
  const baseId = Array.isArray(firstId) ? firstId[0] : firstId;
  const ids = rows.map((_r, i) => baseId + i);

  log.info('outbox.enqueued', {
    eventKey,
    count: ids.length,
    correlationId: input.correlationId,
  });
  return { ids, correlationId: input.correlationId };
}

/**
 * Atomically claim up to `limit` rows with `status='queued'` by flipping
 * them to `status='draft'` inside a transaction. Rows returned are safe
 * for the worker to send without a second process grabbing the same row.
 *
 * @param {number} limit
 * @returns {Promise<Array<object>>} claimed rows (raw DB shape).
 */
async function claimBatch(limit) {
  return db.transaction(async (trx) => {
    const candidates = await trx(TABLE)
      .select('id')
      .where({ status: 'queued' })
      .orderBy('created_at', 'asc')
      .limit(limit)
      .forUpdate();

    if (candidates.length === 0) return [];
    const ids = candidates.map((r) => r.id);

    await trx(TABLE)
      .whereIn('id', ids)
      .update({ status: 'draft', updated_at: trx.fn.now() });

    return trx(TABLE).whereIn('id', ids).select('*');
  });
}

/**
 * Transition a row to `sent` and stamp `sent_at = NOW()`.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
async function markSent(id) {
  await db(TABLE)
    .where({ id })
    .update({
      status: 'sent',
      sent_at: db.fn.now(),
      last_error: null,
      updated_at: db.fn.now(),
    });
}

/**
 * Record a send failure. Increments `attempts` and, once the counter
 * reaches `config.outbox.maxAttempts`, flips status to `failed` (DLQ
 * lane). Otherwise the row returns to `queued` for the next poll.
 *
 * @param {object} row — the claimed row (includes current `attempts`).
 * @param {Error|string} err
 * @returns {Promise<{ status: 'queued'|'failed', attempts: number }>}
 */
async function markFailed(row, err) {
  const message = err && err.message ? err.message : String(err);
  const attempts = (row.attempts || 0) + 1;
  const final = attempts >= config.outbox.maxAttempts;
  const status = final ? 'failed' : 'queued';

  await db(TABLE)
    .where({ id: row.id })
    .update({
      status,
      attempts,
      last_error: message.slice(0, 2000),
      updated_at: db.fn.now(),
    });

  log.warn('outbox.send_failed', {
    id: row.id,
    eventKey: row.event_key,
    attempts,
    final,
    error: message.slice(0, 200),
  });

  return { status, attempts };
}

/**
 * Build a safe Message-ID using the configured SMTP domain.
 *
 * @param {number|string} rowId
 * @returns {string}
 */
function buildMessageId(rowId) {
  const rand = Math.random().toString(36).slice(2, 10);
  return `<outbox-${rowId}-${rand}@${config.smtp.domain}>`;
}

module.exports = {
  enqueue,
  claimBatch,
  markSent,
  markFailed,
  validateResetUrl,
  normalizeEventKey,
  buildMessageId,
};
