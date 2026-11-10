/**
 * @rbm/lib/auth — JWT helpers and Express middleware factory.
 *
 * Replaces the duplicate `authenticateToken` middlewares previously living
 * in `services/api-server/src/middleware/authMiddleware.js` and
 * `services/file-service/src/middleware/auth.js`. Both now import the
 * factory below and pass their service-local secret.
 *
 * Per CLAUDE.md security rules:
 *   - JWT secret MUST come from `process.env` — never hardcode.
 *   - Token errors return 401, never 403 (403 is reserved for RBAC denial).
 */

const jwt = require('jsonwebtoken');
const {
  HTTP_STATUS,
  ERROR_CODES,
  buildError,
} = require('./errors');

/**
 * Pull the bearer token from request headers. Returns `null` if no header
 * is present or it doesn't start with `Bearer `.
 *
 * @param {Record<string, string|string[]|undefined>} headers
 * @returns {string|null}
 */
function extractBearerToken(headers) {
  if (!headers) return null;
  const raw = headers.authorization || headers.Authorization;
  if (!raw || typeof raw !== 'string') return null;
  if (!raw.startsWith('Bearer ')) return null;
  const token = raw.slice('Bearer '.length).trim();
  return token || null;
}

/**
 * Verify a JWT and return its decoded payload. Throws `TokenExpiredError`
 * or `JsonWebTokenError` on failure (caller decides how to translate).
 *
 * @param {string} token
 * @param {string} secret
 * @param {jwt.VerifyOptions} [options]
 * @returns {object|string}
 */
function verifyToken(token, secret, options) {
  if (!secret) {
    throw new Error('verifyToken: missing JWT secret');
  }
  return jwt.verify(token, secret, options);
}

/**
 * Sign a generic JWT.
 *
 * @param {object|string} payload
 * @param {string} secret
 * @param {jwt.SignOptions} [options]
 */
function signToken(payload, secret, options) {
  if (!secret) {
    throw new Error('signToken: missing JWT secret');
  }
  return jwt.sign(payload, secret, options);
}

/**
 * Sign a short-lived access token. Default expiry: 1h. Pass `expiresIn` to
 * override.
 */
function signAccessToken(payload, secret, options) {
  return signToken(payload, secret, { expiresIn: '1h', ...(options || {}) });
}

/**
 * Sign a long-lived refresh token. Default expiry: 7d.
 */
function signRefreshToken(payload, secret, options) {
  return signToken(payload, secret, { expiresIn: '7d', ...(options || {}) });
}

/**
 * Build an Express middleware that authenticates the bearer token.
 *
 * Always returns a 401 envelope (`{ success: false, message, code }`)
 * on failure. The middleware sets `req.user` to the decoded JWT payload on
 * success and calls `next()`.
 *
 * @param {{ secret: string, header?: string, optional?: boolean }} config
 * @returns {(req: object, res: object, next: Function) => void}
 */
function createAuthMiddleware(config) {
  if (!config || !config.secret) {
    throw new Error('createAuthMiddleware: `secret` is required');
  }
  const secret = config.secret;
  const optional = !!config.optional;

  return function authenticate(req, res, next) {
    const token = extractBearerToken(req.headers);
    if (!token) {
      if (optional) return next();
      return res.status(HTTP_STATUS.UNAUTHORIZED).json(buildError(ERROR_CODES.TOKEN_MISSING));
    }

    try {
      const decoded = verifyToken(token, secret);
      // Refresh tokens carry `type: 'refresh'` and must NEVER be accepted where
      // an access token is expected — otherwise a 7-day refresh token would act
      // as a 7-day access token. Access tokens carry no `type` claim, so this
      // only rejects refresh tokens (and any future typed non-access token).
      if (decoded && typeof decoded === 'object' && decoded.type && decoded.type !== 'access') {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json(buildError(ERROR_CODES.TOKEN_INVALID));
      }
      req.user = decoded;
      return next();
    } catch (err) {
      if (err && err.name === 'TokenExpiredError') {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json(buildError(ERROR_CODES.TOKEN_EXPIRED));
      }
      return res.status(HTTP_STATUS.UNAUTHORIZED).json(buildError(ERROR_CODES.TOKEN_INVALID));
    }
  };
}

module.exports = {
  extractBearerToken,
  verifyToken,
  signToken,
  signAccessToken,
  signRefreshToken,
  createAuthMiddleware,
};
