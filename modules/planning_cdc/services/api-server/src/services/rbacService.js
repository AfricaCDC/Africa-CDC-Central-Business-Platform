/**
 * @module rbacService — Dynamic RBAC engine.
 *
 * Loads permissions from rbac_permissions (role × module × action → scope),
 * resolves the most permissive scope when a user has multiple roles, and
 * provides row-level scope filtering for Knex queries.
 *
 * Caching: 5 min per user. Invalidate on role assignment/removal.
 *
 * Resolution rules (D-20260416-09, task #32):
 *   1. An explicit 'deny' scope on ANY of the user's roles wins — the
 *      permission is denied even if other roles grant 'all'.
 *   2. Otherwise, the most permissive ALLOW scope across the user's roles
 *      wins ('own' < 'division' < 'directorate' < 'all').
 *   3. If no row matches AND the user holds an admin role
 *      (SYSTEM_ADMIN or RBM_ADMIN), the action is allowed at scope='all'.
 *   4. Otherwise, deny.
 *
 * This "admin-by-default unless explicit DENY" model means the matrix only
 * needs to enumerate carve-outs for admins, not every single (module, action)
 * row. Removing an action from the matrix does NOT lock out admins.
 */

'use strict';

const db = require('../config/db');
const { SCOPE_RANK, RBAC_SCOPES } = require('@rbm/lib/rbac');
// eslint-disable-next-line no-restricted-syntax -- rbacService IS the dynamic RBAC engine; it is the ONE legitimate consumer of ADMIN_ROLES, used exclusively for the admin-by-default short-circuit in checkPermission (D-20260416-09). Every OTHER caller must go through rbacService.checkPermission, which is why P-02 forbids ADMIN_ROLES elsewhere.
const { ADMIN_ROLES } = require('@rbm/lib/roles');

// ── In-memory cache ─────────────────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** @type {Map<number, { permissions: object, modules: string[], roles: string[], isAdmin: boolean, loadedAt: number }>} */
const cache = new Map();

/**
 * Load the full permission map for a user (union of all their roles).
 * Returns { permissions, modules, roles, isAdmin }.
 *
 * `permissions[key]` values include scope ('own'|'division'|'directorate'|'all')
 * AND the sentinel 'deny' when any of the user's roles carries an explicit
 * DENY on that (module, action). DENY is sticky — once set it cannot be
 * overwritten by an ALLOW from another role.
 *
 * @param {number} userId
 * @returns {Promise<{ permissions: object, modules: string[], roles: string[], isAdmin: boolean }>}
 */
async function loadUserPermissions(userId) {
  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && (now - cached.loadedAt) < CACHE_TTL_MS) {
    return cached;
  }

  // Fetch role IDs + role codes in one JOIN so we know whether the user
  // holds an admin role (SYSTEM_ADMIN / RBM_ADMIN) for the short-circuit
  // in checkPermission.
  const userRoleRows = await db('user_roles as ur')
    .join('roles as r', 'r.id', 'ur.role_id')
    .where('ur.user_id', userId)
    .select('r.id as role_id', 'r.code as role_code');

  const roleIds = userRoleRows.map(r => r.role_id);
  const roles = userRoleRows.map(r => r.role_code);
  // eslint-disable-next-line no-restricted-syntax -- see header: this is the ONE legitimate ADMIN_ROLES read in the backend (admin-by-default short-circuit in the RBAC engine itself).
  const isAdmin = roles.some(code => ADMIN_ROLES.includes(code));

  if (!roleIds.length) {
    const empty = { permissions: {}, modules: [], roles: [], isAdmin: false, loadedAt: now };
    cache.set(userId, empty);
    return empty;
  }

  // Load all permissions for these roles
  const rows = await db('rbac_permissions as p')
    .join('rbac_modules as m', 'm.id', 'p.module_id')
    .join('rbac_actions as a', 'a.id', 'p.action_id')
    .whereIn('p.role_id', roleIds)
    .andWhere('m.is_active', true)
    .select('m.code as module', 'a.code as action', 'p.scope');

  // Merge strategy:
  //   • 'deny' is sticky — once set on a key, no ALLOW from another role
  //     can overwrite it.
  //   • Among ALLOW rows, the most permissive scope wins.
  const permissions = {};
  const moduleSet = new Set();

  for (const row of rows) {
    const key = `${row.module}.${row.action}`;
    moduleSet.add(row.module);

    if (permissions[key] === RBAC_SCOPES.DENY) continue;
    if (row.scope === RBAC_SCOPES.DENY) {
      permissions[key] = RBAC_SCOPES.DENY;
      continue;
    }

    const existingRank = SCOPE_RANK[permissions[key]] || 0;
    const newRank = SCOPE_RANK[row.scope] || 0;
    if (newRank > existingRank) {
      permissions[key] = row.scope;
    }
  }

  const entry = {
    permissions,
    modules: Array.from(moduleSet).sort(),
    roles,
    isAdmin,
    loadedAt: now,
  };

  cache.set(userId, entry);
  return entry;
}

/**
 * Check if a user has permission for (module, action).
 *
 * Resolution (see module header for the full rule list):
 *   1. Explicit DENY → denied.
 *   2. Explicit ALLOW → allowed with that scope.
 *   3. No row AND user is admin (SYSTEM_ADMIN | RBM_ADMIN) → allowed at 'all'.
 *   4. Otherwise → denied.
 *
 * @param {number} userId
 * @param {string} module - e.g. 'workplan'
 * @param {string} action - e.g. 'create'
 * @returns {Promise<{ allowed: boolean, scope: string|null }>}
 * @example
 * const { allowed, scope } = await rbacService.checkPermission(7, 'workplan', 'create');
 */
async function checkPermission(userId, module, action) {
  const { permissions, isAdmin } = await loadUserPermissions(userId);
  const key = `${module}.${action}`;
  const entry = permissions[key];

  if (entry === RBAC_SCOPES.DENY) return { allowed: false, scope: null };
  if (entry) return { allowed: true, scope: entry };
  if (isAdmin) return { allowed: true, scope: RBAC_SCOPES.ALL };
  return { allowed: false, scope: null };
}

/**
 * Get the permission map for API response (frontend store).
 *
 * For admin users, synthesises an `isAdmin: true` flag and a `denies` array
 * of `module.action` keys with explicit DENY. The frontend combines them as:
 *   can(mod, act) =
 *     permissions[`${mod}.${act}`] is present AND not 'deny'
 *     OR (isAdmin AND `${mod}.${act}` NOT in denies)
 *
 * Legacy consumers that only read `permissions` + `modules` keep working —
 * they just won't see the admin-by-default carve-out, which is tolerable
 * (button hidden but backend will still allow). Admin UI should upgrade.
 *
 * @param {number} userId
 * @returns {Promise<{ permissions: object, modules: string[], isAdmin: boolean, denies: string[] }>}
 * @example
 * const map = await rbacService.getPermissionMap(req.user.id);
 */
async function getPermissionMap(userId) {
  const { permissions, modules, isAdmin } = await loadUserPermissions(userId);

  // Split denies out of the permissions map so frontend `key in permissions`
  // checks don't treat a DENY row as allowed.
  const allowed = {};
  const denies = [];
  for (const [key, scope] of Object.entries(permissions)) {
    if (scope === RBAC_SCOPES.DENY) denies.push(key);
    else allowed[key] = scope;
  }
  return { permissions: allowed, modules, isAdmin, denies };
}

/**
 * Apply row-level scope filtering to a Knex query.
 *
 * @param {import('knex').Knex.QueryBuilder} query
 * @param {string} scope - 'own' | 'division' | 'all'
 * @param {object} user - req.user (must have id, division_code)
 * @param {object} [opts]
 * @param {string} [opts.ownerColumn='created_by_user_id']
 * @param {string} [opts.divisionColumn='responsible_division_code']
 * @returns {import('knex').Knex.QueryBuilder}
 */
function applyScope(query, scope, user, opts = {}) {
  const ownerCol = opts.ownerColumn || 'created_by_user_id';
  const divCol = opts.divisionColumn || 'responsible_division_code';

  switch (scope) {
    case 'own':
      return query.where(ownerCol, user.id);
    // eslint-disable-next-line no-restricted-syntax -- 'division' is an rbac_permissions.scope column enum value (own|division|all), not an ENTITY_TYPES identifier.
    case 'division':
      return query.where(divCol, user.division_code);
    // eslint-disable-next-line no-restricted-syntax -- 'directorate' is an rbac_permissions.scope enum value, not an ENTITY_TYPES identifier.
    case 'directorate':
      // SECURITY (cleaning bug RBAC-1): 'directorate' previously fell through to
      // `default` and returned the UNFILTERED query — i.e. it silently behaved
      // like 'all', letting every DIRECTOR read/write every division's rows.
      // applyScope is synchronous, so the proper subtree walk (all division_codes
      // under the user's directorate) cannot be done here. Fail CLOSED to the
      // user's own division until the subtree resolver lands — narrower, never wider.
      // Follow-up (tracked in DECISIONS roadmap): replace with a directorate-subtree
      // `whereIn(divCol, [...codes])` once an async resolver feeds applyScope.
      return query.where(divCol, user.division_code);
    case 'all':
    default:
      return query;
  }
}

/**
 * Invalidate cached permissions for a user.
 * Call after role assignment/removal.
 *
 * @param {number} [userId] - if omitted, clears entire cache
 */
function invalidateUserPermissions(userId) {
  if (userId !== undefined && userId !== null) {
    cache.delete(userId);
  } else {
    cache.clear();
  }
}

/**
 * Get RBAC admin data: full module list, action list, and permission matrix.
 *
 * @returns {Promise<{ modules: Array, actions: Array, matrix: Array }>}
 */
async function getFullMatrix() {
  const [modules, actions, perms] = await Promise.all([
    db('rbac_modules').where('is_active', true).orderBy('sort_order'),
    db('rbac_actions').orderBy('sort_order'),
    db('rbac_permissions as p')
      .join('roles as r', 'r.id', 'p.role_id')
      .join('rbac_modules as m', 'm.id', 'p.module_id')
      .join('rbac_actions as a', 'a.id', 'p.action_id')
      .select('r.code as role', 'r.id as role_id', 'm.code as module', 'a.code as action', 'p.scope', 'p.id'),
  ]);
  return { modules, actions, matrix: perms };
}

/**
 * Upsert a single permission row.
 *
 * @param {number} roleId
 * @param {number} moduleId
 * @param {number} actionId
 * @param {string} scope - 'own' | 'division' | 'directorate' | 'all' | 'deny'
 * @returns {Promise<void>}
 */
async function upsertPermission(roleId, moduleId, actionId, scope) {
  const existing = await db('rbac_permissions')
    .where({ role_id: roleId, module_id: moduleId, action_id: actionId })
    .first();

  if (existing) {
    await db('rbac_permissions').where('id', existing.id).update({ scope, updated_at: db.fn.now() });
  } else {
    await db('rbac_permissions').insert({ role_id: roleId, module_id: moduleId, action_id: actionId, scope });
  }

  // Invalidate all users with this role
  const affected = await db('user_roles').where('role_id', roleId).select('user_id');
  affected.forEach(r => cache.delete(r.user_id));
}

/**
 * Delete a permission row.
 *
 * @param {number} permId
 * @returns {Promise<void>}
 */
async function deletePermission(permId) {
  const perm = await db('rbac_permissions').where('id', permId).first();
  if (perm) {
    await db('rbac_permissions').where('id', permId).del();
    const affected = await db('user_roles').where('role_id', perm.role_id).select('user_id');
    affected.forEach(r => cache.delete(r.user_id));
  }
}

module.exports = {
  loadUserPermissions,
  checkPermission,
  getPermissionMap,
  applyScope,
  invalidateUserPermissions,
  getFullMatrix,
  upsertPermission,
  deletePermission,
};
