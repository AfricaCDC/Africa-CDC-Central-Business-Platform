// ── sync-service auth middleware ──
//
// Same JWT contract as the api-server. Reads `JWT_ACCESS_SECRET` from
// `config.js`. All routes except /health are gated by this middleware (see
// ../index.js).
//
// NOTE: cron jobs run inside the same process and bypass HTTP entirely, so
// they don't need a token. Manual sync triggers via /trigger-cbp DO need a
// token (admin-initiated only).

const { createAuthMiddleware } = require('@rbm/lib/auth');
const config = require('../config');

const SECRET = config.JWT_ACCESS_SECRET;

/**
 * Express middleware that verifies the JWT on the incoming request's
 * `Authorization: Bearer <token>` header using `JWT_ACCESS_SECRET`
 * (`JWT_SECRET` honored as a fallback during the migration window). On
 * success, attaches the decoded token payload to `req.user` and calls
 * `next()`. On failure, responds with 401. Applied to every route except
 * `/health` in `services/sync-service/src/index.js`.
 *
 * @param {import('express').Request} req — Express request; on success `req.user` is populated.
 * @param {import('express').Response} res — responds 401 when the token is missing, expired, or invalid.
 * @param {import('express').NextFunction} next — called with no args on success.
 * @returns {void}
 * @throws {Error} never propagated — all errors are translated to 401 responses by the shared auth middleware.
 */
const verifyToken = createAuthMiddleware({ secret: SECRET });

module.exports = { verifyToken };
