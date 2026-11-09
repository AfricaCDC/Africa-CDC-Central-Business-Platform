// ── M&E approver pool (D-20261015-07) ──
//
// An M&E sign-off step goes to the M&E officer of the business unit (nearest
// division_codes.m_and_e_user_id up the chain). When the unit has none, the
// step stays unassigned (approver_id NULL, decision PENDING): any active M&E
// officer may decide it, and every one of them is reminded. It used to fall
// back to the first M&E officer by id, so one person received every sign-off.

'use strict';

const { ROLES } = require('@rbm/lib/roles');
const { resolveHolderUpChain } = require('./divisionAliasService');

/** Roles whose step is left to a pool instead of one person. */
const POOL_ROLES = new Set([ROLES.ME_OFFICER]);

/**
 * Whether an unresolved step of this role goes to the pool.
 *
 * @param {string} roleCode
 * @returns {boolean}
 * @example isPoolRole(ROLES.ME_OFFICER); // true
 */
const isPoolRole = (roleCode) => POOL_ROLES.has(roleCode);

/**
 * M&E officer of a business unit, or null for the pool. The holder named in
 * the org structure counts only while active and still an M&E officer
 * (D-20261022-01).
 *
 * @param {import('knex').Knex} knex
 * @param {string|null} divisionCode - division or directorate (alias allowed)
 * @returns {Promise<number|null>}
 * @throws {Error} on DB failure
 * @example await resolveMeOfficer(db, 'CLDS'); // 20, or null when nobody holds it
 */
async function resolveMeOfficer(knex, divisionCode) {
  const holder = divisionCode ? await resolveHolderUpChain(knex, divisionCode, 'm_and_e_user_id') : null;
  if (!holder) return null;
  const isMeOfficer = await knex('users as u')
    .join('user_roles as ur', 'ur.user_id', 'u.id').join('roles as r', 'r.id', 'ur.role_id')
    .where('u.id', holder).where('r.code', ROLES.ME_OFFICER)
    .where(function active() { this.where('u.status', 'ACTIVE').orWhereNull('u.status'); })
    .first('u.id');
  return isMeOfficer ? holder : null;
}

/**
 * Knex join of `users as u` on the step approver, or on every active holder
 * of the step role when the step is in the pool. Used by the reminders.
 *
 * @param {import('knex').Knex.QueryBuilder} query - has `approval_steps as s`
 * @returns {import('knex').Knex.QueryBuilder}
 * @example joinApproverOrPool(db('approval_steps as s')).select('u.email');
 */
function joinApproverOrPool(query) {
  return query.join('users as u', function approverOrPool() {
    this.on('u.id', '=', 's.approver_id').orOn(function pool() {
      this.onNull('s.approver_id')
        .andOnIn('s.role_code', [...POOL_ROLES])
        .andOnExists(function holdsRole() {
          this.from('user_roles as pur').join('roles as pro', 'pro.id', 'pur.role_id')
            .whereRaw('pur.user_id = u.id').whereRaw('pro.code = s.role_code');
        });
    });
  });
}

module.exports = { isPoolRole, resolveMeOfficer, joinApproverOrPool, POOL_ROLES };
