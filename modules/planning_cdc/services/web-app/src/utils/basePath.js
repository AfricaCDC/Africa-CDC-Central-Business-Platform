// ── Sub-path deployment (D-20261110-01) ──
// Standalone the app lives at `/`. Embedded in the CBP it lives at
// `/staff/planning/` and Apache strips that prefix before the gateway. Vite's
// `base` (VITE_BASE_PATH, always ending with `/`) is the single source: every
// root-absolute URL the browser loads or navigates to goes through here.

/** `/` standalone, `/staff/planning/` embedded. */
export const BASE_URL = import.meta.env.BASE_URL;

/** BASE_URL without its trailing slash: `''` standalone, `/staff/planning` embedded. */
export const BASE_PREFIX = BASE_URL.replace(/\/$/, '');

/**
 * Prefix an app path (starting with `/`) with the deployment base.
 *
 * @param {string} path
 * @returns {string}
 * @example withBase('/login') // '/staff/planning/login' embedded, '/login' standalone
 */
export const withBase = (path) => `${BASE_PREFIX}${path}`;

/**
 * Inverse of `withBase`: the router path of a browser pathname.
 *
 * @param {string} pathname
 * @returns {string}
 * @example stripBase('/staff/planning/decide/3') // '/decide/3' embedded
 */
export const stripBase = (pathname) => (
  BASE_PREFIX && (pathname === BASE_PREFIX || pathname.startsWith(`${BASE_PREFIX}/`))
    ? pathname.slice(BASE_PREFIX.length) || '/'
    : pathname
);

/** Default API base: `${BASE_URL}api`. */
export const DEFAULT_API_URL = `${BASE_URL}api`;
