/**
 * Per-format task queue with concurrency cap and backlog limit.
 *
 * Lightweight in-process implementation (≈40 LOC) instead of p-queue@8 (ESM-only)
 * or p-queue@6 (extra dep). Contract:
 *
 *   queue.submit(fn) → Promise<T>
 *     - runs fn() when concurrency slot is free (FIFO)
 *     - rejects with a `RateLimitError`-shaped error when backlog > cap
 *
 *   queue.stats() → { running, pending, concurrency, backlogLimit }
 *
 * The module exports a frozen registry keyed by format name, built from
 * `config.queue`. Callers look up by `format` and `submit` a render function.
 *
 * Single-instance assumption per master-plan §R-03: per-process concurrency.
 * For horizontal scaling, add Redis/SETNX leader election (Phase C follow-up).
 */

const { ApiError } = require('@rbm/lib/errors');
const config = require('../config');

class RateLimitedError extends ApiError {
  constructor(message, retryAfterSec) {
    super('RATE_LIMITED', message || 'Queue backlog exceeded', 429);
    this.retryAfterSec = retryAfterSec;
  }
}

/**
 * Create a format queue.
 *
 * @param {object} opts
 * @param {string} opts.name — format identifier used in log events.
 * @param {number} opts.concurrency — max in-flight tasks.
 * @param {number} opts.backlogLimit — max pending tasks (reject beyond this).
 * @returns {{
 *   submit: <T>(fn: () => Promise<T>) => Promise<T>,
 *   stats: () => { name: string, running: number, pending: number,
 *     concurrency: number, backlogLimit: number }
 * }}
 */
function createFormatQueue(opts) {
  const name = opts.name;
  const concurrency = Math.max(1, Number(opts.concurrency) || 1);
  const backlogLimit = Math.max(0, Number(opts.backlogLimit) || 0);

  const pending = [];
  let running = 0;

  const next = () => {
    while (running < concurrency && pending.length > 0) {
      const job = pending.shift();
      running += 1;
      Promise.resolve()
        .then(() => job.fn())
        .then(
          (value) => {
            running -= 1;
            job.resolve(value);
            next();
          },
          (err) => {
            running -= 1;
            job.reject(err);
            next();
          },
        );
    }
  };

  return Object.freeze({
    submit(fn) {
      if (pending.length >= backlogLimit) {
        const retryAfterSec = Math.min(30, Math.max(1, pending.length));
        return Promise.reject(
          new RateLimitedError(
            `${name} queue backlog exceeded (${pending.length}/${backlogLimit})`,
            retryAfterSec,
          ),
        );
      }
      return new Promise((resolve, reject) => {
        pending.push({ fn, resolve, reject });
        next();
      });
    },
    stats() {
      return { name, running, pending: pending.length, concurrency, backlogLimit };
    },
  });
}

const FORMATS = ['pdf', 'pptx', 'xlsx', 'docx', 'csv', 'zip'];

const queues = Object.freeze(
  FORMATS.reduce((acc, format) => {
    const concurrency = config.queue[format];
    acc[format] = createFormatQueue({
      name: format,
      concurrency,
      backlogLimit: concurrency * config.queue.backlogMultiplier,
    });
    return acc;
  }, {}),
);

/**
 * Snapshot of every queue's state, for `/health` and structured logging.
 *
 * @returns {Array<{ name: string, running: number, pending: number, concurrency: number, backlogLimit: number }>}
 */
function snapshot() {
  return FORMATS.map((f) => queues[f].stats());
}

module.exports = {
  createFormatQueue,
  queues,
  snapshot,
  RateLimitedError,
  FORMATS,
};
