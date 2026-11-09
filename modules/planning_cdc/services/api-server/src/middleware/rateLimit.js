// ── Express rate limiting (defense in depth) ──
//
// The nginx gateway already throttles `/api/auth/*` per IP. These app-level limiters add a second layer for cases
// where:
//   1. Someone bypasses the gateway (direct service call in a misconfigured
//      cluster, or a developer hitting :4000 directly)
//   2. We need finer granularity per route group than nginx provides.
//
// All limiters return the standardized error envelope from `@rbm/lib/errors`
// so the frontend can present a friendly "too many attempts" message.

const rateLimit = require('express-rate-limit');
const { rateLimit: rateLimitConfig, jwt: jwtConfig } = require('../config/env');
const { buildError, ERROR_CODES, HTTP_STATUS } = require('@rbm/lib/errors');
const { extractBearerToken, verifyToken } = require('@rbm/lib/auth');

/**
 * Build a `handler` function that returns the standard error envelope
 * instead of express-rate-limit's default plain-text body.
 */
function envelopeHandler(message) {
  return (req, res /* , next, options */) => {
    res
      .status(HTTP_STATUS.TOO_MANY_REQUESTS)
      .json(buildError(ERROR_CODES.TOO_MANY_REQUESTS, message));
  };
}

/**
 * Who a request counts against: the signed-in user when the access token is
 * valid, else the client IP. Staff share office IPs, so counting the admin and
 * general limits per IP let one busy page block everybody behind that IP
 * (D-20261106-11). An invalid or expired token counts by IP, so a forged one
 * cannot dodge the limit. The credential limiters below stay per IP.
 *
 * @param {import('express').Request} req
 * @returns {string} `user:<id>` or the IP
 * @example userOrIpKey({ headers: {}, ip: '10.0.0.1' }) // '10.0.0.1'
 */
function userOrIpKey(req) {
  const token = extractBearerToken(req.headers);
  if (token) {
    try {
      const { id } = verifyToken(token, jwtConfig.secret);
      if (id) return `user:${id}`;
    } catch {
      // Invalid or expired token: count by IP.
    }
  }
  return req.ip;
}

/**
 * Refresh token endpoint gets its own, more lenient limiter.
 * Refresh is called automatically by the frontend on token expiry — a tight
 * limit here would log legitimate users out mid-session.
 * 30 per 15 min is plenty for normal use, still blocks token-stuffing attacks.
 */
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: envelopeHandler('Too many refresh attempts. Please log in again.'),
});

/**
 * CBP SSO accept (public form POST). Per IP; each attempt counts, since a
 * valid token is the only credential and failures are the attack signal.
 */
const ssoAcceptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: envelopeHandler('Too many sign-in attempts. Please try again later.'),
});

/**
 * Admin endpoints (user CRUD, role permissions, etc.). Higher limit than
 * refresh because admin UIs can fan out many requests on a dashboard load,
 * but lower than the general limit because admin endpoints are sensitive.
 * Counted per signed-in user.
 */
const adminLimiter = rateLimit({
  windowMs: rateLimitConfig.admin.windowMs,
  max: rateLimitConfig.admin.max,
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: envelopeHandler('Too many admin requests. Please slow down.'),
});

/**
 * Global fallback limiter — catches everything not covered by a more
 * specific limiter. 300 r/min per signed-in user (per IP before sign-in) is
 * generous enough that legitimate users (and the SPA's startup query burst)
 * are never affected.
 */
const generalLimiter = rateLimit({
  windowMs: rateLimitConfig.general.windowMs,
  max: rateLimitConfig.general.max,
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: envelopeHandler('Too many requests. Please wait a moment and try again.'),
});

module.exports = {
  userOrIpKey,
  refreshLimiter,
  ssoAcceptLimiter,
  adminLimiter,
  generalLimiter,
};
