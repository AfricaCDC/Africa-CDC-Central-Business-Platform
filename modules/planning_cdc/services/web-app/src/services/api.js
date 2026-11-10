/* eslint-disable no-restricted-syntax, complexity */
import axios from 'axios';
import { loginUrlFor } from '@/utils/returnTo';
import { DEFAULT_API_URL, withBase, stripBase } from '@/utils/basePath';

const API_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Handle 401 + normalise backend error envelope.
//
// The api-server returns these shapes depending on which route you hit:
//   - Canonical:         { success: false, message, code }
//   - Legacy routes:     { error: "string" }
//   - Deprecated:        { success: false, error: { code, message } }
//
// Rendering the object form directly in a <toast.error> call or a JSX
// expression crashes React with "Objects are not valid as a React child".
// To keep every existing caller (`err.response?.data?.error ?? 'fallback'`)
// working without a mass refactor, we FLATTEN the envelope here so that
// `err.response.data.error` is always a string by the time it leaves
// the interceptor. The original object is preserved under `error_obj`
// for any caller that wants the error code.
// Real-502 retry budget. Gateway now forwards 502/503/504 as-is (the
// previous soft-200 hack was removed 2026-04-18 — D-20260420-11). Retry
// GETs silently once or twice to absorb a hiccup, then let the error
// bubble up so the SPA can show a proper message.
const BAD_GATEWAY_MAX_RETRIES = 2;
const BAD_GATEWAY_BACKOFF_MS = [400, 1000];

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// Backend-reachability signal. We only dispatch on a state CHANGE so the
// reconnecting banner doesn't flicker on every request. A 502/503/504 or a
// network error (no response at all) means the backend is currently
// unreachable; any successful response means it's back.
let backendReachable = true;
const notifyBackendStatus = (reachable) => {
  if (reachable === backendReachable) return;
  backendReachable = reachable;
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(reachable ? 'api:backend-reachable' : 'api:backend-unreachable'));
  }
};

// A response that never arrived (connection refused, DNS, timeout with no HTTP
// status) is just as transient as a 502 — treat both the same for GET retries.
const isTransientGatewayError = (error) => {
  const status = error?.response?.status;
  if ([502, 503, 504].includes(status)) return true;
  // No response object at all → network/connection-level failure.
  return !error?.response && (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error' || error?.code === 'ECONNABORTED');
};

// ── Silent token refresh ──────────────────────────────────────────────
// The access token is short-lived (default 30m). Without renewal, the first
// request made after expiry returns 401 and the user is bounced to /login —
// which reads as "logged out after a moment". Instead, on a 401 we exchange
// the long-lived refresh token (7d) for a fresh access token ONCE and replay
// the original request. Only if the refresh itself fails do we log out.
//
// `refreshPromise` de-duplicates concurrent 401s: many in-flight requests that
// all expire at once share a SINGLE /auth/refresh call instead of stampeding.
let refreshPromise = null;

const refreshAccessToken = () => {
  if (refreshPromise) return refreshPromise;
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return Promise.reject(new Error('No refresh token'));
  refreshPromise = api
    .post('/auth/refresh', { refreshToken })
    .then((res) => {
      const newToken = res?.data?.accessToken || res?.data?.token;
      if (!newToken) throw new Error('Refresh returned no access token');
      localStorage.setItem('token', newToken);
      return newToken;
    })
    .finally(() => { refreshPromise = null; });
  return refreshPromise;
};

// Clear the session and bounce to /login. Single sink so the 401 paths stay
// in sync (token + user + refreshToken all wiped together). The sign-in page
// says the session expired and brings the user back to this page
// (D-20261105-10, D-20261108-01).
const forceLogout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('refreshToken');
  const back = loginUrlFor({ pathname: stripBase(window.location.pathname), search: window.location.search });
  window.location.href = withBase(`${back}${back.includes('?') ? '&' : '?'}reason=session_expired`);
};

api.interceptors.response.use(
  (response) => {
    // Legacy: pre-2026-04-20 cached nginx responses may still carry the
    // soft-200 `{success:true,data:null,_softBadGateway:true}` envelope.
    // Convert those cached successes into a real BAD_GATEWAY error so
    // callers react properly instead of silently rendering null.
    if (response.data && typeof response.data === 'object' && response.data._softBadGateway === true) {
      const err = new Error('Backend temporarily unavailable');
      err.response = { status: 502, data: { success: false, code: 'BAD_GATEWAY', message: 'Backend temporarily unavailable' }, headers: response.headers };
      err.config = response.config;
      throw err;
    }
    // Auto-unwrap canonical envelope so callers get the data directly
    if (response.data && typeof response.data === 'object' && response.data.success === true && 'data' in response.data) {
      response.data = response.data.data;
    }
    notifyBackendStatus(true); // any successful response = backend is back
    return response;
  },
  async (error) => {
    // Silent retry on transient gateway/network errors (GET only — mutations
    // never retry without idempotency keys).
    const cfg = error.config;
    const transient = isTransientGatewayError(error);
    if (
      cfg
      && transient
      && (cfg.method || 'get').toLowerCase() === 'get'
    ) {
      cfg._gwRetry = (cfg._gwRetry || 0) + 1;
      if (cfg._gwRetry <= BAD_GATEWAY_MAX_RETRIES) {
        await sleep(BAD_GATEWAY_BACKOFF_MS[cfg._gwRetry - 1] || 1000);
        return api.request(cfg);
      }
    }
    // Retries exhausted (or a mutation) and still a gateway/network failure →
    // signal the reconnecting banner. The raw BAD_GATEWAY envelope is never
    // shown directly: callers map it via getErrorMessage() to a friendly line.
    if (transient) notifyBackendStatus(false);

    // 401 handling. Try a SILENT refresh before giving up, so a merely-expired
    // access token never logs the user out. We skip refresh ONLY for the
    // refresh call itself to avoid recursion — every other route (incl. /auth/me) is eligible. Each request
    // is replayed at most once (`_authRetry` guard).
    //
    // Root cause of the "intempestive logout" (E-1, 2026-06-21): the previous
    // version (a) wrapped BOTH the refresh AND the replay in one try/catch, so
    // a replayed request that failed for a NON-auth reason (403 / 404 / 500 / a
    // transient 502) force-logged-out a perfectly valid session; and (b) fell
    // through to a blanket forceLogout() on ANY 401 from ANY route. We now log
    // out ONLY when the session is genuinely unrecoverable: no refresh token,
    // the refresh call itself fails, or a replayed request STILL 401s.
    const status = error.response?.status;
    const url = error.config?.url || '';
    const isRefreshCall = url.includes('/auth/refresh');
    if (status === 401 && error.config && !error.config._authRetry && !isRefreshCall) {
      error.config._authRetry = true;
      // No refresh token → the session can't be renewed; this is a real logout.
      if (!localStorage.getItem('refreshToken')) {
        forceLogout();
        return Promise.reject(error);
      }
      let newToken;
      try {
        newToken = await refreshAccessToken();
      } catch {
        // The refresh ITSELF failed → the session is dead. Only here do we log
        // out. (A failure of the replayed request below must NOT.)
        forceLogout();
        return Promise.reject(error);
      }
      // Refresh succeeded → replay ONCE with the fresh token. Let the replayed
      // request's own result/rejection propagate untouched: a 403/404/500 or a
      // transient gateway error on the replay is NOT an auth problem and must
      // never nuke a session that was just successfully renewed.
      error.config.headers = { ...(error.config.headers || {}), Authorization: `Bearer ${newToken}` };
      return api.request(error.config);
    }
    // A 401 that reaches here is a replayed request that STILL 401'd after a
    // successful refresh (`_authRetry` set) → the session is truly invalid.
    if (status === 401 && error.config?._authRetry) {
      forceLogout();
    }
    const data = error.response?.data;
    if (data && typeof data === 'object' && data.error && typeof data.error === 'object') {
      const original = data.error;
      data.error_obj = original;
      data.error = original.message || original.code || 'Request failed';
    }
    // Canonical envelope { success: false, message, code }: also expose the
    // message as `data.error` for the callers that still read that key.
    if (data && typeof data === 'object' && data.success === false && data.error === undefined && typeof data.message === 'string') {
      data.error = data.message;
    }
    return Promise.reject(error);
  },
);

/**
 * Authentication helpers wrapping the `/auth/*` endpoints and the
 * `localStorage` token / user cache.
 *
 * @example
 * authService.logout();
 * const me = authService.getCurrentUser();
 */
export const authService = {
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('refreshToken');
    window.location.href = withBase('/login');
  },

  /** @returns {boolean} true when an access token is stored */
  hasSession: () => !!localStorage.getItem('token'),

  /**
   * Load the signed-in user from /auth/me and cache it in storage.
   *
   * @returns {Promise<object|null>} the user, or null when the API sends none
   * @throws {Error} when the request fails
   */
  fetchProfile: async () => {
    const { data } = await api.get('/auth/me');
    const user = data && data.user ? data.user : null;
    if (user) localStorage.setItem('user', JSON.stringify(user));
    return user;
  },

  getCurrentUser: () => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      localStorage.removeItem('user');
      return null;
    }
  },

  /**
   * Complete a Microsoft SSO round-trip: persist the fragment tokens in the
   * token storage slots, then fetch + cache the profile.
   * Kept here (services layer) so the SSO landing component carries no token
   * storage, no hardcoded URL and no in-effect fetch.
   *
   * @param {{ accessToken: string, refreshToken?: string|null }} tokens
   * @returns {Promise<object>} the authenticated user
   * @throws {Error} when the profile cannot be loaded
   */
  completeSsoSession: async ({ accessToken, refreshToken }) => {
    localStorage.setItem('token', accessToken);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    const user = await authService.fetchProfile();
    if (!user) throw new Error('SSO profile load returned no user');
    return user;
  },
};

/**
 * Pre-configured Axios instance with the project's base URL, auth header
 * injection and unified error envelope normalisation.
 *
 * @type {import('axios').AxiosInstance}
 * @example
 * const { data } = await api.get('/workplans');
 */
export default api;
