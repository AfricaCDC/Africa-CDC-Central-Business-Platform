// ── sync-service retry helper ──
//
// Exponential backoff with full jitter (T-08). Used by outbound HTTP calls to
// the CBP API and to api-server so transient 5xx / network errors don't
// cascade into a failed sync run.

/**
 * Run `fn` with exponential-backoff retries. Retries on network errors and
 * 5xx responses. Does NOT retry 4xx (those are deterministic client errors).
 *
 * @template T
 * @param {() => Promise<T>} fn — async thunk.
 * @param {object} opts
 * @param {number} opts.maxAttempts — total attempts including the first.
 * @param {number} opts.baseDelayMs — initial delay before first retry.
 * @param {number} opts.maxDelayMs — upper bound on any single delay.
 * @param {(err: *, attempt: number, nextDelayMs: number) => void} [opts.onRetry]
 * @returns {Promise<T>}
 */
async function withRetry(fn, opts) {
  const { maxAttempts, baseDelayMs, maxDelayMs, onRetry } = opts;
  let attempt = 0;
  let lastErr;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt >= maxAttempts) {
        throw err;
      }
      const exp = Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)));
      const delay = Math.floor(Math.random() * exp); // full jitter
      if (onRetry) onRetry(err, attempt, delay);
      await sleep(delay);
    }
  }
  throw lastErr;
}

/**
 * A request is retryable if it is a network error (no `response`) or if the
 * server returned 5xx / 429.
 *
 * @param {*} err
 * @returns {boolean}
 */
const RETRY_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED']);

function isRetryable(err) {
  if (!err) return false;
  if (err.code && RETRY_CODES.has(err.code)) return true;
  if (!err.response) return true; // network / no response at all
  const status = err.response.status;
  return status === 429 || (status >= 500 && status < 600);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { withRetry, isRetryable };
