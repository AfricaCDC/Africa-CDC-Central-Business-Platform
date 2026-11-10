// ── API Server (Express) ──
//
// Middleware order matters. The stack is:
//   1. trust proxy       — so req.ip resolves correctly behind nginx
//   2. cors              — strict allowlist (no wildcard in prod)
//   3. body parser       — JSON only, 10 MB cap
//   4. morgan            — dev request log
//   5. generalLimiter    — global fallback rate limit (300 r/min/IP)
//   6. routes            — module-specific limiters mounted inside route files
//   7. error handler     — translates ApiError + DB errors into safe JSON
//
// Security headers are owned by the nginx gateway (CSP, HSTS, X-Frame-Options,
// X-Content-Type-Options, Referrer-Policy, etc). The api-server no longer ships
// helmet — running both generated conflicting headers and hid nginx CSP misses.

const express = require('express');
const compression = require('compression');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const envConfig = require('./config/env');
const { generalLimiter, adminLimiter } = require('./middleware/rateLimit');
const { errorHandler } = require('@rbm/lib/errors');

const app = express();

// ── Trust the gateway ──
// nginx terminates the public connection and forwards the client context via
// `X-Forwarded-For`, `X-Real-IP`, `X-Forwarded-Proto` and `X-Forwarded-Host`
// (see services/api-gateway/proxy_params — D-20260415-09, CSP-07, F-001).
// Without `trust proxy`, express ignores those headers and the rate limiter
// locks out the entire app on a single bad client. `'loopback'` restricts
// the trust to requests originating from 127.0.0.1 / ::1 — the only path
// the gateway uses to reach the api-server in both local dev and the
// co-located gateway topology — so an attacker can't smuggle in an XFF
// header by hitting the service directly from another host. Do NOT use
// `true`: it trusts every hop and re-introduces XFF spoofing.
// In Docker the edge proxy and the gateway reach the api-server from the
// private bridge network, not loopback: trusting only loopback made req.ip
// the gateway for every request (one shared rate-limit bucket for all
// signed-out traffic). 'uniquelocal' trusts those private hops only; the
// first public address from the right of X-Forwarded-For is the client, and
// whatever a client prepends itself is ignored (D-20261108-02).
app.set('trust proxy', ['loopback', 'uniquelocal']);

// ── 0. Response compression + strong ETag ──
// gzip JSON/HTML payloads > 1 KB (the gateway also gzip's, but this
// covers direct hits in dev + defence in depth if gateway's gzip
// misses a type). Strong ETag makes unchanged GET responses return
// 304 Not Modified — zero body transferred, massive bandwidth win on
// reference-data polling (divisions, indicators, templates…).
app.use(compression({ threshold: 1024 }));
app.set('etag', 'strong');

// ── 1. CORS ──
// Strict allowlist read from CORS_ORIGINS. Same-origin requests (no Origin
// header) are always allowed. Ngrok is allowed in dev only (matches the old
// behavior used by Lenny's mobile testing setup).
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (envConfig.cors.origins.includes(origin)) return callback(null, true);
      if (envConfig.isDev && /\.ngrok(-free)?\.app$/.test(origin)) return callback(null, true);
      if (envConfig.isDev && /\.ngrok\.io$/.test(origin)) return callback(null, true);
      // Reject silently (no exception) so we don't leak the rejection reason.
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
    maxAge: 86400, // cache CORS preflight for 24h
  })
);

// ── 2. Body parser ──
app.use(express.json({ limit: '10mb' }));

// ── 2b. Cookie parser ──
// Signed cookies (10 min TTL) are used only by the Microsoft SSO
// callback flow to carry the OAuth `state` + `nonce` between the
// `/auth/microsoft/login` redirect and the `/auth/microsoft/callback`
// return — every other auth path stays Bearer-token. The secret is
// the same as the access-token secret; rotating one rotates both,
// which is fine because stale state cookies just fail validation.
app.use(cookieParser(envConfig.jwt.accessSecret));

// ── 3. Request log (dev only) ──
if (envConfig.isDev) {
  app.use(morgan('dev'));
}

// ── 4. Global rate limit ──
// The general limiter protects every route as a final safety net. The
// refreshLimiter (mounted inside authRoutes.js) and adminLimiter (mounted
// below) override it for sensitive paths.
app.use(generalLimiter);

// ── 4b. Request audit logger ──
// Mounted after body-parser, cookie-parser and rate limiter so that
// req.body and req.user (via optional auth) are available, but before
// any route handlers fire. Writes every request to audit_events table
// fire-and-forget. See middleware/requestLogger.js for skip-list.
const requestLogger = require('./middleware/requestLogger');
app.use(requestLogger());

// ── 5. No static uploads: verification files live in SharePoint (upload via
// /api/reporting/upload-verification). The old local-disk /uploads folder and
// /api/evidence router were removed (D-20261108-02).

// ── 6. Public health endpoints (BEFORE any auth-gated routes) ──
// Order matters: many route files (e.g. workplanRoutes) call
// `router.use(authenticateToken)` at module load. If we mount the
// /api router first, requests to /api/health get matched as a fall-through
// path inside one of those sub-routers and the auth middleware fires.
/**
 * GET /health — unauthenticated liveness probe used by load balancers and docker healthchecks.
 *
 * @returns {object} `{ status: 'ok', timestamp: Date }`
 * @example
 * // curl http://localhost:4000/health
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

/**
 * GET /api/health — same shape as `/health`, mounted under the `/api` prefix for nginx routing.
 *
 * @returns {object} `{ status: 'ok', service: 'api-server', timestamp: Date }`
 * @example
 * // curl http://localhost:4000/api/health
 */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'api-server', timestamp: new Date() });
});

/**
 * GET / — root marker endpoint; returns the platform name for smoke tests.
 *
 * @returns {object} `{ message: string }`
 * @example
 * // curl http://localhost:4000/
 */
app.get('/', (_req, res) => {
  res.json({ message: 'Africa CDC RBM Platform API v1.0' });
});

// ── 7. Routes ──
// Admin routes get a stricter limiter mounted on the prefix.
app.use('/api/admin', adminLimiter);
app.use('/api/governance', adminLimiter);

// Reference-data cache headers — endpoints that change rarely get a
// 60-second private browser cache. Combined with strong ETag, repeated
// navigations either reuse the in-memory copy (cache-hit) or validate
// with a zero-byte 304. Mutations bypass the header because the
// middleware only stamps GET/HEAD.
const { cacheControl, revalidate } = require('./middleware/cacheControl');
const REF_CACHE_60 = cacheControl(60);
const REF_CACHE_5MIN = cacheControl(300);
// Org data is EDITED from the admin UI (org chart rename/reparent). A
// max-age here makes the browser answer the post-save refetch from its
// HTTP cache → the page shows pre-edit data for 5 minutes ("save not
// effective" bug). no-cache + ETag keeps 0-byte 304s without staleness.
const REF_REVALIDATE = revalidate();
app.use('/api/admin/division-codes', REF_REVALIDATE);
app.use('/api/admin/divisions', REF_REVALIDATE);
app.use('/api/admin/strategic-plan', REF_CACHE_5MIN);
app.use('/api/admin/tiers', REF_CACHE_5MIN);
app.use('/api/admin/units-of-measure', REF_CACHE_5MIN);
app.use('/api/admin/business-units', REF_CACHE_5MIN);
// Roles carry the editable `permissions` column shown by the /admin/settings
// PermEditor — same read-your-own-writes constraint as the org chart.
app.use('/api/admin/roles', REF_REVALIDATE);
app.use('/api/admin/partners', REF_CACHE_5MIN);
app.use('/api/admin/disaggregations', REF_CACHE_5MIN);
// Pillars are migration-seeded, not UI-editable → time cache is safe.
app.use('/api/pillars', REF_CACHE_5MIN);
// Plan nodes are created, edited, submitted and approved from the UI: a
// max-age left a new draft missing from My Specifics for a minute.
app.use('/api/plan-nodes', REF_REVALIDATE);
app.use('/api/staff', REF_CACHE_60);

// Public API-key-gated routes MUST be mounted BEFORE any router that
// applies `authenticateToken` globally (a router mounted at /api with
// `router.use(authenticateToken)` would intercept /api/public/* with a
// 401 TOKEN_MISSING).
app.use('/api/public/exports', require('./routes/public/quarterlyReportExportRoutes'));
app.use('/api/public', require('./routes/public/workplanExportRoutes'));
app.use('/api/public', require('./routes/public/pirsBigTicketsExportRoutes'));

app.use('/api', require('./routes/index'));

// Admin → API Keys (token management for external consumers).
app.use('/api/admin/api-keys', require('./routes/admin/apiKeysRoutes'));

// ── 8. Global error handler ──
// Canonical flat envelope via @rbm/lib/errors.
//
// Canonical flat envelope `{ success:false, message, code }`. Delegates to the
// shared `errorHandler` in `@rbm/lib/errors`, which translates every thrown
// `ApiError` subclass, JWT errors, and raw DB errors into the safe envelope —
// stack traces, schema leaks, SQL fragments are all sanitized away.
app.use((err, req, res, next) => {
  // Stash for requestLogger audit rows (fire-and-forget).
  res._auditError = (err && err.message) || 'Unknown error';
  return errorHandler(err, req, res, next);
});

module.exports = app;
