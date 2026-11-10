// ── Who may write a report or its verification files (D-20261108-02) ──
//
// One place for the write rules that several routes share: the quarterly
// indicator report of a division (save, submit, N/A, evidence) and the
// evidence attached to an activity report.

'use strict';

const db = require('../../config/db');
const rbacService = require('../rbacService');
const { ROLES } = require('@rbm/lib/roles');
const { RBAC_MODULES, RBAC_ACTIONS, RBAC_SCOPES } = require('@rbm/lib/rbac');

// Division roles (user_divisions.role) that report for their division.
const SUBMIT_DIVISION_ROLES = Object.freeze([ROLES.FOCAL_PERSON, ROLES.HEAD_OF_DIVISION, ROLES.DIRECTOR]);

// Evidence parents (evidence_files.parent_type).
const EVIDENCE_PARENTS = Object.freeze({
  ACTIVITY_REPORT: 'activity_report',
  INDICATOR_REPORT: 'indicator_report',
});

/**
 * Whether the user may report for a division: quarterly_report:submit, and
 * either scope « all » (M&E / SYSTEM_ADMIN) or one of SUBMIT_DIVISION_ROLES
 * in that division (user_divisions).
 *
 * @param {number} userId
 * @param {string} divisionCode
 * @returns {Promise<{ ok: boolean, scope: string|null }>}
 * @throws {Error} on DB failure
 * @example const { ok } = await maySubmitFor(req.user.id, 'EPR');
 */
async function maySubmitFor(userId, divisionCode) {
  const { allowed, scope } = await rbacService.checkPermission(
    userId, RBAC_MODULES.QUARTERLY_REPORT, RBAC_ACTIONS.SUBMIT,
  );
  if (!allowed) return { ok: false, scope };
  if (scope === RBAC_SCOPES.ALL) return { ok: true, scope };
  const membership = await db('user_divisions')
    .where({ user_id: userId, division_code: divisionCode })
    .whereIn('role', SUBMIT_DIVISION_ROLES)
    .first();
  return { ok: !!membership, scope };
}

/**
 * Whether the user may attach a verification file to a report: the author of
 * an activity report (or an administrator), or someone who reports for the
 * division of a quarterly indicator report. A file uploaded before the
 * report's first save has no parent yet (`parentId` 0) and is allowed.
 *
 * @param {number} userId
 * @param {string} parentType - EVIDENCE_PARENTS value
 * @param {number} parentId - report id, 0 before the first save
 * @returns {Promise<boolean>}
 * @throws {Error} on DB failure
 * @example if (!(await canWriteEvidence(req.user.id, 'activity_report', 7))) throw new ForbiddenError('…');
 */
async function canWriteEvidence(userId, parentType, parentId) {
  if (!Object.values(EVIDENCE_PARENTS).includes(parentType)) return false;
  // ponytail: a pre-save upload is unattached; tie it to the draft once uploads wait for the first save.
  if (!parentId) return true;
  if (parentType === EVIDENCE_PARENTS.ACTIVITY_REPORT) {
    const report = await db('activity_reports').where('id', parentId).first('user_id');
    if (!report) return false;
    if (Number(report.user_id) === Number(userId)) return true;
    const { allowed, scope } = await rbacService.checkPermission(userId, RBAC_MODULES.ACTIVITY_REPORT, RBAC_ACTIONS.CREATE);
    return allowed && scope === RBAC_SCOPES.ALL;
  }
  const report = await db('indicator_division_reports').where('id', parentId).first('division_code');
  return !!report && (await maySubmitFor(userId, report.division_code)).ok;
}

module.exports = { maySubmitFor, canWriteEvidence, SUBMIT_DIVISION_ROLES, EVIDENCE_PARENTS };
