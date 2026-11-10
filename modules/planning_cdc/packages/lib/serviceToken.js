/**
 * @rbm/lib/serviceToken — JWT sign + verify helpers for service-to-service
 * authentication (D-07). Replaces the hardcoded `roles: ['SYSTEM']` pattern.
 *
 * Flow:
 *   - Caller (e.g. sync-service) signs a JWT with a `svc` claim identifying
 *     itself — `{ svc: 'sync-service' }` — using the shared
 *     `SERVICE_TOKEN_SECRET`.
 *   - Target service (e.g. api-server) verifies the token and checks that
 *     `svc` is in the allow-list via the `serviceTokenAuth` Express
 *     middleware.
 *   - Only endpoints explicitly mounted behind `serviceTokenAuth` accept
 *     service tokens; every other route still requires a user JWT.
 */

const jwt = require('jsonwebtoken');
const { UnauthorizedError, ForbiddenError } = require('./errors');
const { extractBearerToken } = require('./auth');

/**
 * Allow-list of legitimate service identifiers. Tokens with a `svc` claim
 * outside this set are rejected by {@link serviceTokenAuth}.
 */
const ALLOWED_SERVICES = Object.freeze([
  'api-server',
  'sync-service',
  'notification-service',
]);

/**
 * Sign a short-lived service token. The token carries a single `svc` claim
 * plus standard `iat`/`exp`.
 *
 * @param {string} serviceName — must be in {@link ALLOWED_SERVICES}.
 * @param {string} secret — shared `SERVICE_TOKEN_SECRET` (≥32 chars).
 * @param {object} [options]
 * @param {string|number} [options.expiresIn='5m'] — jsonwebtoken-compatible TTL.
 * @returns {string} — signed JWT.
 * @throws {Error} when `serviceName` is not allow-listed or `secret` is missing.
 * @example
 *   const token = signServiceToken('sync-service', process.env.SERVICE_TOKEN_SECRET);
 *   await axios.post(url, body, { headers: { Authorization: `Bearer ${token}` } });
 */
function signServiceToken(serviceName, secret, options) {
  if (!ALLOWED_SERVICES.includes(serviceName)) {
    throw new Error(`signServiceToken: unknown service '${serviceName}'`);
  }
  if (!secret) {
    throw new Error('signServiceToken: missing SERVICE_TOKEN_SECRET');
  }
  const opts = options || {};
  const expiresIn = opts.expiresIn || '5m';
  return jwt.sign({ svc: serviceName }, secret, { expiresIn });
}

/**
 * Verify a service token and return the decoded payload. Throws on any
 * failure (expired, bad signature, missing/unknown `svc` claim).
 *
 * @param {string} token
 * @param {string} secret
 * @returns {{ svc: string, iat: number, exp: number }}
 * @throws {Error} when the token is malformed, expired, or `svc` is not
 *   allow-listed.
 * @example
 *   const { svc } = verifyServiceToken(tok, process.env.SERVICE_TOKEN_SECRET);
 */
function verifyServiceToken(token, secret) {
  if (!secret) throw new Error('verifyServiceToken: missing SERVICE_TOKEN_SECRET');
  const payload = jwt.verify(token, secret);
  if (!payload || typeof payload !== 'object' || !payload.svc) {
    throw new Error('Service token missing `svc` claim');
  }
  if (!ALLOWED_SERVICES.includes(payload.svc)) {
    throw new Error(`Service token from unknown service '${payload.svc}'`);
  }
  return payload;
}

/**
 * Build an Express middleware that authenticates service-to-service calls.
 * On success, attaches `req.service = { name: '<svc>' }` so downstream
 * handlers can audit the caller.
 *
 * @param {object} config
 * @param {string} config.secret — shared `SERVICE_TOKEN_SECRET`.
 * @param {string[]} [config.allowedServices] — override the default
 *   allow-list (subset of {@link ALLOWED_SERVICES}).
 * @returns {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => void}
 * @example
 *   const svcAuth = createServiceTokenAuth({ secret: env.SERVICE_TOKEN_SECRET });
 *   router.post('/admin/sync-staff', svcAuth, syncStaffHandler);
 */
function createServiceTokenAuth(config) {
  const cfg = config || {};
  if (!cfg.secret) {
    throw new Error('createServiceTokenAuth: secret is required');
  }
  const allow = Array.isArray(cfg.allowedServices) && cfg.allowedServices.length > 0
    ? cfg.allowedServices.filter((s) => ALLOWED_SERVICES.includes(s))
    : ALLOWED_SERVICES;
  return function serviceTokenAuth(req, _res, next) {
    try {
      const token = extractBearerToken(req.headers);
      if (!token) return next(new UnauthorizedError('Service token required'));
      const payload = verifyServiceToken(token, cfg.secret);
      if (!allow.includes(payload.svc)) {
        return next(new ForbiddenError(`Service '${payload.svc}' is not authorized for this route`));
      }
      req.service = { name: payload.svc };
      return next();
    } catch (err) {
      return next(new UnauthorizedError(err.message || 'Invalid service token'));
    }
  };
}

module.exports = {
  ALLOWED_SERVICES,
  signServiceToken,
  verifyServiceToken,
  createServiceTokenAuth,
};
