// ── Contract: every backend URL prefix is reachable through BOTH gateways ──
//
// CLAUDE.md "Gateway audit rule (MANDATORY)": a route present in the backend but
// missing from nginx.conf returns 404 in staging/production, and missing from the
// Vite proxy returns 404 in local dev. This is the exact class of integration bug
// ("marche en local, 404 en staging") this cleaning targets — so we automate the
// 3-way check instead of trusting a manual grep.
//
// The test derives the set of TOP-LEVEL URL prefixes the api-server mounts in
// app.js (e.g. /api, /uploads) and asserts each one is matched by:
//   1. an nginx `location` block in services/api-gateway/nginx.conf
//   2. a `proxy` key in services/web-app/vite.config.js
// Add a new app.use('/something', ...) prefix without wiring the gateways → RED.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');
const APP_JS = path.join(ROOT, 'services/api-server/src/app.js');
const NGINX = path.join(ROOT, 'services/api-gateway/nginx.conf');
const VITE = path.join(ROOT, 'services/web-app/vite.config.js');

/** First path segment of an Express mount, e.g. '/api/admin' -> '/api'. */
function topLevelPrefix(mountPath) {
  const seg = mountPath.replace(/^\//, '').split('/')[0];
  return `/${seg}`;
}

/** Distinct top-level prefixes mounted via app.use('<path>', ...) in app.js. */
function backendPrefixes() {
  const src = fs.readFileSync(APP_JS, 'utf8');
  const prefixes = new Set();
  const re = /app\.use\(\s*['"](\/[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    prefixes.add(topLevelPrefix(m[1]));
  }
  return [...prefixes];
}

describe('gateway 3-way audit — backend prefixes are proxied by nginx AND vite', () => {
  const prefixes = backendPrefixes();

  it('finds the expected backend mount prefixes', () => {
    // Sanity: at minimum the SPA-facing /api. The /uploads static mount is
    // gone (D-20261108-02): verification files live in SharePoint.
    expect(prefixes).toEqual(expect.arrayContaining(['/api']));
    expect(prefixes).not.toContain('/uploads');
  });

  describe.each(prefixes)('prefix %s', (prefix) => {
    it('has a matching nginx location block', () => {
      const nginx = fs.readFileSync(NGINX, 'utf8');
      // location /api/ , location /api , or a regex location ~ ^/api...
      const re = new RegExp(`location\\s+(=\\s*|~\\s*\\^?)?${prefix}(/|\\b)`);
      expect(nginx).toMatch(re);
    });

    it('has a matching vite proxy entry', () => {
      const vite = fs.readFileSync(VITE, 'utf8');
      const re = new RegExp(`['"]${prefix}['"]\\s*:`);
      expect(vite).toMatch(re);
    });
  });
});
