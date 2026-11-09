// ── Centralized environment config ──
// Single source of truth for env variables. Fail fast if critical ones are missing.
//
// Loads .env from (in order of precedence):
//   1. process env (already populated by Docker / CI)
//   2. monorepo root .env (../../.env from this file)
//   3. service-local .env (./.. from this file)

const path = require('path');

// Skip dotenv entirely under Jest (NODE_ENV=test). `tests/setup.js` is the
// SOLE source of truth for env in tests; without this guard, service-local
// `.env` would clobber test values via `override: true` (see task #35 —
// previously worked around per-file with inline SERVICE_TOKEN_SECRET injections).
if (process.env.NODE_ENV !== 'test') {
  // Load root .env FIRST as defaults, then service-local .env which OVERRIDES
  // root values. This lets a developer keep root .env tuned for docker compose
  // (DB_HOST=db) while running api-server natively (services/api-server/.env
  // with DB_HOST=127.0.0.1) without conflict.
  require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '..', '.env') });
  require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), override: true });
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const isDev = NODE_ENV === 'development';
const isProd = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

// ── JWT secrets ──
// Contract: planning_cdc uses TWO separate secrets per the .env.example contract
// (JWT_ACCESS_SECRET + JWT_REFRESH_SECRET). Legacy single-secret deployments
// (`JWT_SECRET`) still work as a fallback so the system does not break during
// the transition window.
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_ACCESS_SECRET;

if (!JWT_ACCESS_SECRET) {
  throw new Error('FATAL: JWT_ACCESS_SECRET environment variable is required (≥32 chars)');
}
if (!isTest && JWT_ACCESS_SECRET.length < 32) {
  throw new Error('FATAL: JWT_ACCESS_SECRET must be at least 32 characters long');
}
if (!isTest && JWT_REFRESH_SECRET.length < 32) {
  throw new Error('FATAL: JWT_REFRESH_SECRET must be at least 32 characters long');
}
if (isProd && JWT_ACCESS_SECRET === JWT_REFRESH_SECRET) {
  throw new Error('FATAL: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ in production');
}

// ── Database credentials (D-20260818-02) ──
// The dev defaults below (`root`/`root`) must never reach production: a
// missing DB_PASSWORD used to fall back to 'root' silently, so a
// misconfigured deploy would try — and on a permissive server succeed — to
// connect as the superuser. Fail fast instead.
// An empty DB_PASSWORD is rejected DELIBERATELY, not by accident: a blank
// password on a permissive MySQL server authenticates just like a missing one.
// `db.password` below falls back to '' for dev convenience, so the guard has
// to reject unset AND empty explicitly or prod could boot passwordless.
if (isProd && (process.env.DB_PASSWORD === undefined || process.env.DB_PASSWORD === '')) {
  throw new Error('FATAL: DB_PASSWORD environment variable is required in production');
}
// Case-insensitive: MySQL treats `root`, `ROOT` and `Root` as the same account.
if (isProd && String(process.env.DB_USER || '').toLowerCase() === 'root') {
  throw new Error('FATAL: DB_USER must not be the MySQL superuser in production');
}

// `DEBUG_ERRORS=1` re-enables raw SQL messages and stack traces in API
// responses (packages/lib/errors.js). Useful in dev, catastrophic in prod —
// refuse to boot rather than leak internals if it is left switched on.
//
// Only genuinely-on values trip the guard. Testing the raw string would make
// `DEBUG_ERRORS=0` — an operator explicitly turning the flag OFF — crash-loop
// production, since any non-empty string is truthy in JS.
const DEBUG_ERRORS_ON_VALUES = ['1', 'true', 'yes'];
const debugErrorsOn = DEBUG_ERRORS_ON_VALUES.includes(
  String(process.env.DEBUG_ERRORS || '').trim().toLowerCase(),
);
if (isProd && debugErrorsOn) {
  throw new Error('FATAL: DEBUG_ERRORS must not be set in production (leaks stack traces and SQL)');
}

const config = {
  NODE_ENV,
  isDev,
  isProd,
  isTest,
  port: Number(process.env.PORT) || 4000,

  jwt: {
    // `secret` kept for back-compat with legacy callers; new code should
    // prefer `accessSecret`.
    secret: JWT_ACCESS_SECRET,
    accessSecret: JWT_ACCESS_SECRET,
    refreshSecret: JWT_REFRESH_SECRET,
    accessTtl: process.env.JWT_ACCESS_TTL || process.env.JWT_EXPIRES_IN || '30m',
    refreshTtl: process.env.JWT_REFRESH_TTL || '7d',
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5000,http://127.0.0.1:5000,http://localhost:8080')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  },

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    // Dev-only fallbacks — production boot fails above when either is unset
    // or when DB_USER is the superuser (D-20260818-02).
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME || 'rbm_platform_dev',
  },

  // CBP Staff Portal SSO (D-20261110-01): must equal the CBP root JWT_SECRET.
  // Unset or empty turns POST /api/auth/cbp/accept off (404).
  cbp: {
    ssoJwtSecret: process.env.CBP_SSO_JWT_SECRET || undefined,
  },

  rateLimit: {
    // Allow operators to widen/narrow without code changes.
    admin: {
      windowMs: Number(process.env.RATE_LIMIT_ADMIN_WINDOW_MS) || 60 * 1000,
      max: Number(process.env.RATE_LIMIT_ADMIN_MAX) || 60,
    },
    general: {
      windowMs: Number(process.env.RATE_LIMIT_GENERAL_WINDOW_MS) || 60 * 1000,
      max: Number(process.env.RATE_LIMIT_GENERAL_MAX) || 300,
    },
  },
};

module.exports = config;
