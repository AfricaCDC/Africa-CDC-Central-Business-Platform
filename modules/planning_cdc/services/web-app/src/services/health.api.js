// ── health.api.js ──
//
// Connectivity probe for the BackendStatusBanner. Deliberately does NOT use
// the shared axios `api` client (baseURL `/api`, auth header, envelope
// unwrapping): this is a raw liveness check of the edge `/health` route, which
// proxies nginx → api-gateway → api-server → DB. A 200 means the whole chain
// is back. Kept out of components so the no-api-url-in-component / no-useeffect
// -fetch rules stay satisfied (CHARTER §8) — this is infra liveness, not app
// data fetching via TanStack Query.

const HEALTH_URL = '/health';

/**
 * Probe the backend edge health endpoint.
 *
 * @returns {Promise<boolean>} true when the backend answers 200 (chain alive),
 *   false on any non-200 or network failure.
 * @example
 * if (await isBackendHealthy()) hideReconnectingBanner();
 */
export async function isBackendHealthy() {
  try {
    const res = await fetch(HEALTH_URL, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}
