/**
 * Africa CDC RBM — file-generator-service entry point.
 *
 * Multi-format document generation sidecar (PDF, PPTX, XLSX, DOCX, CSV, ZIP).
 * Supersedes the retired PDF sidecar (D-20260415-08, D-20260415-15).
 *
 * Boot principles:
 *   - Canonical flat envelope (`@rbm/lib/errors`) — CSP-01.
 *   - No helmet here — CSP ownership lives at nginx-proxy / api-gateway.
 *   - Callee-only auth — accepts user JWT OR service token from local
 *     `ACCEPTED_CALLERS` allow-list. No outbound tokens signed.
 *   - Graceful SIGINT/SIGTERM: close HTTP listener, drain queues, close
 *     puppeteer browser (fixes F-008 from the phase1 audit).
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
const { snapshot: queueSnapshot } = require('./queue/formatQueue');

const log = createLogger('file-generator-service', { component: 'http' });
const app = express();

app.set('trust proxy', 'loopback');

app.use(cors({
  origin: config.cors.origins,
  credentials: true,
}));
app.use(morgan('combined'));
app.use(express.json({ limit: config.bodyLimitBytes }));

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
 * @example curl http://localhost:3007/health
 */
app.get('/health', (req, res) => {
  res.json(buildSuccess({
    status: 'ok',
    service: 'rbm-file-generator-service',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    queues: queueSnapshot(),
  }));
});

app.use((req, res) => {
  res.status(404).json(buildError('NOT_FOUND', `Route ${req.method} ${req.path} not found`));
});

app.use(errorHandler);

const server = app.listen(config.port, '0.0.0.0', () => {
  log.info('listening', {
    port: config.port,
    env: config.env,
    acceptedCallers: config.serviceToken.acceptedCallers,
    storageDriver: config.storage.driver,
  });
});

function shutdown(signal) {
  log.info('shutdown.signal', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
