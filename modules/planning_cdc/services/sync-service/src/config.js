// ── sync-service config ──
//
// Single source of truth for every env-driven knob. Import this instead of
// sprinkling `process.env.*` across the service (T-15).

const PORT = Number(process.env.PORT) || 3006;

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const SERVICE_TOKEN_SECRET = process.env.SERVICE_TOKEN_SECRET;

const NODE_ENV = process.env.NODE_ENV || 'development';

// Native-run defaults (no Docker hostnames — see CLAUDE.md).
const API_SERVER_URL = process.env.API_SERVER_URL || 'http://localhost:4000';
const CBP_API_URL = process.env.CBP_API_URL || 'http://localhost:4001/api';
const CBP_API_KEY = process.env.CBP_API_KEY || '';

const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5000,http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_SYNC_MAX) || 60;

const CRON_ENABLED = process.env.ENABLE_CRON !== 'false';
const CBP_SYNC_CRON = process.env.CBP_SYNC_CRON || '0 2 * * *'; // daily 02:00
const CRON_TIMEZONE = process.env.CRON_TIMEZONE || 'Africa/Addis_Ababa';

// AMERT cron is intentionally REMOVED per decision D-04 (2026-04-15).
// FOLLOW_UP: re-enable AMERT cron once amert_* tables are populated.

// Retry policy for outbound HTTP calls (T-08).
const RETRY_MAX_ATTEMPTS = Number(process.env.SYNC_RETRY_MAX) || 5;
const RETRY_BASE_DELAY_MS = Number(process.env.SYNC_RETRY_BASE_MS) || 500;
const RETRY_MAX_DELAY_MS = Number(process.env.SYNC_RETRY_MAX_MS) || 10000;

// Batch size when forwarding records to api-server /api/admin/sync-staff.
const SYNC_STAFF_BATCH_SIZE = Number(process.env.SYNC_STAFF_BATCH_SIZE) || 100;

if (!JWT_ACCESS_SECRET) {
  throw new Error('FATAL: sync-service requires JWT_ACCESS_SECRET');
}
if (NODE_ENV === 'production' && JWT_ACCESS_SECRET.length < 32) {
  throw new Error('FATAL: JWT_ACCESS_SECRET must be at least 32 characters in production');
}
if (!SERVICE_TOKEN_SECRET) {
  throw new Error('FATAL: sync-service requires SERVICE_TOKEN_SECRET for service-to-service auth (D-07)');
}
if (NODE_ENV === 'production' && SERVICE_TOKEN_SECRET.length < 32) {
  throw new Error('FATAL: SERVICE_TOKEN_SECRET must be at least 32 characters in production');
}

module.exports = Object.freeze({
  PORT,
  NODE_ENV,
  JWT_ACCESS_SECRET,
  SERVICE_TOKEN_SECRET,
  API_SERVER_URL,
  CBP_API_URL,
  CBP_API_KEY,
  CORS_ORIGINS,
  RATE_LIMIT_MAX,
  CRON_ENABLED,
  CBP_SYNC_CRON,
  CRON_TIMEZONE,
  RETRY_MAX_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  SYNC_STAFF_BATCH_SIZE,
});
