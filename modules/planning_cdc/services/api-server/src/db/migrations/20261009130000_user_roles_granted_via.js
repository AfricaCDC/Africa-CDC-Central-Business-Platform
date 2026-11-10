/**
 * Division-derived global roles follow user_divisions (D-20261009-03).
 *
 * Global roles FOCAL_PERSON / HEAD_OF_DIVISION / DIRECTOR / ME_OFFICER were
 * granted whenever a user received the matching division role and never
 * revoked, so a user who moved from Head of DG to Director of PHAHM still
 * carried HEAD_OF_DIVISION and FOCAL_PERSON. user_roles had no provenance, so
 * nothing could tell those rows apart from an admin's manual grant.
 *
 * 1. Adds `user_roles.granted_via` (nullable, 'division' when
 *    divisionAssignmentService owns the row, NULL for admin grants).
 * 2. Backfill, per (user, derived role):
 *    · backed by a user_divisions row with that role → granted_via = 'division'
 *      (inserted when missing);
 *    · FOCAL_PERSON / HEAD_OF_DIVISION / DIRECTOR with no backing row → deleted
 *      (these roles mean nothing without a division: their RBAC scope is the
 *      division);
 *    · ME_OFFICER with no backing row → kept, granted_via NULL (the central
 *      M&E team holds this role manually).
 * 3. Every user with at least one user_divisions row (any role, MEMBER
 *    included) is granted STAFF when missing. STAFF is never revoked.
 *
 * Idempotent: a second run finds every row already classified. Down drops the
 * column and keeps the rows.
 */

const { createLogger } = require('@rbm/lib/logger');
const { DIVISION_ASSIGNMENT_ROLES: R } = require('@rbm/lib/user-divisions');
const { ROLES } = require('@rbm/lib/roles');

const log = createLogger('api-server').child({ module: 'migration.userRolesGrantedVia' });

const GRANTED_VIA_DIVISION = 'division';
const DERIVED = [R.FOCAL_PERSON, R.HEAD_OF_DIVISION, R.DIRECTOR, R.ME_OFFICER];
// Roles that are meaningless without a division row: orphans are revoked.
const DIVISION_ONLY = [R.FOCAL_PERSON, R.HEAD_OF_DIVISION, R.DIRECTOR];

/**
 * Classify existing rows and add the missing ones.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 * @example
 * await exports.up(knex);
 */
exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('user_divisions'))) return;
  if (!(await knex.schema.hasColumn('user_roles', 'granted_via'))) {
    await knex.schema.alterTable('user_roles', (t) => {
      t.string('granted_via', 16).nullable();
    });
  }

  const totals = { marked: 0, granted: 0, revoked: 0, staff_granted: 0 };
  await knex.transaction(async (trx) => {
    const roles = await trx('roles').whereIn('code', DERIVED).select('id', 'code');
    const codeById = new Map(roles.map((r) => [r.id, r.code]));
    const idByCode = new Map(roles.map((r) => [r.code, r.id]));

    const held = new Set(
      (await trx('user_divisions').whereIn('role', DERIVED).select('user_id', 'role'))
        .map((r) => `${r.user_id}:${r.role}`),
    );
    const userRoles = await trx('user_roles')
      .whereIn('role_id', [...codeById.keys()])
      .select('id', 'user_id', 'role_id', 'granted_via');

    const present = new Set();
    for (const ur of userRoles) {
      const code = codeById.get(ur.role_id);
      const key = `${ur.user_id}:${code}`;
      present.add(key);
      if (held.has(key)) {
        if (ur.granted_via !== GRANTED_VIA_DIVISION) {
          await trx('user_roles').where('id', ur.id).update({ granted_via: GRANTED_VIA_DIVISION });
          totals.marked += 1;
        }
      } else if (DIVISION_ONLY.includes(code)) {
        await trx('user_roles').where('id', ur.id).del();
        totals.revoked += 1;
        log.info('user_role.revoked_orphan', { user_id: ur.user_id, role: code });
      }
    }

    for (const key of held) {
      if (present.has(key)) continue;
      const [userId, code] = key.split(':');
      const roleId = idByCode.get(code);
      if (!roleId) continue;
      await trx('user_roles').insert({ user_id: Number(userId), role_id: roleId, granted_via: GRANTED_VIA_DIVISION });
      totals.granted += 1;
    }

    // Minimum STAFF for anyone attached to a division.
    const staff = await trx('roles').where('code', ROLES.STAFF).first('id');
    if (staff) {
      const withDivision = new Set((await trx('user_divisions').select('user_id')).map((r) => r.user_id));
      const withStaff = new Set((await trx('user_roles').where('role_id', staff.id).select('user_id')).map((r) => r.user_id));
      for (const userId of withDivision) {
        if (withStaff.has(userId)) continue;
        await trx('user_roles').insert({ user_id: userId, role_id: staff.id, granted_via: GRANTED_VIA_DIVISION });
        totals.staff_granted += 1;
      }
    }
  });
  log.info('user_roles.granted_via_backfill_complete', totals);
};

/**
 * Drop the provenance column; rows stay as they are.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 * @example
 * await exports.down(knex);
 */
exports.down = async function (knex) {
  if (await knex.schema.hasColumn('user_roles', 'granted_via')) {
    await knex.schema.alterTable('user_roles', (t) => {
      t.dropColumn('granted_via');
    });
  }
};
