/**
 * file-generator-service auth middleware.
 *
 * Accepts two bearer-token classes (either satisfies auth, spec §3.5):
 *
 *   1. Service tokens — JWT with `svc` claim from our local `ACCEPTED_CALLERS`
 *      allow-list (env-configurable; default: api-server, sync-service,
 *      notification-service). This is the canonical path.
 *
 *   2. User tokens — JWT validated by `@rbm/lib/auth.createAuthMiddleware`
 *      against `JWT_ACCESS_SECRET`. `req.user` is populated (carries `sub`,
 *      `roles`, `permissions`).
 *
 * On success, exactly one of `req.service` or `req.user` is populated.
 * file-generator-service is callee-only — it never signs outbound tokens
 * (D-20260415-15 §12 #1).
 */

const { createAuthMiddleware, extractBearerToken } = require('@rbm/lib/auth');
const { verifyServiceToken } = require('@rbm/lib/serviceToken');
const { UnauthorizedError, ForbiddenError } = require('@rbm/lib/errors');
const config = require('../config');

const userAuth = createAuthMiddleware({ secret: config.jwt.accessSecret });

/**
 * Express middleware: accept service OR user token.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 * @throws {UnauthorizedError} Forwarded when the bearer token is missing,
 *   malformed, expired, or fails both validators.
 * @throws {ForbiddenError} Forwarded when a valid service token carries a
 *   `svc` claim that is not in `ACCEPTED_CALLERS`.
 */
function verifyToken(req, res, next) {
  const token = extractBearerToken(req.headers);
  if (!token) return next(new UnauthorizedError('Bearer token required'));

  try {
    const payload = verifyServiceToken(token, config.serviceToken.secret);
    if (!config.serviceToken.acceptedCallers.includes(payload.svc)) {
      return next(new ForbiddenError(`Service '${payload.svc}' is not authorized for file-generator-service`));
    }
    req.service = { name: payload.svc };
    return next();
  } catch {
    // Fall through to user-token.
  }

  return userAuth(req, res, next);
}

module.exports = { verifyToken };
