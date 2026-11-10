/**
 * Report edit / submit permission resolver — D-20260415-11.
 *
 * Central helper that answers "may this user edit or submit this report?"
 * for indicator, activity and quarterly (division) reports. The rule is:
 *
 *   1. Admin bypass wins: if the user holds `reports.approve` with scope
 *      `all`, they may edit/submit anything.
 *   2. Otherwise: take the UNION of divisions where the user holds the
 *      focal role (via `user-divisions`, which expands aliases). If that
 *      set intersects the report's MAIN (`responsible_division_code`),
 *      edit is allowed as role `MAIN`.
 *   3. Otherwise: if that set intersects the report's CONTRIB list
 *      (`contributing_divisions`), edit is allowed as role `CONTRIB`
 *      (the caller must still honour the 3-step approval chain).
 *   4. Otherwise: denied.
 *
 * The caller passes in the MAIN division code and (optionally) a CONTRIB
 * array already parsed from the plan_nodes.contributing_divisions JSON
 * column — see `parseContributingDivisions` below for a lenient parser
 * that accepts either a raw string or a pre-parsed array.
 *
 * IMPORTANT — this replaces any prior `req.user.division_code`-based gate
 * that compared against the top-nav "active" division. The switcher is a
 * LIST filter only; permission gates must never use it. See D-20260415-11.
 */

'use strict';

const knex = require('../config/db');
const rbacService = require('./rbacService');
const {
  getUserDivisionCodes,
  DIVISION_ROLE_FOCAL,
  ALL_ROLES: ALL_DIVISION_ROLES,
} = require('@rbm/lib/user-divisions');
const { RBAC_MODULES, RBAC_ACTIONS, RBAC_SCOPES } = require('@rbm/lib/rbac');

const ROLE_MAIN = 'MAIN';
const ROLE_CONTRIB = 'CONTRIB';
const ROLE_ADMIN = 'ADMIN';
const ROLE_REVIEWER = 'REVIEWER';

const REASON_NOT_AUTHENTICATED = 'NOT_AUTHENTICATED';
const REASON_NOT_IN_DIVISIONS = 'NOT_IN_MAIN_OR_CONTRIB';

/**
 * Lenient parser for the `contributing_divisions` payload — accepts JSON
 * string, already-parsed array, or nullish. Returns an uppercased string[].
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
function parseContributingDivisions(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)
    ? raw
    : (() => {
      try { return typeof raw === 'string' ? JSON.parse(raw) : []; } catch { return []; }
    })();
  if (!Array.isArray(arr)) return [];
  return arr.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean);
}

/**
 * Uppercase a division code for case-insensitive comparison.
 */
function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

/**
 * Admin bypass — user holds `reports.approve` at scope `all`.
 *
 * @param {number} userId
 * @returns {Promise<boolean>}
 */
async function hasAdminBypass(userId) {
  const { scope } = await rbacService.checkPermission(
    userId,
    RBAC_MODULES.REPORTS,
    RBAC_ACTIONS.APPROVE,
  );
  return scope === RBAC_SCOPES.ALL;
}

/**
 * Focal divisions of the user; the legacy `users.division_code` when the
 * user has no user_divisions row.
 * @private
 */
async function focalCodesOf(userId) {
  const codes = await getUserDivisionCodes(knex, userId, { roles: [DIVISION_ROLE_FOCAL] });
  if (codes.length) return codes;
  const userRow = await knex('users').where('id', userId).select('division_code').first();
  return userRow?.division_code ? [userRow.division_code] : [];
}

/**
 * `onMain` when the codes hold the report's MAIN division, `onContrib` when
 * they hold one of its CONTRIB divisions, else null.
 * @private
 */
function matchRole(codes, { main, contrib }, [onMain, onContrib]) {
  const set = new Set(codes.map(normalizeCode));
  if (main && set.has(main)) return onMain;
  return contrib.some((c) => set.has(c)) ? onContrib : null;
}

/**
 * Resolve whether a user may edit/submit a report whose MAIN is
 * `mainDivisionCode` and whose CONTRIB list is `contributingDivisions`.
 * Focal persons edit (MAIN / CONTRIB); the other division roles (Responsible
 * Person, M&E officer) review, in line with quarterly_report.approve:division.
 *
 * @param {object} params
 * @param {number} params.userId
 * @param {string|null} params.mainDivisionCode — the report's
 *   `responsible_division_code`.
 * @param {Array<string>|string|null} [params.contributingDivisions] — the
 *   plan_nodes.contributing_divisions column (array OR JSON string OK).
 * @returns {Promise<{allowed: boolean, role: string|null, reason: string|null}>}
 * @example await canEditReport({ userId: 7, mainDivisionCode: 'EPR', contributingDivisions: '["SDI"]' })
 */
async function canEditReport({ userId, mainDivisionCode, contributingDivisions = null }) {
  if (!userId) return { allowed: false, role: null, reason: REASON_NOT_AUTHENTICATED };
  if (await hasAdminBypass(userId)) return { allowed: true, role: ROLE_ADMIN, reason: null };

  const report = { main: normalizeCode(mainDivisionCode), contrib: parseContributingDivisions(contributingDivisions) };
  const editRole = matchRole(await focalCodesOf(userId), report, [ROLE_MAIN, ROLE_CONTRIB]);
  if (editRole) return { allowed: true, role: editRole, reason: null };

  const allCodes = await getUserDivisionCodes(knex, userId, { roles: ALL_DIVISION_ROLES });
  if (matchRole(allCodes, report, [ROLE_REVIEWER, ROLE_REVIEWER])) {
    return { allowed: true, role: ROLE_REVIEWER, reason: null };
  }
  return { allowed: false, role: null, reason: REASON_NOT_IN_DIVISIONS };
}

/**
 * Convenience: fetch `responsible_division_code` + `contributing_divisions`
 * from `plan_nodes` by id, then resolve. Throws NotFoundError when the
 * node does not exist so callers can bubble a clean 404 instead of 403.
 *
 * @param {object} params
 * @param {number} params.userId
 * @param {number} params.planNodeId
 * @returns {Promise<{allowed: boolean, role: string|null, reason: string|null, planNode: object|null}>}
 */
async function canEditReportByPlanNodeId({ userId, planNodeId }) {
  const node = await knex('plan_nodes')
    .where('id', parseInt(planNodeId, 10))
    .select('id', 'responsible_division_code', 'contributing_divisions')
    .first();
  if (!node) {
    return { allowed: false, role: null, reason: 'PLAN_NODE_NOT_FOUND', planNode: null };
  }
  const res = await canEditReport({
    userId,
    mainDivisionCode: node.responsible_division_code,
    contributingDivisions: node.contributing_divisions,
  });
  return { ...res, planNode: node };
}

module.exports = {
  canEditReport,
  canEditReportByPlanNodeId,
  parseContributingDivisions,
  ROLE_MAIN,
  ROLE_CONTRIB,
  ROLE_ADMIN,
  ROLE_REVIEWER,
};
