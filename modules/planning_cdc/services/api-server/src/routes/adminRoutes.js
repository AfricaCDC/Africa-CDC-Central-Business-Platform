/* eslint-disable max-lines --
 * adminRoutes is 504L at baseline, over the 200L routes cap. Cheap wins
 * (envelope migration, audit-literal eslint-disables) stay within the
 * ceiling; full split into users / org / partners / rbac sub-routers is
 * tracked as part of the adminService split (task #28).
 */
// ── Admin Routes ──
//
// All endpoints require a valid bearer token (router.use(authenticateToken)).
// Mutating endpoints additionally require an admin role via `requireAnyRole`.
// Sensitive write paths (user CRUD, role changes) emit audit log events for
// incident-response traceability.

const express = require('express');
const router = express.Router();
const { buildError, buildSuccess } = require('@rbm/lib/errors');
const s = require('../services/adminService');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticateToken } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/rbacMiddleware');
const { audit } = require('../middleware/auditLog');
const db = require('../config/db');
const divisionAssignmentService = require('../services/divisionAssignmentService');
const { realignMeStepsLater } = require('../services/approverRealign');

router.use(authenticateToken);

// A change of users, roles or units can change who is a unit's M&E officer:
// pending M&E sign-offs follow (D-20261022-01).
router.use((req, res, next) => {
  if (req.method !== 'GET' && /^\/(users|divisions)(\/|$)/.test(req.path)) {
    res.on('finish', () => { if (res.statusCode < 400) realignMeStepsLater(); });
  }
  next();
});

const STATUS_TO_CODE = {
  400: 'VALIDATION_FAILED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
};
function envelopeError(res, status, message, code) {
  return res.status(status).json(buildError(code || STATUS_TO_CODE[status] || 'INTERNAL_ERROR', message));
}

const canReadUsers = authorize({ module: 'users', action: 'read' });
const canCreateUsers = authorize({ module: 'users', action: 'create' });
const canUpdateUsers = authorize({ module: 'users', action: 'update' });
const canDeleteUsers = authorize({ module: 'users', action: 'delete' });
const canManageRolePermissions = authorize({ module: 'users', action: 'update' });
const canReadOrgTree = authorize({ module: 'org_structure', action: 'read' });
const canCreateOrg = authorize({ module: 'org_structure', action: 'create' });
const canUpdateOrg = authorize({ module: 'org_structure', action: 'update' });
const canDeleteOrg = authorize({ module: 'org_structure', action: 'delete' });

// ── Users ──
/**
 * List users (RBAC: ADMINS). Query forwarded to `getUsers` for filtering.
 *
 * @name GET /api/admin/users
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON array
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example
 * GET /api/admin/users?status=ACTIVE
 */
router.get('/users', canReadUsers, asyncHandler(async (req, res) => {
  res.json(await s.getUsers(req.query));
}));

/**
 * Fetch a user by id (RBAC: ADMINS).
 *
 * @name GET /api/admin/users/:id
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON row, 404 when not found
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example
 * GET /api/admin/users/7
 */
router.get('/users/:id', canReadUsers, asyncHandler(async (req, res) => {
  const u = await s.getUserById(req.params.id);
  if (!u) return envelopeError(res, 404, 'User not found');
  res.json(u);
}));

/**
 * Create a user (RBAC: ADMINS). Audits CREATE_USER event.
 *
 * @name POST /api/admin/users
 * @param {express.Request} req — body with user column values
 * @param {express.Response} res — 201 JSON with the created user
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example
 * POST /api/admin/users { email: 'jane@africacdc.org', ... }
 */
router.post('/users', canCreateUsers, asyncHandler(async (req, res) => {
  const u = await s.createUser(req.body);
  await audit(req, 'CREATE_USER', 'user', u && u.id, {
    email: u && u.email,
    full_name: u && u.full_name,
  });
  res.status(201).json(u);
}));

/**
 * Update a user (RBAC: ADMINS). Audits UPDATE_USER event.
 *
 * @name PUT /api/admin/users/:id
 * @param {express.Request} req — path `id`; body partial column values
 * @param {express.Response} res — 200 JSON with the updated user
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example
 * PUT /api/admin/users/7 { title: 'Dr' }
 */
router.put('/users/:id', canUpdateUsers, asyncHandler(async (req, res) => {
  const u = await s.updateUser(req.params.id, req.body);
  await audit(req, 'UPDATE_USER', 'user', req.params.id, {
    changes: Object.keys(req.body || {}),
  });
  res.json(u);
}));

// ── Roles ──
/**
 * List all roles.
 *
 * @name GET /api/admin/roles
 * @param {express.Request} _req
 * @param {express.Response} res — 200 JSON array
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/admin/roles
 */
router.get('/roles', asyncHandler(async (_req, res) => {
  res.json(await s.getRoles());
}));

/**
 * Fetch a role by id.
 *
 * @name GET /api/admin/roles/:id
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON row, 404 when not found
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/admin/roles/3
 */
router.get('/roles/:id', asyncHandler(async (req, res) => {
  const r = await s.getRoleById(req.params.id);
  if (!r) return envelopeError(res, 404, 'Role not found');
  res.json(r);
}));

/**
 * List roles assigned to a user (RBAC: ADMINS).
 *
 * @name GET /api/admin/users/:id/roles
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON array
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/admin/users/7/roles
 */
router.get('/users/:id/roles', canReadUsers, asyncHandler(async (req, res) => {
  res.json(await s.getUserRoles(req.params.id));
}));

/**
 * Grant a role to a user (RBAC: ADMINS). Audits ASSIGN_ROLE event.
 *
 * @name POST /api/admin/users/:id/roles
 * @param {express.Request} req — body `{ role_id }`
 * @param {express.Response} res — 200 JSON `{ ok: true }`
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example POST /api/admin/users/7/roles { role_id: 3 }
 */
router.post('/users/:id/roles', canUpdateUsers, asyncHandler(async (req, res) => {
  await s.assignRole(req.params.id, req.body.role_id);
  await audit(req, 'ASSIGN_ROLE', 'user', req.params.id, { role_id: req.body.role_id });
  res.json(buildSuccess(null));
}));

/**
 * Revoke a role from a user (RBAC: ADMINS). Audits REMOVE_ROLE event.
 *
 * @name DELETE /api/admin/users/:userId/roles/:roleId
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON `{ ok: true }`
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example DELETE /api/admin/users/7/roles/3
 */
router.delete('/users/:userId/roles/:roleId', canDeleteUsers, asyncHandler(async (req, res) => {
  await s.removeRole(req.params.userId, req.params.roleId);
  await audit(req, 'REMOVE_ROLE', 'user', req.params.userId, { role_id: req.params.roleId });
  res.json(buildSuccess(null));
}));

/**
 * Overwrite a role's permissions (RBAC: SYSTEM_ADMIN only). Audits UPDATE_ROLE_PERMISSIONS event.
 *
 * @name PUT /api/admin/roles/:id/permissions
 * @param {express.Request} req — body `{ permissions: Array|object }`
 * @param {express.Response} res — 200 JSON `{ ok: true }`
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example PUT /api/admin/roles/3/permissions { permissions: ['workplans.read'] }
 */
router.put('/roles/:id/permissions', canManageRolePermissions, asyncHandler(async (req, res) => {
  await s.updateRolePermissions(req.params.id, req.body.permissions);
  await audit(req, 'UPDATE_ROLE_PERMISSIONS', 'role', req.params.id, {
    permission_count: Array.isArray(req.body.permissions) ? req.body.permissions.length : 0,
  });
  res.json(buildSuccess(null));
}));

// ── Business Units ──
/**
 * List all business units.
 *
 * @name GET /api/admin/business-units
 * @param {express.Request} _req
 * @param {express.Response} res — 200 JSON array
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/admin/business-units
 */
router.get('/business-units', asyncHandler(async (_req, res) => {
  res.json(await s.getBusinessUnits());
}));

router.get('/units-of-measure', asyncHandler(async (_req, res) => {
  const db = require('../config/db');
  const rows = await db('units_of_measure').select('*').orderBy('id');
  res.json(rows);
}));

// ── Reference Data (read-only, from v3 spec) ──
/**
 * List reference tiers.
 *
 * @name GET /api/admin/tiers
 * @param {express.Request} _req
 * @param {express.Response} res — 200 JSON array
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/admin/tiers
 */
router.get('/tiers', asyncHandler(async (_req, res) => { res.json(await s.getTiers()); }));
/**
 * List strategic plan rows.
 *
 * @name GET /api/admin/strategic-plan
 * @param {express.Request} _req
 * @param {express.Response} res — 200 JSON array
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/admin/strategic-plan
 */
router.get('/strategic-plan', asyncHandler(async (_req, res) => { res.json(await s.getStrategicPlan()); }));
/**
 * List division codes.
 *
 * @name GET /api/admin/division-codes
 * @param {express.Request} _req
 * @param {express.Response} res — 200 JSON array
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/admin/division-codes
 */
router.get('/division-codes', asyncHandler(async (_req, res) => { res.json(await s.getDivisionCodes()); }));

// ── Division hierarchy (organigramme) ──
// Read: any admin can view the tree.
// Write: SYSTEM_ADMIN ONLY — per Lenny's request, only the system admin can
// reshape the org chart, so we restrict POST/PATCH/DELETE strictly.
// 2026-04-08: widened to ORG_EDITORS — now driven by the dynamic rbac_permissions table
// (module=org_structure). User management permissions are likewise driven by the
// rbac_permissions table (module=users).

/**
 * Flat division tree with `user_count` per row (RBAC: ADMINS). Frontend builds the tree from `parent_code`.
 *
 * @name GET /api/admin/divisions/tree
 * @param {express.Request} req — query `includeAliases=true` to include alias rows
 * @param {express.Response} res — 200 JSON array
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/admin/divisions/tree
 */
router.get('/divisions/tree', canReadOrgTree, asyncHandler(async (req, res) => {
  const includeAliases = String(req.query.includeAliases || '').toLowerCase() === 'true';
  res.json(await s.getDivisionTree({ includeAliases }));
}));

/**
 * Detailed division view with parent/ancestors/children/users/aliases (RBAC: ADMINS).
 *
 * @name GET /api/admin/divisions/:code
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON row, 404 when not found
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/admin/divisions/DPHI
 */
router.get('/divisions/:code', canReadOrgTree, asyncHandler(async (req, res) => {
  const d = await s.getDivisionDetail(req.params.code);
  if (!d) return envelopeError(res, 404, 'Division not found');
  res.json(d);
}));

/**
 * Create a division (RBAC: ORG_EDITORS). Audits CREATE_DIVISION event.
 *
 * @name POST /api/admin/divisions
 * @param {express.Request} req — body with `code`, `division_name`, ...
 * @param {express.Response} res — 201 JSON with the created row, 400/409 on validation/duplicate
 * @returns {Promise<void>}
 * @throws {Error} 500 on unexpected failure
 * @example POST /api/admin/divisions { code: 'NEW', division_name: 'New' }
 */
router.post('/divisions', canCreateOrg, asyncHandler(async (req, res) => {
  try {
    const d = await s.createDivision(req.body);
    // eslint-disable-next-line no-restricted-syntax -- 'division' is an audit-log entity_type taxonomy value, not an ENTITY_TYPES identifier.
    await audit(req, 'CREATE_DIVISION', 'division', d && d.code, { name: d && d.division_name });
    res.status(201).json(d);
  } catch (err) {
    // Surface validation / conflict errors as clean JSON without the stack.
    // Anything else propagates to the global error handler.
    if (err && err.status) return envelopeError(res, err.status, err.message, err.code);
    throw err;
  }
}));

/**
 * Update a division with cycle/alias/level_type validation (RBAC: ORG_EDITORS). Audits UPDATE_DIVISION.
 *
 * @name PATCH /api/admin/divisions/:code
 * @param {express.Request} req — body partial column values
 * @param {express.Response} res — 200 JSON with the updated row, 400 on cycle/alias issues
 * @returns {Promise<void>}
 * @throws {Error} 500 on unexpected failure
 * @example PATCH /api/admin/divisions/DPHI { division_name: '...' }
 */
router.patch('/divisions/:code', canUpdateOrg, asyncHandler(async (req, res) => {
  try {
    const d = await s.updateDivision(req.params.code, req.body);
    // eslint-disable-next-line no-restricted-syntax -- 'division' is an audit-log entity_type taxonomy value, not an ENTITY_TYPES identifier.
    await audit(req, 'UPDATE_DIVISION', 'division', req.params.code, {
      changes: Object.keys(req.body || {}),
    });
    res.json(d);
  } catch (err) {
    if (err && err.status) return envelopeError(res, err.status, err.message, err.code);
    throw err;
  }
}));

/**
 * Delete a division (RBAC: ORG_EDITORS). Refuses if children/users still reference it. Audits DELETE_DIVISION.
 *
 * @name DELETE /api/admin/divisions/:code
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON `{ ok: true }`, 409 when dependants remain
 * @returns {Promise<void>}
 * @throws {Error} 500 on unexpected failure
 * @example DELETE /api/admin/divisions/OBSOLETE
 */
router.delete('/divisions/:code', canDeleteOrg, asyncHandler(async (req, res) => {
  try {
    await s.deleteDivision(req.params.code);
    // eslint-disable-next-line no-restricted-syntax -- 'division' is an audit-log entity_type taxonomy value, not an ENTITY_TYPES identifier.
    await audit(req, 'DELETE_DIVISION', 'division', req.params.code, {});
    res.json(buildSuccess(null));
  } catch (err) {
    if (err && err.status) return envelopeError(res, err.status, err.message, err.code);
    throw err;
  }
}));
/**
 * Add a user_divisions assignment (multi-focal support).
 * @name POST /api/admin/divisions/:code/assignments
 */
router.post('/divisions/:code/assignments', canUpdateOrg, asyncHandler(async (req, res) => {
  const { user_id, role } = req.body;
  if (!user_id || !role) return res.status(400).json(buildError('VALIDATION_FAILED', 'user_id and role are required'));
  const { DIVISION_ASSIGNMENT_ROLE_LIST } = require('@rbm/lib/user-divisions');
  if (!DIVISION_ASSIGNMENT_ROLE_LIST.includes(role)) return res.status(400).json(buildError('VALIDATION_FAILED', `Invalid role: ${role}`));
  // Same write path as the user window: keeps division_codes holder columns
  // and user_divisions in sync, and demotes the previous single holder.
  await db.transaction((trx) => divisionAssignmentService.addDivisionRole(trx, {
    userId: Number(user_id), code: req.params.code, role,
  }));
  res.json(buildSuccess({ added: true }));
}));

/**
 * Remove a user_divisions assignment. Clears the division's holder column
 * when the removed user held it.
 * @name DELETE /api/admin/divisions/:code/assignments
 */
router.delete('/divisions/:code/assignments', canUpdateOrg, asyncHandler(async (req, res) => {
  const { user_id, role } = req.body;
  if (!user_id || !role) return res.status(400).json(buildError('VALIDATION_FAILED', 'user_id and role are required'));
  await db.transaction((trx) => divisionAssignmentService.removeDivisionRole(trx, {
    userId: Number(user_id), code: req.params.code, role,
  }));
  res.json(buildSuccess({ removed: true }));
}));

/**
 * List partners.
 *
 * @name GET /api/admin/partners
 * @param {express.Request} _req
 * @param {express.Response} res — 200 JSON array
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/admin/partners
 */
router.get('/partners', asyncHandler(async (_req, res) => { res.json(await s.getPartners()); }));
/**
 * The 55 AU member states `{ code, name, region }`, by name, from
 * `@rbm/lib/countries` (D-20261106-06).
 *
 * @name GET /api/admin/member-states
 * @param {express.Request} _req
 * @param {express.Response} res — 200 JSON array
 * @returns {Promise<void>}
 * @throws {never}
 * @example GET /api/admin/member-states
 */
router.get('/member-states', asyncHandler(async (_req, res) => { res.json(await s.getMemberStates()); }));

// ── RBAC Dynamic Permissions ──
const rbacService = require('../services/rbacService');

/**
 * GET /api/admin/rbac/matrix — full permission matrix (all roles × modules × actions).
 * SYSTEM_ADMIN only.
 */
router.get('/rbac/matrix', canManageRolePermissions, asyncHandler(async (_req, res) => {
  const data = await rbacService.getFullMatrix();
  res.json(buildSuccess(data));
}));

/**
 * PUT /api/admin/rbac/permission — upsert a single permission.
 * Body: { role_id, module_code, action_code, scope }
 */
router.put('/rbac/permission', canManageRolePermissions, asyncHandler(async (req, res) => {
  const { role_id, module_code, action_code, scope } = req.body;
  if (!role_id || !module_code || !action_code || !scope) {
    return envelopeError(res, 400, 'role_id, module_code, action_code, scope required');
  }
  const db = require('../config/db');
  const mod = await db('rbac_modules').where('code', module_code).first();
  const act = await db('rbac_actions').where('code', action_code).first();
  if (!mod || !act) return envelopeError(res, 404, 'Module or action not found');
  await rbacService.upsertPermission(role_id, mod.id, act.id, scope);
  await audit(req, 'RBAC_PERMISSION_UPDATE', 'rbac_permissions', null, { role_id, module_code, action_code, scope });
  res.json(buildSuccess(null));
}));

/**
 * DELETE /api/admin/rbac/permission — remove a permission.
 * Body: { role_id, module_code, action_code }
 */
router.delete('/rbac/permission', canManageRolePermissions, asyncHandler(async (req, res) => {
  const { role_id, module_code, action_code } = req.body;
  const db = require('../config/db');
  const mod = await db('rbac_modules').where('code', module_code).first();
  const act = await db('rbac_actions').where('code', action_code).first();
  if (!mod || !act) return envelopeError(res, 404, 'Module or action not found');
  const perm = await db('rbac_permissions').where({ role_id, module_id: mod.id, action_id: act.id }).first();
  if (perm) {
    await rbacService.deletePermission(perm.id);
    await audit(req, 'RBAC_PERMISSION_DELETE', 'rbac_permissions', perm.id, { role_id, module_code, action_code });
  }
  res.json(buildSuccess(null));
}));

module.exports = router;
