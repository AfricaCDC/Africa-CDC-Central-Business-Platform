/**
 * @module contribFlowDerivation
 *
 * Derives `isContribFlow` + `contribOrgCode` + `mainOrgCode` at submit time
 * per D-20260415-05 spec §4.3. A report is a "contrib flow" when the
 * submitter belongs to a contributing division of the parent item (plan_node
 * for activity reports, indicators for indicator actuals) AND is not from
 * the accountable (MAIN) division.
 *
 * Pure read-only. No side-effects. The engine consumes the result and
 * decides how to route the workflow.
 */

const db = require('../config/db');
const divisionAliasService = require('./divisionAliasService');

/**
 * @typedef {Object} ContribFlowDerivation
 * @property {boolean} isContribFlow  True when submitter is a contributor (not MAIN).
 * @property {string|null} contribOrgCode  The submitter's effective contrib code (alias-canonicalised).
 * @property {string|null} mainOrgCode  The parent item's accountable division code.
 */

/**
 * Parse `contributing_divisions` which may be JSON (on plan_nodes) or
 * newline/comma-separated text (on indicators). Always returns a string[]
 * of upper-cased codes — may be empty.
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
function parseContribList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean).map((c) => String(c).toUpperCase());
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const arr = JSON.parse(trimmed);
        return Array.isArray(arr) ? arr.filter(Boolean).map((c) => String(c).toUpperCase()) : [];
      } catch {
        return [];
      }
    }
    return trimmed.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).map((c) => c.toUpperCase());
  }
  return [];
}

/**
 * Core decision: pick the one division from the submitter's alias-expanded
 * scope that is (a) NOT the MAIN and (b) IS in the contributor list.
 *
 * Returns null when no match — meaning the submitter is either MAIN or
 * unaffiliated with this item (caller treats as default flow).
 *
 * @param {Set<string>} userDivScope  upper-cased codes (from divisionAliasService.getUserDivisionScope)
 * @param {string|null} mainCode  parent item accountable code
 * @param {string[]} contribList  upper-cased list from contributing_divisions
 * @returns {Promise<string|null>}  the submitter's contrib code, or null
 */
async function pickContribCode(userDivScope, mainCode, contribList) {
  if (!mainCode || contribList.length === 0 || userDivScope.size === 0) return null;
  const mainUpper = mainCode.toUpperCase();

  for (const userCode of userDivScope) {
    const isMain = await divisionAliasService.sameDivision(userCode, mainUpper);
    if (isMain) continue;
    for (const contrib of contribList) {
      if (await divisionAliasService.sameDivision(userCode, contrib)) return userCode;
    }
  }
  return null;
}

/**
 * Derive contrib flow params for an ACTIVITY_REPORT submission.
 *
 * @param {number} activityReportId
 * @param {number} submitterUserId
 * @returns {Promise<ContribFlowDerivation>}
 * @throws never — returns `{ isContribFlow: false, contribOrgCode: null, mainOrgCode: null }`
 *   when the report or plan_node is missing.
 * @example
 *   const d = await deriveContribFlowForActivityReport(42, req.user.id);
 *   if (d.isContribFlow) await contribEngine.startContributorWorkflow({ ...d, ... });
 */
async function deriveContribFlowForActivityReport(activityReportId, submitterUserId) {
  const report = await db('activity_reports').where('id', activityReportId).first();
  if (!report || !report.plan_node_id) return { isContribFlow: false, contribOrgCode: null, mainOrgCode: null };

  const node = await db('plan_nodes').where('id', report.plan_node_id).first();
  if (!node) return { isContribFlow: false, contribOrgCode: null, mainOrgCode: null };

  const mainOrgCode = node.responsible_division_code || null;
  const contribList = parseContribList(node.contributing_divisions);
  const userDivScope = await divisionAliasService.getUserDivisionScope(submitterUserId);

  const contribOrgCode = await pickContribCode(userDivScope, mainOrgCode, contribList);
  return {
    isContribFlow: contribOrgCode !== null,
    contribOrgCode,
    mainOrgCode,
  };
}

/**
 * Derive contrib flow params for an INDICATOR_ACTUAL submission.
 *
 * @param {number} indicatorActualId
 * @param {number} submitterUserId
 * @returns {Promise<ContribFlowDerivation>}
 * @example
 *   const d = await deriveContribFlowForIndicatorActual(88, req.user.id);
 */
async function deriveContribFlowForIndicatorActual(indicatorActualId, submitterUserId) {
  const actual = await db('indicator_actuals').where('id', indicatorActualId).first();
  if (!actual || !actual.indicator_id) return { isContribFlow: false, contribOrgCode: null, mainOrgCode: null };

  const indicator = await db('indicators').where('id', actual.indicator_id).first();
  if (!indicator) return { isContribFlow: false, contribOrgCode: null, mainOrgCode: null };

  const mainOrgCode = indicator.accountable_division_id || null;
  const contribList = parseContribList(indicator.contributing_divisions);
  const userDivScope = await divisionAliasService.getUserDivisionScope(submitterUserId);

  const contribOrgCode = await pickContribCode(userDivScope, mainOrgCode, contribList);
  return {
    isContribFlow: contribOrgCode !== null,
    contribOrgCode,
    mainOrgCode,
  };
}

module.exports = {
  deriveContribFlowForActivityReport,
  deriveContribFlowForIndicatorActual,
  parseContribList,
  pickContribCode,
};
