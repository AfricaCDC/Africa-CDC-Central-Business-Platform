// ── JWT authentication middleware ──
// Thin wrapper around the shared `createAuthMiddleware` factory in
// `@rbm/lib/auth`. Behavior preserved: missing or invalid token → 401.
//
// Centralizing the JWT verification means future fixes (e.g. token rotation,
// audience claims) only need to change `packages/lib/auth.js`.

const { createAuthMiddleware } = require('@rbm/lib/auth');
const { jwt: jwtConfig } = require('../config/env');

/**
 * Express middleware that verifies a JWT access token from the `Authorization` header.
 *
 * Missing or invalid tokens reject with HTTP 401.
 *
 * @param {express.Request} req — Express request; `req.user` is populated on success
 * @param {express.Response} res — Express response used to emit 401 on failure
 * @param {Function} next — Express next handler
 * @returns {void}
 * @example
 * router.get('/secure', authenticateToken, handler);
 */
const authenticateToken = createAuthMiddleware({ secret: jwtConfig.secret });

module.exports = { authenticateToken };
