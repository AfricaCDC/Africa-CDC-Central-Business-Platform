/**
 * @rbm/lib/logger — ESM mirror of ./logger.js. See that file for full docs.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export const LEVELS = Object.freeze({
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
});

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

/** @see logger.js#normalizeArgs */
function normalizeArgs(a, b) {
  if (a && typeof a === 'object' && typeof b === 'string') return [b, a];
  return [a, b];
}

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
  api.child = (context) => createFallbackLogger(service, { ...baseContext, ...(context || {}) }, threshold);
  return api;
}

function wrapPino(p, service) {
  const api = {};
  for (const level of Object.keys(LEVELS)) {
    api[level] = (a, b) => {
      const [msg, extra] = normalizeArgs(a, b);
      if (extra && typeof extra === 'object') p[level]({ ...extra }, msg);
      else p[level](msg);
    };
  }
  api.child = (context) => wrapPino(p.child({ ...(context || {}) }), service);
  return api;
}

/** @see logger.js#createLogger */
export function createLogger(serviceName, baseContext) {
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

export default { createLogger, LEVELS };
