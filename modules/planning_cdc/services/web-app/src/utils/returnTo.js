// ── Return to the page a signed-out user asked for (D-20261105-10) ──
// A link from an email (e.g. /decide/311?d=approve) sends a signed-out
// user to /login; after sign-in, with a password or Microsoft, they come
// back to that page instead of the home page.

/** An app path, never `//host` or `/\host`, with no space or control character
 * (a tab in `/<TAB>/evil.com` is dropped by the browser, leaving `//evil.com`). */
// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const SAFE_PATH = /^\/(?![/\\])[^\s\u0000-\u001F\u007F]*$/;

/**
 * Whether a path is safe to navigate to after sign-in (D-20261108-02). Same
 * rule for `?return_to=` here and the Microsoft callback.
 *
 * @param {string|null|undefined} path
 * @returns {boolean}
 * @example isSafePath('/decide/3') // true; isSafePath('//evil.com') // false
 */
export const isSafePath = (path) => typeof path === 'string' && path.length <= 512 && SAFE_PATH.test(path);

/**
 * The safe return path carried by `?return_to=`, or null.
 *
 * @param {URLSearchParams} params
 * @returns {string|null}
 * @example safeReturnTo(new URLSearchParams('return_to=%2Fdecide%2F3')) // '/decide/3'
 */
export function safeReturnTo(params) {
  const path = params.get('return_to');
  return isSafePath(path) && !path.startsWith('/login') ? path : null;
}

/**
 * The /login URL that brings the user back to `location` after sign-in.
 * Already on /login (a session that ends while the sign-in page loads), it
 * keeps the page that /login was going to.
 *
 * @param {{ pathname: string, search?: string }} location
 * @returns {string}
 * @example loginUrlFor({ pathname: '/decide/3', search: '?d=approve' }) // '/login?return_to=%2Fdecide%2F3%3Fd%3Dapprove'
 */
export function loginUrlFor(location) {
  if (location.pathname === '/login') {
    const back = safeReturnTo(new URLSearchParams(location.search || ''));
    return back ? `/login?return_to=${encodeURIComponent(back)}` : '/login';
  }
  const path = `${location.pathname}${location.search || ''}`;
  return path === '/' ? '/login' : `/login?return_to=${encodeURIComponent(path)}`;
}
