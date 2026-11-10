/**
 * Frontend structured logger — the single sanctioned client-side log sink.
 *
 * App code MUST use this instead of `console.*` (CLAUDE.md: "Disabling
 * no-console anywhere in app code → use the structured logger"). This module
 * is the ONE place allowed to touch `console`, and only via a single,
 * justified per-line disable below.
 *
 * Each call produces a structured record `{ ts, level, msg, ...context }`.
 * In development the record is mirrored to the browser console for visibility.
 * In production it stays silent by default — wire a transport (backend ingest,
 * Sentry, etc.) in `emit()` when one is chosen, without touching call sites.
 *
 * @example
 * import { logger } from '@/utils/logger';
 * try { await load(); } catch (err) { logger.error('reports.load_failed', { err }); }
 */

const isDev =
  typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

/**
 * Build and (in dev) emit a structured log record.
 *
 * @param {'debug'|'info'|'warn'|'error'} level - severity
 * @param {string} msg - stable, machine-friendly event key (e.g. `reports.load_failed`)
 * @param {object} [context] - structured fields (ids, error object, etc.)
 * @returns {void}
 */
function emit(level, msg, context = {}) {
  const record = { ts: new Date().toISOString(), level, msg, ...context };

  // Production: silent until a transport is wired here.
  if (!isDev) return;

  // eslint-disable-next-line no-console -- sole sanctioned console sink; app code logs via this module, never console directly (CLAUDE.md no-console rule)
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  sink(`[${level}] ${msg}`, record);
}

/**
 * Structured logger with one method per severity. Each takes a stable event
 * key and an optional structured context object.
 */
export const logger = {
  /** @param {string} msg @param {object} [context] */
  debug: (msg, context) => emit('debug', msg, context),
  /** @param {string} msg @param {object} [context] */
  info: (msg, context) => emit('info', msg, context),
  /** @param {string} msg @param {object} [context] */
  warn: (msg, context) => emit('warn', msg, context),
  /** @param {string} msg @param {object} [context] */
  error: (msg, context) => emit('error', msg, context),
};

export default logger;
