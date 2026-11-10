// ── Audit Log Helper ──
//
// Thin wrapper around the existing `audit_events` table (created by
// `20240220000000_amert_v3_full_schema.js`). The table schema:
//
//   id            INT PK
//   entity_type   VARCHAR(50) NOT NULL
//   entity_id     INT NULL
//   action        VARCHAR(50) NOT NULL    (extended via 20260406_audit_log_extensions.js)
//   actor_id      INT NULL FK users.id
//   details       JSON NULL
//   timestamp     DATETIME DEFAULT NOW()
//   ip_address    VARCHAR(45) NULL        (added by 20260406)
//   user_agent    VARCHAR(500) NULL       (added by 20260406)
//
// Usage:
//   const { audit } = require('../middleware/auditLog');
//   await audit(req, 'LOGIN', 'user', user.id, { method: 'password' });
//
// IMPORTANT: this helper is fire-and-forget when called without `await` and
// will swallow its own errors. Audit logging should never block or fail the
// caller path.

const db = require('../config/db');
const { createLogger } = require('@rbm/lib/logger');

const logger = createLogger('api-server').child({ module: 'auditLog' });

/**
 * Best-effort audit log writer. Never throws. If the underlying insert fails
 * (DB unavailable, table missing in test env, etc.) it logs via the structured
 * logger and resolves so the caller flow is never interrupted.
 *
 * @param {import('express').Request} req
 * @param {string} action       Free-form code (LOGIN, LOGIN_FAILED, CREATE_USER, ...)
 * @param {string} [entityType] Logical entity (user, plan_node, period, ...)
 * @param {number|string} [entityId]
 * @param {object} [metadata]   Extra context (old/new values, filters, ...)
 * @param {number|string} [overrideActorId] Explicit actor ID (e.g. during login before req.user exists)
 * @returns {Promise<void>}
 */
// eslint-disable-next-line max-params, complexity -- audit() is an operational wrapper whose 6 params map 1:1 to audit_events columns (req, action, entityType, entityId, metadata, overrideActorId). The complexity comes from defensively preserving both numeric and non-numeric entityIds in the JSON details field. Splitting would either hide the column mapping behind an object-arg shim or duplicate the defensive coercion — neither improves readability. Scanner ceiling, not green light.
async function audit(req, action, entityType, entityId, metadata, overrideActorId) {
  try {
    const actorId = overrideActorId != null
      ? Number(overrideActorId)
      : (req && req.user && req.user.id ? Number(req.user.id) : null);
    const ip = extractIp(req);
    const ua = extractUserAgent(req);

    // entity_id is an unsigned int column. When the entity has a string
    // PK (e.g. division code "Legal"), we can't coerce it — store null
    // and keep the identifier in `details` instead.
    let entityIdNum = null;
    if (entityId != null) {
      const n = Number(entityId);
      if (Number.isFinite(n)) entityIdNum = n;
    }
    // If entityId was a non-numeric string, preserve it inside details
    // so the audit row is still searchable.
    const mergedMeta = (entityId != null && entityIdNum === null)
      ? { ...(metadata || {}), entity_code: String(entityId) }
      : metadata;
    const row = {
      entity_type: entityType || 'system',
      entity_id: entityIdNum,
      action: String(action || 'UNKNOWN').slice(0, 100),
      actor_id: actorId,
      details: mergedMeta ? JSON.stringify(mergedMeta) : null,
      ip_address: ip,
      user_agent: ua,
      timestamp: db.fn.now(),
    };

    await db('audit_events').insert(row);
  } catch (err) {
    // Audit failures are surfaced to ops via the structured logger but never
    // bubble up to the caller. Losing an audit row is an operational concern,
    // not a user-facing failure.
    logger.error({ action, err: err && err.message }, '[auditLog] failed to write event');
  }
}

// The client IP is req.ip: express resolves it from X-Forwarded-For through
// the trusted proxies only (app.js `trust proxy`). The leftmost XFF entry is
// whatever the client sent and is never used (D-20261108-02).
function extractIp(req) {
  if (!req) return null;
  const ip = (req.ip || req.connection?.remoteAddress || '').toString();
  return ip ? ip.slice(0, 45) : null;
}

function extractUserAgent(req) {
  if (!req || !req.headers) return null;
  const ua = req.headers['user-agent'] || req.headers['User-Agent'];
  if (typeof ua !== 'string') return null;
  return ua.slice(0, 500);
}

module.exports = { audit };
