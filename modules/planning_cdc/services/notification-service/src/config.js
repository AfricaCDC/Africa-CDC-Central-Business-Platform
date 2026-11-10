/**
 * notification-service / config.js — single source of truth for environment
 * configuration. No scattered `process.env.*` reads in the rest of the
 * codebase (per-service Phase-3 task T-20).
 */

const parseList = (raw, fallback) =>
  (raw || fallback).split(',').map((s) => s.trim()).filter(Boolean);

// A blank value or the literal `CHANGE_ME` placeholder means a secret has not
// been provisioned yet. We normalise both to `undefined` so the SMTP worker
// uses its safe dev-logger fallback instead of attempting (and failing) to
// authenticate against a real relay with a placeholder credential. Real
// delivery requires the actual Azure ACS user/secret in the environment.
const cleanSecret = (raw) => {
  const v = (raw || '').trim();
  return v && v.toUpperCase() !== 'CHANGE_ME' ? v : undefined;
};

const NODE_ENV = process.env.NODE_ENV || 'development';

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const SERVICE_TOKEN_SECRET = process.env.SERVICE_TOKEN_SECRET || JWT_ACCESS_SECRET;

if (!JWT_ACCESS_SECRET) {
  throw new Error('FATAL: notification-service requires JWT_ACCESS_SECRET');
}
if (NODE_ENV === 'production' && JWT_ACCESS_SECRET.length < 32) {
  throw new Error('FATAL: JWT_ACCESS_SECRET must be at least 32 characters in production');
}

const config = Object.freeze({
  env: NODE_ENV,
  port: Number(process.env.PORT) || 3005,

  cors: {
    origins: parseList(process.env.CORS_ORIGINS, 'http://localhost:5000,http://localhost:5173'),
  },

  rateLimit: {
    generalMax: Number(process.env.RATE_LIMIT_GENERAL_MAX) || 300,
  },

  jwt: {
    accessSecret: JWT_ACCESS_SECRET,
  },

  serviceToken: {
    secret: SERVICE_TOKEN_SECRET,
  },

  db: {
    host:     process.env.DB_HOST     || '127.0.0.1',
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME     || 'rbm_platform_dev',
    pool:     { min: 1, max: 5 },
  },

  smtp: {
    host:   cleanSecret(process.env.SMTP_HOST),
    port:   Number(process.env.SMTP_PORT) || 587,
    user:   cleanSecret(process.env.SMTP_USER),
    pass:   cleanSecret(process.env.SMTP_PASS),
    from:   process.env.SMTP_FROM || '"Africa CDC RBM" <noreply@africacdc.org>',
    domain: process.env.SMTP_MESSAGE_ID_DOMAIN || 'africacdc.org',
  },

  // Transport driver: 'smtp' (default) | 'graph' | 'composite' (Graph
  // primary, SMTP fallback). See src/transports/index.js (D-20260817-01).
  email: {
    driver: (process.env.EMAIL_DRIVER || 'smtp').toLowerCase(),
  },

  // Microsoft Graph app-only send (Mail.Send). Reuses the SSO Entra App
  // Registration credentials already present in the deploy env.
  graph: {
    tenantId:     cleanSecret(process.env.MS_TENANT_ID),
    clientId:     cleanSecret(process.env.MS_CLIENT_ID),
    clientSecret: cleanSecret(process.env.MS_CLIENT_SECRET),
    from:         process.env.GRAPH_FROM || process.env.SMTP_FROM || '"Africa CDC RBM" <noreply@africacdc.org>',
  },

  outbox: {
    // Worker tuning. Single-instance deploy assumption (master-plan §R-03).
    pollIntervalMs:  Number(process.env.OUTBOX_POLL_INTERVAL_MS)  || 3000,
    batchSize:       Number(process.env.OUTBOX_BATCH_SIZE)        || 10,
    maxAttempts:     Number(process.env.OUTBOX_MAX_ATTEMPTS)      || 5,
    concurrency:     Number(process.env.OUTBOX_SEND_CONCURRENCY)  || 5,
  },

  security: {
    // Allow-list for `reset_url` (F-010 open-redirect fix). Only hosts that
    // end with one of these suffixes are accepted; all others are rejected
    // at enqueue time. Localhost is accepted in non-production to support
    // `npm run dev`.
    resetUrlHostAllowlist: parseList(
      process.env.RESET_URL_HOST_ALLOWLIST,
      NODE_ENV === 'production' ? 'africacdc.org' : 'africacdc.org,localhost,127.0.0.1',
    ),
    appBaseUrl: (process.env.APP_URL || process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  },

  unsubscribe: {
    mailto: process.env.LIST_UNSUBSCRIBE_MAILTO || 'unsubscribe@africacdc.org',
    url:    process.env.LIST_UNSUBSCRIBE_URL    || null,
  },
});

module.exports = config;
