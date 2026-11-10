// ── RBM Sync Service ──
// Handles periodic synchronization with CBP (Capacity Building Platform).
// Part of the Africa CDC RBM Platform microservices.
//
// DECISION LOG (2026-04-15)
//   D-03 — /api/admin/sync-staff is now implemented in api-server; this
//          service authenticates to it via serviceToken (D-07).
//   D-04 — AMERT cron REMOVED. AMERT tables are empty; re-enable once data
//          lands. FOLLOW_UP tracked in config.js.

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const { errorHandler } = require('@rbm/lib/errors');
const { createLogger } = require('@rbm/lib/logger');

const config = require('./config');
const syncRoutes = require('./routes/sync');
const syncCbpStaff = require('./jobs/sync-cbp-staff');
const { verifyToken } = require('./middleware/auth');
const { createMutex } = require('./lib/mutex');

const log = createLogger('sync-service');
const app = express();

// Honor X-Forwarded-For from the gateway (single hop).
app.set('trust proxy', 1);

// ── Sync state (in-process, single-instance-only; see T-05 FOLLOW_UP) ──
const syncState = {
  cbp: { lastRun: null, status: 'idle', error: null, lastResult: null },
};

// Concurrency guards — cron + manual trigger cannot overlap (T-12).
const cbpMutex = createMutex('cbp-sync');

app.locals.syncState = syncState;
app.locals.cbpMutex = cbpMutex;
app.locals.log = log;

// ── Middleware ──
// Note: helmet intentionally NOT mounted here — security headers are enforced
// at the nginx gateway (CSP-02).
app.use(cors({
  origin: config.CORS_ORIGINS,
  credentials: true,
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '1mb' }));

app.use(rateLimit({
  windowMs: 60 * 1000,
  max: config.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ── Health check (PUBLIC — required for probes) ──
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'rbm-sync-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    syncState,
  });
});

// ── Auth gate (everything below requires a valid bearer token) ──
app.use(verifyToken);

// ── Routes ──
app.use('/', syncRoutes);

// ── Canonical error handler (MUST be mounted last) ──
app.use(errorHandler);

// ── Scheduled Jobs ──
if (config.CRON_ENABLED) {
  cron.schedule(
    config.CBP_SYNC_CRON,
    async () => {
      const release = cbpMutex.tryAcquire('cron');
      if (!release) {
        log.warn('cbp.cron.skipped', { reason: 'already running', heldBy: cbpMutex.heldBy() });
        return;
      }
      log.info('cbp.cron.started');
      syncState.cbp.status = 'running';
      syncState.cbp.lastRun = new Date().toISOString();
      try {
        const result = await syncCbpStaff.run({ log });
        syncState.cbp.status = 'completed';
        syncState.cbp.error = null;
        syncState.cbp.lastResult = result;
        log.info('cbp.cron.completed', result);
      } catch (err) {
        syncState.cbp.status = 'failed';
        syncState.cbp.error = err.message;
        log.error('cbp.cron.failed', { err: err.message });
      } finally {
        release();
      }
    },
    { timezone: config.CRON_TIMEZONE },
  );
  log.info('cron.scheduled', { job: 'cbp', spec: config.CBP_SYNC_CRON, tz: config.CRON_TIMEZONE });
}

// ── Start server ──
app.listen(config.PORT, '0.0.0.0', () => {
  log.info('server.started', { port: config.PORT });
});

module.exports = app;
