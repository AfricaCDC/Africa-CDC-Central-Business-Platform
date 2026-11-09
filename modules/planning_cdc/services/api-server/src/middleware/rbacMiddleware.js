// ── RBAC Middleware ──
//
// Express middleware factories for role-based access control. All errors
// are returned via the shared `buildError` envelope from `@rbm/lib/errors`
// so the frontend can render a consistent "Access denied" UI.
//
// Source of truth for role string literals is `@rbm/lib/roles` — never
// hardcode role names here.

const db = require('../config/db');
const {
  HTTP_STATUS,
  ERROR_CODES,
  buildError,
} = require('@rbm/lib/errors');
const { hasAnyRole } = require('@rbm/lib/roles');
const rbacService = require('../services/rbacService');

/**
 * Reject the request if `req.user` does not have ANY of the supplied roles.
 *
 * @param {...string} roles
 */
const requireAnyRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res
        .status(HTTP_STATUS.UNAUTHORIZED)
        .json(buildError(ERROR_CODES.UNAUTHORIZED, 'Authentication required'));
    }
    // eslint-disable-next-line no-restricted-syntax -- legacy role-group wrapper (requireAnyRole). Retained as a bridge for routes that have not yet migrated to the dynamic `authorize({ module, action })` middleware. Slated for deletion once all callers migrate (tracked alongside task #31).
    if (!hasAnyRole(req.user, roles)) {
      return res
        .status(HTTP_STATUS.FORBIDDEN)
        .json(buildError(ERROR_CODES.FORBIDDEN, 'Insufficient permissions for this resource'));
    }
    return next();
  };
};

/**
 * Allow the request if the user is the owner of the loaded entity, OR if
 * they have any of the escalation roles.
 */
const requireOwnerOrRole = (ownerField, ...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res
        .status(HTTP_STATUS.UNAUTHORIZED)
        .json(buildError(ERROR_CODES.UNAUTHORIZED, 'Authentication required'));
    }
    // eslint-disable-next-line no-restricted-syntax -- legacy role-group wrapper (requireOwnerOrRole). Same rationale as requireAnyRole above — bridge during migration to dynamic authorize().
    if (hasAnyRole(req.user, roles)) return next();
    if (req.entity && String(req.entity[ownerField]) === String(req.user.id)) {
      return next();
    }
    return res
      .status(HTTP_STATUS.FORBIDDEN)
      .json(buildError(ERROR_CODES.FORBIDDEN, 'Access denied: not owner and insufficient role'));
  };
};

/**
 * Load an entity from the DB onto `req.entity` for downstream middlewares.
 * Returns 404 (not 403) if missing — the user already passed authentication.
 */
const loadEntity = (tableName, idParam = 'id') => {
  return async (req, res, next) => {
    try {
      const id = req.params[idParam];
      const entity = await db(tableName).where({ id }).first();
      if (!entity) {
        return res
          .status(HTTP_STATUS.NOT_FOUND)
          .json(buildError(ERROR_CODES.NOT_FOUND, `${tableName} not found`));
      }
      req.entity = entity;
      return next();
    } catch (err) {
      return next(err);
    }
  };
};

// ── Dynamic RBAC middleware (Phase 2) ────────────────────────────────────────
// Database-driven permission checks. Use alongside or instead of requireAnyRole.
// Deny-by-default: missing (role, module, action) row = 403.
//
// Usage:
//   router.get('/workplans', authorize({ module: 'workplan', action: 'read' }), handler);
//   router.post('/workplans', authorize({ module: 'workplan', action: 'create' }), handler);

/**
 * Express middleware factory. Checks that the authenticated user has
 * permission for (module, action) in the rbac_permissions table.
 *
 * On success, sets `req.rbac = { scope, module, action }` for downstream use.
 *
 * @param {{ module: string, action: string }} opts
 * @returns {Function} Express middleware
 * @example
 * router.get('/budget', authorize({ module: 'budget', action: 'read' }), handler);
 */
const authorize = ({ module, action }) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res
        .status(HTTP_STATUS.UNAUTHORIZED)
        .json(buildError(ERROR_CODES.UNAUTHORIZED, 'Authentication required'));
    }

    try {
      const result = await rbacService.checkPermission(req.user.id, module, action);
      if (!result.allowed) {
        return res
          .status(HTTP_STATUS.FORBIDDEN)
          .json(buildError(ERROR_CODES.FORBIDDEN, `Insufficient permissions: ${module}:${action}`));
      }

      req.rbac = { scope: result.scope, module, action };
      return next();
    } catch (err) {
      return next(err);
    }
  };
};

/**
 * Express middleware that provides `req.applyScope(query)` — a helper
 * function to apply row-level scope filtering to a Knex query builder.
 * Must be used AFTER `authorize()`.
 *
 * @param {object} [opts]
 * @param {string} [opts.ownerColumn='created_by_user_id']
 * @param {string} [opts.divisionColumn='responsible_division_code']
 * @returns {Function} Express middleware
 * @example
 * router.get('/reports', authorize({...}), withScope(), handler);
 * // In handler: const query = req.applyScope(db('reports'));
 */
const withScope = (opts = {}) => {
  return (req, res, next) => {
    req.applyScope = (query) => {
      if (!req.rbac) return query; // no authorize() ran before
      return rbacService.applyScope(query, req.rbac.scope, req.user, opts);
    };
    return next();
  };
};

module.exports = { requireAnyRole, requireOwnerOrRole, loadEntity, authorize, withScope };
