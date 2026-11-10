// ── sync-service HTTP helper ──
//
// Thin wrapper around the global `fetch` (Node 18+). Adds:
//   - AbortController-based timeout
//   - JSON body/parse convenience
//   - throw-on-non-2xx with an error carrying `{ status, body }` so the retry
//     helper can decide whether to back off.

/**
 * HTTP error thrown on any non-2xx response. Mirrors axios's `err.response`
 * so `lib/retry.js`'s `isRetryable` can keep its existing checks.
 */
class HttpError extends Error {
  constructor(status, body, url) {
    super(`HTTP ${status} from ${url}`);
    this.name = 'HttpError';
    this.response = { status, data: body };
  }
}

/**
 * GET JSON with timeout.
 *
 * @param {string} url
 * @param {{ headers?: Record<string,string>, timeoutMs?: number }} [opts]
 * @returns {Promise<{data: any}>}
 */
async function getJson(url, opts) {
  const { headers, timeoutMs = 30000 } = opts || {};
  return doRequest(url, { method: 'GET', headers, timeoutMs });
}

/**
 * POST JSON with timeout.
 *
 * @param {string} url
 * @param {any} body
 * @param {{ headers?: Record<string,string>, timeoutMs?: number }} [opts]
 * @returns {Promise<{data: any}>}
 */
async function postJson(url, body, opts) {
  const { headers, timeoutMs = 30000 } = opts || {};
  return doRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: JSON.stringify(body),
    timeoutMs,
  });
}

async function doRequest(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    const text = await resp.text();
    const data = text ? tryParseJson(text) : null;
    if (!resp.ok) throw new HttpError(resp.status, data, url);
    return { data };
  } catch (err) {
    // AbortError from timeout → translate to code so retry helper recognises.
    if (err && err.name === 'AbortError') {
      const e = new Error(`Request timeout after ${init.timeoutMs}ms: ${url}`);
      e.code = 'ETIMEDOUT';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

module.exports = { getJson, postJson, HttpError };
