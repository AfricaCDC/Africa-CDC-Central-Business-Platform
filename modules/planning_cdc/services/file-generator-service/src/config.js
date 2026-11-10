/**
 * file-generator-service / config.js — single source of truth for environment
 * configuration. No scattered `process.env.*` reads elsewhere in this service
 * (per master-plan §R-06, CSP-13).
 *
 * Fails fast on missing secrets (JWT_ACCESS_SECRET, STORAGE_SIGNING_SECRET).
 */

const parseList = (raw, fallback) =>
  (raw || fallback).split(',').map((s) => s.trim()).filter(Boolean);

const NODE_ENV = process.env.NODE_ENV || 'development';

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const SERVICE_TOKEN_SECRET = process.env.SERVICE_TOKEN_SECRET || JWT_ACCESS_SECRET;
const STORAGE_SIGNING_SECRET = process.env.STORAGE_SIGNING_SECRET || JWT_ACCESS_SECRET;

if (!JWT_ACCESS_SECRET) {
  throw new Error('FATAL: file-generator-service requires JWT_ACCESS_SECRET');
}
if (NODE_ENV === 'production') {
  if (JWT_ACCESS_SECRET.length < 32) {
    throw new Error('FATAL: JWT_ACCESS_SECRET must be ≥32 chars in production');
  }
  if (STORAGE_SIGNING_SECRET.length < 32) {
    throw new Error('FATAL: STORAGE_SIGNING_SECRET must be ≥32 chars in production');
  }
}

const config = Object.freeze({
  env: NODE_ENV,
  port: Number(process.env.PORT) || 3007,

  cors: {
    origins: parseList(process.env.CORS_ORIGINS, 'http://localhost:5000,http://localhost:5173'),
  },

  rateLimit: {
    generalMax: Number(process.env.RATE_LIMIT_GENERAL_MAX) || 60,
  },

  bodyLimitBytes: Number(process.env.BODY_LIMIT_BYTES) || 1024 * 1024,

  jwt: {
    accessSecret: JWT_ACCESS_SECRET,
  },

  serviceToken: {
    secret: SERVICE_TOKEN_SECRET,
    acceptedCallers: parseList(
      process.env.ACCEPTED_CALLERS,
      'api-server,sync-service,notification-service',
    ),
  },

  queue: {
    pdf:  Number(process.env.PDF_MAX)  || 2,
    pptx: Number(process.env.PPTX_MAX) || 4,
    xlsx: Number(process.env.XLSX_MAX) || 4,
    docx: Number(process.env.DOCX_MAX) || 4,
    csv:  Number(process.env.CSV_MAX)  || 8,
    zip:  Number(process.env.ZIP_MAX)  || 2,
    backlogMultiplier: Number(process.env.QUEUE_BACKLOG_MULTIPLIER) || 2,
  },

  limits: {
    pptxMaxSlides: Number(process.env.PPTX_MAX_SLIDES) || 50,
    zipMaxMembers: Number(process.env.ZIP_MAX_MEMBERS) || 20,
    streamThresholdBytes: Number(process.env.STREAM_THRESHOLD_BYTES) || 5 * 1024 * 1024,
    navigationTimeoutMs: Number(process.env.PDF_NAV_TIMEOUT_MS) || 15_000,
  },

  storage: {
    driver: process.env.STORAGE_DRIVER || 'disk',
    diskRoot: process.env.STORAGE_DISK_ROOT || '/tmp/rbm-file-generator',
    signingSecret: STORAGE_SIGNING_SECRET,
    linkTtlSeconds: Number(process.env.SIGNED_URL_TTL_SECONDS) || 3600,
    downloadBaseUrl: (process.env.DOWNLOAD_BASE_URL || 'http://localhost:3007').replace(/\/+$/, ''),
  },

  puppeteer: {
    headless: 'new',
    waitUntil: 'networkidle2',
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
    ],
  },
});

module.exports = config;
