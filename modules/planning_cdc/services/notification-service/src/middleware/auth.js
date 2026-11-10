// ── notification-service auth middleware ──
//
// Accepts two classes of bearer JWT:
//
//   1. Service tokens — JWT with a `svc` claim from the allow-list in
//      `@rbm/lib/serviceToken`. This is the canonical service-to-service
//      path (D-07). `req.service = { name: '<svc>' }` is set on success.
//
//   2. User tokens — JWT validated by `@rbm/lib/auth.createAuthMiddleware`
//      against `JWT_ACCESS_SECRET`. `req.user` is populated.
//
// During the D-07 migration window, an api-server user token that ALSO
// carries `svc:'api-server'` (legacy pattern in `notifyService.js`) is
// treated as a service token so existing callers keep working.

const { createAuthMiddleware, extractBearerToken } = require('@rbm/lib/auth');
const { verifyServiceToken } = require('@rbm/lib/serviceToken');
const { UnauthorizedError } = require('@rbm/lib/errors');
const config = require('../config');

const userAuth = createAuthMiddleware({ secret: config.jwt.accessSecret });

/**
 * Express middleware: accept either a service token (`svc` claim) or a
 * user token. Delegates to `@rbm/lib/auth` for user tokens and to
 * `@rbm/lib/serviceToken` for service tokens.
 *
 * On success, exactly one of `req.service` or `req.user` is populated.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 * @throws {UnauthorizedError} Forwarded to the global error handler when
 *   the bearer token is missing, malformed, expired, or fails both
 *   validators.
 */
function verifyToken(req, res, next) {
  const token = extractBearerToken(req.headers);
  if (!token) return next(new UnauthorizedError('Bearer token required'));

  // 1. Try the service-token path first — it's the preferred channel.
  try {
    const payload = verifyServiceToken(token, config.serviceToken.secret);
    req.service = { name: payload.svc };
    return next();
  } catch {
    // Fall through to user-token validation.
  }

  // 2. Fall back to user-token. This also captures the legacy api-server
  //    token shape (user payload + `svc:'api-server'`) until the
  //    migration completes.
  return userAuth(req, res, next);
}

module.exports = { verifyToken };
