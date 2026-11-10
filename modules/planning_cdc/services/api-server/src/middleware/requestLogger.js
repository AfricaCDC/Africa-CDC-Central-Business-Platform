// ── Request Logger Middleware ──
//
// Logs every HTTP request to the `audit_events` table as a fire-and-forget
// insert. Mounted in app.js AFTER auth middleware (so req.user is available)
// but BEFORE route handlers.
//
// Skips: /api/health, /health, /assets/, /favicon.ico, /api/governance/audit
// (to avoid noise from healthchecks and recursive audit-reads).
//
// Sensitive fields (passwords, tokens) are stripped from logged request bodies.

const db = require('../config/db');
const { createLogger } = require('@rbm/lib/logger');
const { notifyServerError } = require('../services/errorAlertService');
const { KEY_PREFIX } = require('../services/apiKeyService');

const logger = createLogger('api-server').child({ module: 'requestLogger' });

/** Paths that should never be logged (healthchecks, static, recursive). */
const SKIP_PATHS = [
  '/health',
  '/api/health',
  '/favicon.ico',
  '/api/governance/audit',
  '/api/governance/page-view',
];

const SKIP_PREFIXES = ['/assets/'];

/** Fields stripped from request bodies before persisting. */
const SENSITIVE_KEYS = [
  'password', 'password_hash', 'new_password',
  'token', 'refresh_token', 'refreshToken',
  'secret', 'client_secret', 'authorization',
  'api_key', 'apiKey', 'access_token',
];

// Query parameters that carry credentials: the public API key (`?api_key=`)
// and the Microsoft sign-in code/state of the SSO callback (D-20261108-02).
const SENSITIVE_QUERY_KEYS = [...SENSITIVE_KEYS, 'code', 'state', 'session_state', 'id_token'];

function sanitizeQuery(query) {
  if (!query || typeof query !== 'object' || !Object.keys(query).length) return undefined;
  const sanitized = { ...query };
  for (const [key, value] of Object.entries(sanitized)) {
    // A key sent under the wrong name (?key=, ?PRA_WORKPLAN_API_KEY=) is
    // still a key: redact any value shaped like one.
    const looksLikeApiKey = typeof value === 'string' && value.startsWith(KEY_PREFIX);
    if (SENSITIVE_QUERY_KEYS.includes(key) || looksLikeApiKey) sanitized[key] = '***REDACTED***';
  }
  return sanitized;
}

/**
 * Return a sanitized copy of the request body (or undefined).
 *
 * @param {object|undefined} body
 * @returns {object|undefined}
 */
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return undefined;
  const sanitized = { ...body };
  for (const key of SENSITIVE_KEYS) {
    if (key in sanitized) sanitized[key] = '***REDACTED***';
  }
  const str = JSON.stringify(sanitized);
  if (str.length > 2000) return { _truncated: true, keys: Object.keys(sanitized) };
  return sanitized;
}

/**
 * Extract the real client IP from X-Forwarded-For or req.ip.
 *
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractIp(req) {
  if (!req) return null;
  // req.ip is resolved through the trusted proxies only (app.js `trust
  // proxy`); the leftmost X-Forwarded-For entry is client-controlled.
  const ip = (req.ip || '').toString();
  return ip ? ip.slice(0, 45) : null;
}

/**
 * Classify the response status code into an audit action category.
 *
 * @param {number} statusCode
 * @returns {string}
 */
function categorizeAction(statusCode) {
  if (statusCode >= 500) return 'API_ERROR_5XX';
  if (statusCode >= 400) return 'API_ERROR_4XX';
  return 'API_REQUEST';
}

/**
 * Build the `details` JSON payload persisted with each audit row.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {number} duration
 * @returns {object}
 */
function buildDetails(req, res, duration) {
  return {
    method: req.method,
    path: req.path,
    query: sanitizeQuery(req.query),
    status: res.statusCode,
    duration_ms: duration,
    body: req.method !== 'GET' ? sanitizeBody(req.body) : undefined,
    error: res.statusCode >= 400 ? (res._auditError || null) : undefined,
  };
}

/**
 * Fire-and-forget insert into audit_events. Errors are logged but never
 * propagate to the request/response cycle.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {number} duration
 */
function writeAuditEvent(req, res, duration) {
  const actorId = req.user && req.user.id ? Number(req.user.id) : null;
  const details = buildDetails(req, res, duration);
  const ip = extractIp(req);
  const userAgent = (req.headers['user-agent'] || '').slice(0, 500);
  // Live email to TECH_ALERTS holders (D-20261009-04); never throws.
  if (res.statusCode >= 500) notifyServerError({ reqUser: req.user, details, ip, userAgent });
  db('audit_events')
    .insert({
      entity_type: 'http_request',
      entity_id: null,
      action: categorizeAction(res.statusCode),
      actor_id: actorId,
      details: JSON.stringify(details),
      ip_address: ip,
      user_agent: userAgent,
      timestamp: db.fn.now(),
    })
    .catch((err) => {
      logger.error({ err: err.message }, '[requestLogger] write failed');
    });
}

/**
 * Express middleware factory. Hooks into `res.end` to capture the final
 * status code and response time, then writes an audit row fire-and-forget.
 *
 * @returns {import('express').RequestHandler}
 * @example
 * // In app.js (after auth, before routes):
 * app.use(requestLogger());
 */
module.exports = function requestLogger() {
  return (req, res, next) => {
    const start = Date.now();
    const originalEnd = res.end;

    res.end = function (...args) {
      const skip = SKIP_PATHS.includes(req.path)
        || SKIP_PREFIXES.some((p) => req.path.startsWith(p));
      if (!skip) writeAuditEvent(req, res, Date.now() - start);
      return originalEnd.apply(this, args);
    };

    next();
  };
};
