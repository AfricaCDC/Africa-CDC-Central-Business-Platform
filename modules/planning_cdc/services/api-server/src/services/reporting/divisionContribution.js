/**
 * @module divisionContribution
 *
 * Single source of truth for "what is this division's relationship to a
 * given indicator?" — answers OWNER, CONTRIB or null.
 *
 * A division CONTRIBUTES to an indicator when EITHER:
 *   1. it is listed in plan_nodes.contributing_divisions of the indicator,
 *   OR
 *   2. it owns (responsible_division_code) — or contributes to — at least
 *      one Specific Activity (PLAN_NODE_TYPES.SPECIFIC_ACTIVITY) whose
 *      `linked_indicator_id` points to that indicator.
 *
 * Used by the reporting layer to (a) decide whether to auto-init a
 * division report on first GET and (b) route the workflow on submit
 * (OWNER -> DEFAULT 1-step / CONTRIB -> CONTRIBUTOR_CHAIN 3-step).
 */

'use strict';

const db = require('../../config/db');
const { PLAN_NODE_TYPES } = require('@rbm/lib/enums');
const { sameDivision, getDirectorateChildren } = require('../divisionAliasService');

/** @private */
function parseContributing(raw) {
  if (!raw) return [];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr.map((c) => String(c).toUpperCase());
  } catch {
    return [];
  }
}

/**
 * @param {number} planNodeId
 * @param {string} divisionCode
 * @returns {Promise<boolean>}
 */
async function isOwnerDivision(planNodeId, divisionCode) {
  if (!planNodeId || !divisionCode) return false;
  const node = await db('plan_nodes').where('id', planNodeId).first('responsible_division_code');
  if (!node?.responsible_division_code) return false;
  return sameDivision(node.responsible_division_code, divisionCode);
}

/** @private */
async function isListedContributor(planNodeId, divisionCode) {
  const node = await db('plan_nodes').where('id', planNodeId).first('contributing_divisions');
  const list = parseContributing(node?.contributing_divisions);
  if (!list.length) return false;
  for (const code of list) {
    if (await sameDivision(code, divisionCode)) return true;
  }
  return false;
}

/** @private */
async function isSpecificActivityContributor(planNodeId, divisionCode) {
  const sas = await db('plan_nodes')
    .where({ node_type: PLAN_NODE_TYPES.SPECIFIC_ACTIVITY, linked_indicator_id: planNodeId })
    .select('responsible_division_code', 'contributing_divisions');
  for (const sa of sas) {
    if (sa.responsible_division_code && await sameDivision(sa.responsible_division_code, divisionCode)) {
      return true;
    }
    const list = parseContributing(sa.contributing_divisions);
    for (const code of list) {
      if (await sameDivision(code, divisionCode)) return true;
    }
  }
  return false;
}

/**
 * @param {number} planNodeId
 * @param {string} divisionCode
 * @returns {Promise<boolean>}
 */
async function isContributorDivision(planNodeId, divisionCode) {
  if (!planNodeId || !divisionCode) return false;
  if (await isListedContributor(planNodeId, divisionCode)) return true;
  if (await isSpecificActivityContributor(planNodeId, divisionCode)) return true;
  return false;
}

/**
 * @param {number} planNodeId
 * @param {string} divisionCode
 * @returns {Promise<'OWNER'|'CONTRIB'|null>}
 *
 * @example
 * const role = await getReportRole(6162, 'MIS'); // 'CONTRIB'
 */
async function getReportRole(planNodeId, divisionCode) {
  if (await isOwnerDivision(planNodeId, divisionCode)) return 'OWNER';
  if (await isContributorDivision(planNodeId, divisionCode)) {
    // A directorate listed as CONTRIB on an indicator owned by one of
    // its child divisions (or vice-versa) is redundant: the OWNER's
    // report already represents the directorate's contribution.
    // Suppress the duplicate CONTRIB to avoid two parallel approval
    // chains for the same data.
    if (await isCoveredByOwner(planNodeId, divisionCode)) return null;
    return 'CONTRIB';
  }
  return null;
}

/**
 * True when `divisionCode` is an ancestor or descendant of the OWNER
 * division of `planNodeId` (and is not the OWNER itself). Used to skip
 * a redundant CONTRIB role when the parent directorate or a sub-division
 * of the OWNER appears in `contributing_divisions`.
 *
 * @param {number} planNodeId
 * @param {string} divisionCode
 * @returns {Promise<boolean>}
 */
async function isCoveredByOwner(planNodeId, divisionCode) {
  const node = await db('plan_nodes').where('id', planNodeId).first('responsible_division_code');
  const ownerCode = node?.responsible_division_code;
  if (!ownerCode || !divisionCode) return false;
  if (await sameDivision(ownerCode, divisionCode)) return false; // it IS the owner
  // Either side of the parent/child relationship counts as "covered":
  //   - divisionCode is a descendant of ownerCode (owner = directorate, contrib = sub-division)
  //   - divisionCode is an ancestor of ownerCode  (owner = division, contrib = parent directorate)
  const ownerSubtree = await getDirectorateChildren(ownerCode);
  const contribSubtree = await getDirectorateChildren(divisionCode);
  const upper = (s) => String(s).toUpperCase();
  const target = upper(divisionCode);
  const ownerUpper = upper(ownerCode);
  if (ownerSubtree.map(upper).includes(target)) return true;
  if (contribSubtree.map(upper).includes(ownerUpper)) return true;
  return false;
}

module.exports = {
  isOwnerDivision,
  isContributorDivision,
  isCoveredByOwner,
  getReportRole,
};
