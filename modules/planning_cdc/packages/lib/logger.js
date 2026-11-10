/**
 * @rbm/lib/logger — structured JSON logger.
 *
 * Every log line is a single JSON object written to stdout:
 *   { ts, level, service, traceId, msg, ...extra }
 *
 * Prefers `pino` if installed (production-grade, fast). Falls back to a
 * zero-dependency stdout writer that emits the same shape — so call sites
 * never need to know which backend is active.
 *
 * Log level is controlled by `LOG_LEVEL` env var (default `info`). Values:
 *   trace < debug < info < warn < error < fatal
 *
 * Usage:
 *
 *   const { createLogger } = require('@rbm/lib/logger');
 *   const log = createLogger('api-server');
 *   log.info('server.started', { port: 4000 });
 *
 *   // Request-scoped child:
 *   const reqLog = log.child({ traceId: req.id, userId: req.user?.id });
 *   reqLog.warn('slow.query', { ms: 1200 });
 */

const LEVELS = Object.freeze({
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
});

/**
 * Resolve the active log-level threshold from `LOG_LEVEL` env var.
 * Unknown values fall back to `info` (numeric 30).
 *
 * @returns {number}
 */
function resolveThreshold() {
  const raw = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return LEVELS[raw] != null ? LEVELS[raw] : LEVELS.info;
}

let pinoBackend = null;
try {
  pinoBackend = require('pino');
} catch {
  pinoBackend = null;
}

/**
 * Accept both call orders: ours `(msg, ctx)` and pino's `(ctx, msg)`. Some
 * call sites use the pino order, which logged the context object as `msg`
 * and dropped the message.
 *
 * @param {*} a
 * @param {*} b
 * @returns {[*, object|undefined]} `[msg, extra]`
 * @example
 * normalizeArgs({ n: 1 }, 'done'); // ['done', { n: 1 }]
 */
function normalizeArgs(a, b) {
  if (a && typeof a === 'object' && typeof b === 'string') return [b, a];
  return [a, b];
}

/**
 * Zero-dep fallback writer. Emits one JSON line per log call.
 *
 * @param {string} service
 * @param {Record<string, *>} baseContext
 * @param {number} threshold
 * @returns {{[level: string]: (msg: string, extra?: object) => void, child: Function}}
 */
function createFallbackLogger(service, baseContext, threshold) {
  const emit = (level, msg, extra) => {
    if (LEVELS[level] < threshold) return;
    const line = {
      ts: new Date().toISOString(),
      level,
      service,
      ...baseContext,
      msg,
      ...(extra && typeof extra === 'object' ? extra : {}),
    };
    process.stdout.write(`${JSON.stringify(line)}\n`);
  };
  const api = {};
  for (const level of Object.keys(LEVELS)) {
    api[level] = (a, b) => emit(level, ...normalizeArgs(a, b));
  }
  /**
   * Create a request-scoped child logger inheriting this logger's service
   * name and base context, augmented with `context`.
   *
   * @param {Record<string, *>} context
   * @returns {typeof api}
   */
  api.child = (context) => createFallbackLogger(service, { ...baseContext, ...(context || {}) }, threshold);
  return api;
}

/**
 * Wrap a pino logger with our canonical API (service / traceId / child).
 *
 * @param {*} p — pino instance.
 * @param {string} service
 * @returns {{[level: string]: (msg: string, extra?: object) => void, child: Function}}
 */
function wrapPino(p, service) {
  const api = {};
  for (const level of Object.keys(LEVELS)) {
    api[level] = (a, b) => {
      const [msg, extra] = normalizeArgs(a, b);
      // pino expects (obj, msg) where obj becomes the JSON fields.
      if (extra && typeof extra === 'object') p[level]({ ...extra }, msg);
      else p[level](msg);
    };
  }
  api.child = (context) => wrapPino(p.child({ ...(context || {}) }), service);
  return api;
}

/**
 * Build a logger for a service. Every emitted line includes
 * `{ ts, level, service, ...base, msg }`.
 *
 * @param {string} serviceName — short service identifier (e.g. `'api-server'`).
 * @param {Record<string, *>} [baseContext] — optional base context added to
 *   every line (e.g. deployment id).
 * @returns {{
 *   trace: (msg: string, extra?: object) => void,
 *   debug: (msg: string, extra?: object) => void,
 *   info:  (msg: string, extra?: object) => void,
 *   warn:  (msg: string, extra?: object) => void,
 *   error: (msg: string, extra?: object) => void,
 *   fatal: (msg: string, extra?: object) => void,
 *   child: (context: Record<string, *>) => object,
 * }}
 * @throws {TypeError} when `serviceName` is not a non-empty string.
 * @example
 *   const log = createLogger('notification-service');
 *   log.info('dispatch.ok', { channel: 'email', templateId: 'welcome' });
 */
function createLogger(serviceName, baseContext) {
  if (!serviceName || typeof serviceName !== 'string') {
    throw new TypeError('createLogger: serviceName must be a non-empty string');
  }
  const threshold = resolveThreshold();
  const base = baseContext && typeof baseContext === 'object' ? baseContext : {};
  if (pinoBackend) {
    const p = pinoBackend({
      level: (process.env.LOG_LEVEL || 'info').toLowerCase(),
      base: { service: serviceName, ...base },
      timestamp: () => `,"ts":"${new Date().toISOString()}"`,
      formatters: {
        level: (label) => ({ level: label }),
      },
    });
    return wrapPino(p, serviceName);
  }
  return createFallbackLogger(serviceName, base, threshold);
}

module.exports = { createLogger, LEVELS };
