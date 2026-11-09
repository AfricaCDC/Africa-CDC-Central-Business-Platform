// ── API Key authentication middleware ──
//
// Checks the `X-API-Key` header (falls back to `?api_key=` query param
// for tools like Excel Power Query that can't easily inject custom
// headers) against the `api_keys` table. On success, attaches
// `req.apiKey = { id, scopes }`, schedules a usage-log row on response
// completion, and calls next().

'use strict';

const { verifyKey, KEY_PREFIX } = require('../services/apiKeyService');
const db = require('../config/db');

/**
 * Fire-and-forget insert into `api_key_usage_log`. Failures are
 * swallowed — the audit trail must never break the request path.
 */
function logUsage({ apiKeyId, method, path, query, statusCode, ip, userAgent, durationMs }) {
  db('api_key_usage_log').insert({
    api_key_id: apiKeyId,
    method: method.slice(0, 8),
    path: String(path).slice(0, 255),
    query: query ? String(query).slice(0, 1024) : null,
    status_code: statusCode,
    ip: ip ? String(ip).slice(0, 64) : null,
    user_agent: userAgent ? String(userAgent).slice(0, 255) : null,
    duration_ms: Number.isFinite(durationMs) ? Math.min(durationMs, 65535) : null,
  }).catch(() => { /* swallow — audit must not break the request */ });
}

/**
 * @param {string[]} [requiredScopes]
 * @returns {import('express').RequestHandler}
 */
/**
 * Pull the raw API key from (in order of preference):
 *  - `X-API-Key` header (curl, CLI, Power BI Desktop)
 *  - `Authorization: Bearer <key>` (OAuth-style clients)
 *  - `Authorization: Basic base64(<anything>:<key>)` (Power BI Service,
 *    Excel Online — their Web connector's "Basic auth" dialog. Any user
 *    string is accepted; only the password half is the real key.)
 *  - `?api_key=...` query param (fallback for tools that drop headers)
 */
function extractKey(req) {
  const header = req.headers['x-api-key'];
  if (header) return String(header);
  const auth = req.headers.authorization || req.headers.Authorization;
  if (auth && typeof auth === 'string') {
    if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
    if (/^Basic\s+/i.test(auth)) {
      try {
        const decoded = Buffer.from(auth.replace(/^Basic\s+/i, '').trim(), 'base64').toString('utf8');
        // Format is "<user>:<password>" — treat password half as the key.
        const idx = decoded.indexOf(':');
        if (idx >= 0) return decoded.slice(idx + 1);
        return decoded;
      } catch { /* fall through */ }
    }
  }
  return req.query.api_key ? String(req.query.api_key) : '';
}

/** Query string of the request without the `api_key` credential, for the usage log. */
function loggedQuery(req) {
  const raw = req.url.split('?')[1];
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  params.delete('api_key');
  for (const [name, value] of [...params]) if (value.startsWith(KEY_PREFIX)) params.delete(name);
  return params.toString() || null;
}

function apiKeyAuth(requiredScopes = []) {
  return async (req, res, next) => {
    const raw = extractKey(req);
    if (!raw) {
      res.status(401).json({ success: false, code: 'API_KEY_REQUIRED', message: 'X-API-Key header is required' });
      return;
    }
    const key = await verifyKey(String(raw)).catch(() => null);
    if (!key) {
      res.status(401).json({ success: false, code: 'API_KEY_INVALID', message: 'Invalid or revoked API key' });
      return;
    }
    if (requiredScopes.length) {
      const scopes = Array.isArray(key.scopes) ? key.scopes : [];
      const hasAll = requiredScopes.every((s) => scopes.includes(s));
      if (!hasAll) {
        // Log the rejected attempt so admins can spot misconfigured consumers.
        logUsage({
          apiKeyId: key.id,
          method: req.method,
          path: req.baseUrl + req.path,
          query: loggedQuery(req),
          statusCode: 403,
          ip: req.ip,
          userAgent: req.headers['user-agent'] || null,
          durationMs: 0,
        });
        res.status(403).json({ success: false, code: 'API_KEY_SCOPE_MISSING', message: `Key lacks required scope(s): ${requiredScopes.join(', ')}` });
        return;
      }
    }
    req.apiKey = key;

    // Stamp the response so we can record the final status + duration.
    const startedAt = Date.now();
    res.on('finish', () => {
      logUsage({
        apiKeyId: key.id,
        method: req.method,
        path: req.baseUrl + req.path,
        query: loggedQuery(req),
        statusCode: res.statusCode,
        ip: req.ip,
        userAgent: req.headers['user-agent'] || null,
        durationMs: Date.now() - startedAt,
      });
    });

    next();
  };
}

module.exports = { apiKeyAuth };
