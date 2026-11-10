// ── cacheControl middleware ──
//
// Sets a `Cache-Control: private, max-age=<sec>` header on GET responses
// of reference-data endpoints so the browser (and any intermediate
// non-shared cache) holds them briefly. Combined with the Express
// ETag-based 304 path, this:
//   - keeps repeated navigations instant (served from memory cache)
//   - still validates on refresh (ETag check → 304 bytes-zero)
//   - never caches personal/sensitive data (`private`, not `public`)
//
// Only applied to specific GET routes — mutations MUST NOT be cached.
//
// IMPORTANT — max-age vs no-cache: `max-age=N, must-revalidate` lets the
// browser serve the response from its HTTP cache WITHOUT any network
// request for N seconds (must-revalidate only applies AFTER staleness).
// That is fatal on data the SAME user can edit in the UI: after a PATCH,
// the React Query refetch is answered from the browser cache and the page
// shows pre-edit data ("save works but nothing changes" — the org-chart
// rename bug). For those endpoints use `revalidate()` instead: `no-cache`
// stores the response but revalidates EVERY request via ETag — unchanged
// data still costs only a 0-byte 304, changed data arrives immediately.

'use strict';

/**
 * Time-based browser cache — ONLY for true reference data that no UI
 * mutates (tiers, partners, member states…).
 *
 * @param {number} seconds — max-age in seconds
 * @returns {import('express').RequestHandler}
 * @example app.use('/api/admin/tiers', cacheControl(300));
 */
function cacheControl(seconds) {
  const value = `private, max-age=${seconds}, must-revalidate`;
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.set('Cache-Control', value);
    }
    next();
  };
}

/**
 * Always-revalidate cache — for admin-EDITABLE data (org chart, division
 * codes). The browser keeps the body but re-asks the server each time;
 * Express's strong ETag turns unchanged responses into 0-byte 304s, so
 * repeated navigations stay cheap while writes are immediately visible.
 *
 * @returns {import('express').RequestHandler}
 * @example app.use('/api/admin/divisions', revalidate());
 */
function revalidate() {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.set('Cache-Control', 'private, no-cache');
    }
    next();
  };
}

module.exports = { cacheControl, revalidate };
