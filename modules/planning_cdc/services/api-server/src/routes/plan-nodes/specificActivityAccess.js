/**
 * Who may edit a specific activity — shared by PATCH /plan-nodes/specific-activity/:id
 * and the activity planning routes (cost lines, complexity screening).
 */

'use strict';

const rbacService = require('../../services/rbacService');
const { scopeCoversDivision } = require('../../services/divisionAliasService');
const { STATUSES } = require('@rbm/lib/enums');
const { RBAC_SCOPES } = require('@rbm/lib/rbac');
const { isFocalFor, isHodFor } = require('./_helpers');
const { isActivityFocal } = require('./activityFocal');

/** The matrix grant applied to this activity (scope `own` or a division scope). */
async function matrixAllows(user, row, permCheck, { actFocal, focalHere, hodHere }) {
  if (!permCheck.allowed) return false;
  if (permCheck.scope === RBAC_SCOPES.OWN) return row.created_by_user_id === user.id || actFocal;
  if (await scopeCoversDivision(user, permCheck.scope, row.responsible_division_code)) return true;
  return focalHere || hodHere || actFocal;
}

/**
 * `tasks:update` in the RBAC matrix: scope `own` covers the creator and the
 * activity focal; a wider scope covers its division, and the division's
 * focal / head of division always may. A head of division may also edit an
 * activity waiting for their review.
 *
 * @param {{ id: number }} user
 * @param {object} row - the plan_nodes row of the specific activity
 * @returns {Promise<{ allowed: boolean, admin: boolean }>} `admin`: scope `all`
 * @throws {Error} on DB failure
 * @example const { allowed } = await canEditSpecificActivity(req.user, row);
 */
async function canEditSpecificActivity(user, row) {
  const permCheck = await rbacService.checkPermission(user.id, 'tasks', 'update');
  const who = {
    actFocal: isActivityFocal(user.id, row),
    focalHere: await isFocalFor(user.id, row.responsible_division_code),
    hodHere: await isHodFor(user.id, row.responsible_division_code),
  };
  const canEditAsHod = who.hodHere && row.status === STATUSES.IN_REVIEW;
  const allowed = (await matrixAllows(user, row, permCheck, who)) || canEditAsHod;
  return { allowed, admin: Boolean(permCheck.allowed && permCheck.scope === RBAC_SCOPES.ALL) };
}

module.exports = { canEditSpecificActivity };
