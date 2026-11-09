// ── sync-service RBAC gate ──
//
// sync-service has no DB of its own, so it delegates permission checks to
// api-server's `/api/auth/me/permissions` endpoint (T-06). The caller's JWT
// is forwarded verbatim; api-server resolves the full permission map and we
// check whether `${module}.${action}` is present with scope `all`.
//
// Deny-by-default: any upstream failure translates to 503 (not silent pass).

const { ForbiddenError, UnauthorizedError, ServiceUnavailableError } = require('@rbm/lib/errors');
const config = require('../config');
const { getJson } = require('../lib/http');

/**
 * Build an Express middleware that requires `${module}:${action}:all` for the
 * authenticated user. Must be mounted AFTER `verifyToken` so `req.user` and
 * the raw bearer token are available.
 *
 * @param {{ module: string, action: string }} opts
 * @returns {import('express').RequestHandler}
 */
function requirePermission(opts) {
  const { module, action } = opts;
  const key = `${module}.${action}`;

  return async function rbacGate(req, _res, next) {
    if (!req.user) return next(new UnauthorizedError('Authentication required'));

    const authHeader = req.headers.authorization || '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return next(new UnauthorizedError('Authorization header required'));
    }

    try {
      const resp = await getJson(`${config.API_SERVER_URL}/api/auth/me/permissions`, {
        headers: { Authorization: authHeader },
        timeoutMs: 5000,
      });
      const permissions = (resp.data && resp.data.data && resp.data.data.permissions) || {};
      const scope = permissions[key];
      if (scope !== 'all') {
        return next(new ForbiddenError(`Insufficient permissions: ${module}:${action}`));
      }
      req.rbac = { module, action, scope };
      return next();
    } catch (err) {
      return next(translateUpstreamError(err, `${module}:${action}`));
    }
  };
}

function translateUpstreamError(err, permKey) {
  const status = err.response && err.response.status;
  if (status === 401) return new UnauthorizedError('Invalid or expired token');
  if (status === 403) return new ForbiddenError(`Insufficient permissions: ${permKey}`);
  return new ServiceUnavailableError('Permission service unavailable');
}

module.exports = { requirePermission };
