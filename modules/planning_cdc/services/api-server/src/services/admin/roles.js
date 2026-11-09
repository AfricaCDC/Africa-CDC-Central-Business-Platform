/* eslint-disable complexity --
 * Pre-existing legacy debt: assignRole carries a complexity of 14 (limit 10)
 * because of the HOD/DIRECTOR/FOCAL_PERSON/ME_OFFICER branching
 * + division-slot-vacancy checks. Behaviour-neutral extraction only —
 * refactor queued as task #48 (simplify assignRole auto-promote branching).
 */
// ── Admin Roles Service ──
//
// Extracted from `services/api-server/src/services/adminService.js` as the
// second service-layer commit of the task #28 split (commit 2/N,
// D-20260418-18). Six exports covering role listing, per-user role
// management, and the permissions-JSON blob editor.
//
// Consumed via the adminService facade — existing callers
// `require('../services/adminService')` continue to resolve these names
// through the parent aggregator's spread export.
//
// Note on cross-module dependency: `assignRole` invokes `updateDivision`
// to mirror role-implied division assignments (HOD/DIRECTOR →
// responsible_user_id, ME_OFFICER →
// m_and_e_user_id). `updateDivision` still lives inline in the parent
// facade (to be extracted in commit 4/N — admin/hierarchy.js). To avoid
// a circular require at module load, we lazy-require it from the parent
// inside the function body.

const db = require('../../config/db');

/**
 * List all roles ordered by id.
 *
 * @returns {Promise<Array<object>>} role rows
 * @throws {Error} when the DB query fails
 * @example
 * const roles = await getRoles();
 */
const getRoles = () => db('roles').orderBy('id');

/**
 * Fetch a role by id.
 *
 * @param {number|string} id — role id
 * @returns {Promise<object|undefined>} role row or undefined
 * @throws {Error} when the DB query fails
 * @example
 * const role = await getRoleById(3);
 */
const getRoleById = (id) => db('roles').where({ id }).first();

/**
 * List every role assigned to a user.
 *
 * @param {number|string} userId — user id
 * @returns {Promise<Array<object>>} role rows
 * @throws {Error} when the DB query fails
 * @example
 * const roles = await getUserRoles(7);
 */
const getUserRoles = (userId) =>
  db('user_roles')
    .join('roles', 'user_roles.role_id', 'roles.id')
    .where('user_roles.user_id', userId)
    .select('roles.*');

/**
 * Idempotently grant a role to a user. When the role maps onto a
 * division-level position (HOD/DIRECTOR → responsible_user_id,
 * ME_OFFICER → m_and_e_user_id) and the division slot is vacant, auto-promote the user onto the division row
 * via `updateDivision` so the assignment mirrors across every alias.
 *
 * @param {number|string} userId — user id
 * @param {number|string} roleId — role id
 * @returns {Promise<Array<number>|undefined>} knex insert ids, or undefined if the grant already exists
 * @throws {Error} when any underlying query fails
 * @example
 * await assignRole(7, 3);
 */
const assignRole = async (userId, roleId) => {
  const exists = await db('user_roles').where({ user_id: userId, role_id: roleId }).first();
  let insertResult;
  if (!exists) insertResult = await db('user_roles').insert({ user_id: userId, role_id: roleId });
  // The new rights apply on the user's next request, not after the cache TTL (D-20261108-02).
  require('../rbacService').invalidateUserPermissions(Number(userId));

  // Auto-promote: HOD/DIRECTOR/ME_OFFICER rôles imply the user becomes
  // the responsible/m_and_e on the division they belong to (and mirror
  // onto every alias of it via propagation in updateDivision). Focal
  // persons are user_divisions rows, not a division slot (D-20261106-09).
  const role = await db('roles').where('id', roleId).first();
  if (!role) return insertResult;
  const user = await db('users').where('id', userId).first();
  if (!user || !user.division_code) return insertResult;

  const division = await db('division_codes').where('code', user.division_code).first();
  if (!division) return insertResult;

  const patch = {};
  if (role.code === 'HEAD_OF_DIVISION' || role.code === 'DIRECTOR') {
    if (!division.responsible_user_id) patch.responsible_user_id = userId;
  }
  if (role.code === 'ME_OFFICER') {
    if (!division.m_and_e_user_id) patch.m_and_e_user_id = userId;
  }
  if (Object.keys(patch).length === 0) return insertResult;

  // Lazy-require to avoid a circular import during module load. The
  // parent facade spreads hierarchy exports (inline today, to be
  // extracted into ./hierarchy.js in commit 4/N). Lazy resolution means
  // this still works after the hierarchy split without any edit here.
  const { updateDivision } = require('../adminService');
  await updateDivision(division.code, patch);
  return insertResult;
};

/**
 * Revoke a role from a user.
 *
 * @param {number|string} userId — user id
 * @param {number|string} roleId — role id
 * @returns {Promise<number>} knex delete count
 * @throws {Error} when the delete fails
 * @example
 * await removeRole(7, 3);
 */
const removeRole = async (userId, roleId) => {
  const removed = await db('user_roles').where({ user_id: userId, role_id: roleId }).del();
  // A removed admin loses the rights on the next request (D-20261108-02).
  require('../rbacService').invalidateUserPermissions(Number(userId));
  return removed;
};

/**
 * Overwrite a role's permissions JSON blob.
 *
 * @param {number|string} roleId — role id
 * @param {object|Array<string>} permissions — new permissions payload (serialised as JSON)
 * @returns {Promise<number>} knex update count
 * @throws {Error} when the update fails
 * @example
 * await updateRolePermissions(3, { workplans: ['read', 'write'] });
 */
const updateRolePermissions = (roleId, permissions) =>
  db('roles').where({ id: roleId }).update({ permissions: JSON.stringify(permissions) });

module.exports = {
  getRoles,
  getRoleById,
  getUserRoles,
  assignRole,
  removeRole,
  updateRolePermissions,
};
