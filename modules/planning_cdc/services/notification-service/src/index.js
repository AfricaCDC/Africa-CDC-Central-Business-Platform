/**
 * Africa CDC RBM — notification-service entry point.
 *
 * Phase-3 refactor (D-05):
 *   - Durable MySQL-backed outbox replaces the in-memory queue.
 *   - Canonical `{success, data|message, code}` envelope (CSP-01).
 *   - CSP (helmet) responsibility lives in nginx-proxy (CSP-02) — NOT here.
 *   - Worker (`./worker`) starts after the HTTP listener is up.
 */

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createLogger } = require('@rbm/lib/logger');
const {
  buildSuccess,
  buildError,
  errorHandler,
} = require('@rbm/lib/errors');
const config = require('./config');
const notificationRoutes = require('./routes/notifications');
const { verifyToken } = require('./middleware/auth');
const worker = require('./worker');

const log = createLogger('notification-service', { component: 'http' });
const app = express();

app.set('trust proxy', 1);

app.use(cors({
  origin: config.cors.origins,
  credentials: true,
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '1mb' }));

app.use(rateLimit({
  windowMs: 60 * 1000,
  max: config.rateLimit.generalMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json(buildError('RATE_LIMITED')),
}));

/**
 * GET /health — unauthenticated liveness probe.
 *
 * @example curl http://localhost:3005/health
 */
app.get('/health', (req, res) => {
  res.json(buildSuccess({
    status: 'ok',
    service: 'rbm-notification-service',
    version: '1.1.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    smtp: { configured: !!(config.smtp.host && config.smtp.user) },
  }));
});

app.use(verifyToken);
app.use('/', notificationRoutes);

app.use((req, res) => {
  res.status(404).json(buildError('NOT_FOUND', `Route ${req.method} ${req.path} not found`));
});

app.use(errorHandler);

const server = app.listen(config.port, '0.0.0.0', () => {
  log.info('listening', {
    port: config.port,
    smtpConfigured: !!(config.smtp.host && config.smtp.user),
    pollIntervalMs: config.outbox.pollIntervalMs,
  });
  worker.start();
});

function shutdown(signal) {
  log.info('shutdown.signal', { signal });
  worker.stop().catch(() => { /* noop */ });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
