// ── Live server-error alert (D-20261009-04) ──
//
// Called by requestLogger for every 5xx response. Sends ONE grouped email
// (all recipients on the same message) with who hit the error, what they
// entered and the exact error, as soon as it happens.
//
// Admin-managed, nothing hardcoded:
//   · recipients: the active subscription of event `system.server_error`
//     (seeded as role_all_active:TECH_ALERTS — give or remove the TECH_ALERTS
//     role in Admin → Users, or retarget the subscription on
//     /admin/notifications);
//   · app_settings alerts.server_error.enabled (1 = on) and
//     alerts.server_error.repeat_window_min: the same error for the same user
//     on the same route is mailed once per window; repeats are counted and
//     reported in the next alert (an autosave failing every minute must not
//     send 60 emails an hour).
//
// Never throws: an alert failure must not affect the request.

const db = require('../config/db');
const { createLogger } = require('@rbm/lib/logger');
const settings = require('./settingsService');
const { resolveRecipients } = require('./notificationResolvers');

const log = createLogger('api-server').child({ module: 'errorAlertService' });

const EVENT_KEY = 'system.server_error';
const TEMPLATE_KEY = 'system-server-error';
const ENABLED_KEY = 'alerts.server_error.enabled';
const WINDOW_KEY = 'alerts.server_error.repeat_window_min';
const DEFAULT_WINDOW_MIN = 30;
const SIGNATURE_ERROR_CHARS = 120;
const SUBJECT_MAX = 250;
const MAX_TRACKED = 500;

// ponytail: in-memory dedupe, correct for the single api-server container;
// move to a table if the API is ever scaled out to several instances.
const recent = new Map(); // signature → { lastSentAt, suppressed }

/**
 * Route with numeric ids collapsed, so /reports/12 and /reports/13 match.
 *
 * @param {string} path
 * @returns {string}
 * @example normalizePath('/api/reports/12/submit'); // '/api/reports/:id/submit'
 */
function normalizePath(path) {
  return String(path || '?').split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:id');
}

/**
 * Decide whether this occurrence is mailed now. Returns how many identical
 * errors were swallowed since the previous alert, or null to stay silent.
 *
 * @param {string} signature
 * @param {number} now — epoch ms
 * @param {number} windowMs
 * @returns {number|null}
 * @example shouldAlert('POST|/x|boom|7', Date.now(), 1800000); // 0 the first time
 */
function shouldAlert(signature, now, windowMs) {
  const entry = recent.get(signature);
  if (entry && now - entry.lastSentAt < windowMs) {
    entry.suppressed += 1;
    return null;
  }
  if (recent.size >= MAX_TRACKED) {
    for (const [key, value] of recent) if (now - value.lastSentAt >= windowMs) recent.delete(key);
  }
  recent.set(signature, { lastSentAt: now, suppressed: 0 });
  return entry ? entry.suppressed : 0;
}

/**
 * Emails of the users the active `system.server_error` subscriptions resolve to.
 *
 * @returns {Promise<string[]>}
 * @example await recipientEmails(); // ['a@africacdc.org', ...]
 */
async function recipientEmails() {
  const subs = await db('notification_subscriptions')
    .join('notification_events', 'notification_events.event_key', 'notification_subscriptions.event_key')
    .where('notification_subscriptions.event_key', EVENT_KEY)
    .where('notification_subscriptions.is_active', true)
    .where('notification_events.is_active', true)
    .select('notification_subscriptions.*');
  const ids = new Set();
  for (const sub of subs) {
    const { userIds = [] } = await resolveRecipients(sub, {}, null, db);
    for (const id of userIds) ids.add(id);
  }
  if (!ids.size) return [];
  const rows = await db('users').whereIn('id', Array.from(ids)).whereNotNull('email').select('email');
  return Array.from(new Set(rows.map((r) => r.email)));
}

/**
 * The user who hit the error, with a display name.
 *
 * @param {object|undefined} reqUser — req.user
 * @returns {Promise<{id: number, name: string, email: string}|null>}
 */
async function loadActor(reqUser) {
  if (!reqUser || !reqUser.id) return null;
  const u = await db('users').where('id', reqUser.id).first('id', 'email', 'first_name', 'last_name', 'full_name');
  if (!u) return { id: reqUser.id, name: reqUser.email || `user ${reqUser.id}`, email: reqUser.email || '' };
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.full_name || u.email;
  return { id: u.id, name, email: u.email };
}

/**
 * Dedupe key: same method, route, error text and user.
 *
 * @param {object} details
 * @param {object|undefined} reqUser
 * @returns {{route: string, error: string, signature: string}}
 */
function describe(details, reqUser) {
  const route = normalizePath(details.path);
  const error = details.error ? String(details.error) : `HTTP ${details.status}`;
  const user = (reqUser && reqUser.id) || 'anonymous';
  return { route, error, signature: [details.method, route, error.slice(0, SIGNATURE_ERROR_CHARS), user].join('|') };
}

/**
 * The single outbox row carrying every recipient.
 *
 * @param {object} args
 * @returns {object} notification_outbox row
 */
function buildRow({ details, route, error, actor, emails, repeated, windowMs, ip, userAgent }) {
  const subject = `[RBM] Error ${details.status} · ${details.method} ${route} · ${actor ? actor.name : 'anonymous'}`;
  return {
    event_key: EVENT_KEY,
    recipient: emails.join(', '),
    subject: subject.slice(0, SUBJECT_MAX),
    channel: 'email',
    status: 'queued',
    payload: JSON.stringify({
      template_key: TEMPLATE_KEY,
      error: {
        at: new Date().toISOString(),
        method: details.method,
        path: details.path,
        route,
        status: details.status,
        duration_ms: details.duration_ms,
        message: error,
        body: details.body,
        query: details.query,
        repeated,
        window_min: windowMs / 60000,
      },
      actor,
      client: { ip, user_agent: userAgent },
    }),
  };
}

/**
 * Queue a live alert for one 5xx response. Fire-and-forget: never throws.
 *
 * @param {{reqUser?: object, details: object, ip?: string|null, userAgent?: string}} args — details is requestLogger's audit payload
 * @returns {Promise<boolean>} true when an email was queued
 * @example await notifyServerError({ reqUser: req.user, details, ip, userAgent });
 */
async function notifyServerError({ reqUser, details, ip = null, userAgent = '' }) {
  try {
    if (!(await settings.getBool(ENABLED_KEY, false))) return false;
    const windowMs = (await settings.getInt(WINDOW_KEY, DEFAULT_WINDOW_MIN)) * 60 * 1000;
    const { route, error, signature } = describe(details, reqUser);
    const repeated = shouldAlert(signature, Date.now(), windowMs);
    if (repeated === null) return false;

    const emails = await recipientEmails();
    if (!emails.length) return false;
    const actor = await loadActor(reqUser);
    await db('notification_outbox').insert(buildRow({ details, route, error, actor, emails, repeated, windowMs, ip, userAgent }));
    return true;
  } catch (err) {
    log.error('server_error_alert.failed', { err: err && err.message });
    return false;
  }
}

/** Test hook: forget the dedupe state. */
function resetForTests() {
  recent.clear();
}

module.exports = { notifyServerError, normalizePath, shouldAlert, resetForTests };
