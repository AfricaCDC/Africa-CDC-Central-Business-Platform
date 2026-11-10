// ── Plan-node hierarchy builder for NESTED exports (C-1, VH-5) ──
//
// The flat row-builders in planExportService listed plan_nodes one-per-row.
// Lenny asked for HIERARCHICAL exports: indicators nested under their outcome
// area, and (for the workplan) activities nested under the indicators they
// contribute to. This module turns the plan_nodes graph into an ordered,
// depth-tagged preorder list that a spreadsheet row-builder can render with an
// indent / Level column.
//
// Verified data shape (rbm_platform_dev):
//   OUTCOME_AREA (e.g. "1.1")
//     └─ OUTCOME_INDICATOR  — T2 ("1.1.1"), T3/T4 ("CHSISD.1.1-17") are ALL
//        direct children of the area (parent_id = area). T3/T4 are NOT children
//        of a T2; their code prefix references the AREA, not a single T2.
//     └─ (a T2 indicator) └─ BROAD_ACTIVITY ("1.1.1.01", parent_id = T2)
//                              └─ SPECIFIC_ACTIVITY (parent_id = broad);
//                                 specific.linked_indicator_id → the T3/T4 it
//                                 contributes to.
//
// So the workplan forest mirrors the live "My workplan" page model:
//   Area → T2 indicator → Broad → (linked T3/T4 indicator → its specifics)
//                                 + (specifics with no linked indicator).
// The PIRS forest is indicator-only: Area → indicators ordered (tier, code).

'use strict';

const db = require('../../config/db');
const { PLAN_NODE_TYPES } = require('@rbm/lib/enums');

const NODE_TYPES_IN_SCOPE = [
  PLAN_NODE_TYPES.OUTCOME_AREA,
  PLAN_NODE_TYPES.OUTCOME_INDICATOR,
  PLAN_NODE_TYPES.BROAD_ACTIVITY,
  PLAN_NODE_TYPES.SPECIFIC_ACTIVITY,
];

/** Stable numeric-aware compare on a `code` field (handles "1.1.10" > "1.1.2"). */
function byCode(a, b) {
  return String(a.code || '').localeCompare(String(b.code || ''), undefined, { numeric: true });
}

/** Tier-then-code compare for indicators under an area (T2 before T3 before T4). */
function byTierThenCode(a, b) {
  const ta = a.tier_id || 99;
  const tb = b.tier_id || 99;
  return ta !== tb ? ta - tb : byCode(a, b);
}

/**
 * Load every plan_node needed for a hierarchy, joined to its division name.
 *
 * @param {{ fiscalYear?: string }} params
 * @returns {Promise<Array<object>>} raw rows (all node types, one FY)
 */
async function loadPlanNodes({ fiscalYear } = {}) {
  const q = db('plan_nodes as p')
    .leftJoin('division_codes as dc', 'dc.code', 'p.responsible_division_code')
    .whereIn('p.node_type', NODE_TYPES_IN_SCOPE)
    .select(
      'p.id', 'p.parent_id', 'p.node_type', 'p.tier_id', 'p.code', 'p.indicator_code',
      'p.title', 'p.unit', 'p.baseline', 'p.linked_indicator_id',
      'p.target_y1', 'p.target_y2', 'p.target_y3', 'p.target_y4', 'p.target_y5',
      'p.q1_target_numeric', 'p.q2_target_numeric', 'p.q3_target_numeric', 'p.q4_target_numeric',
      'p.activity_type', 'p.implementation_at_rcc', 'p.budgeting_arrangement',
      'p.primary_funding_source', 'p.grant_name',
      'p.budget_main', 'p.budget_pass_through', 'p.budget_tech_assistance', 'p.budget_special_projects',
      'p.budget_total_2026', 'p.budget_2027', 'p.budget_2028',
      'p.q1_budget', 'p.q2_budget', 'p.q3_budget', 'p.q4_budget',
      'p.responsible_division_code', 'dc.division_name', 'p.contributing_divisions', 'p.status',
    );
  if (fiscalYear) q.where('p.fiscal_year', fiscalYear);
  return q;
}

/** Index a node list into { byId, childrenOf } maps. */
function indexNodes(nodes) {
  const byId = new Map();
  const childrenOf = new Map();
  nodes.forEach((n) => {
    byId.set(n.id, n);
    if (!childrenOf.has(n.parent_id)) childrenOf.set(n.parent_id, []);
    childrenOf.get(n.parent_id).push(n);
  });
  return { byId, childrenOf };
}

/** True when a leaf node's owner division is allowed by the (optional) filter. */
function inDivFilter(node, divFilter) {
  if (!divFilter || !divFilter.length) return true;
  return divFilter.includes(node.responsible_division_code);
}

/** Children of `parentId` of one node_type, from the childrenOf index. */
function childrenByType(childrenOf, parentId, type) {
  return (childrenOf.get(parentId) || []).filter((n) => n.node_type === type);
}

/**
 * Rows under one broad activity: each contributing T3/T4 indicator (level 3)
 * followed by its specifics (level 4), then specifics with no/unknown linked
 * indicator directly under the broad (level 3). `specs` is already div-filtered.
 */
function broadChildRows(specs, byId) {
  const rows = [];
  const linkedInds = [...new Set(specs.map((s) => s.linked_indicator_id).filter(Boolean))]
    .map((id) => byId.get(id))
    .filter((n) => n && n.node_type === PLAN_NODE_TYPES.OUTCOME_INDICATOR)
    .sort(byTierThenCode);
  const linkedSet = new Set(linkedInds.map((i) => i.id));

  linkedInds.forEach((ind) => {
    const indSpecs = specs.filter((s) => s.linked_indicator_id === ind.id).sort(byCode);
    if (!indSpecs.length) return;
    rows.push({ node: ind, level: 3 });
    indSpecs.forEach((s) => rows.push({ node: s, level: 4 }));
  });

  specs
    .filter((s) => !s.linked_indicator_id || !linkedSet.has(s.linked_indicator_id))
    .forEach((s) => rows.push({ node: s, level: 3 }));

  return rows;
}

/** Rows for one T2 indicator's broads (level 2) + their children; empty if none survive. */
function t2BroadRows(t2, { byId, childrenOf, divFilter }) {
  const rows = [];
  const broads = childrenByType(childrenOf, t2.id, PLAN_NODE_TYPES.BROAD_ACTIVITY).sort(byCode);
  for (const broad of broads) {
    const specs = childrenByType(childrenOf, broad.id, PLAN_NODE_TYPES.SPECIFIC_ACTIVITY)
      .filter((s) => inDivFilter(s, divFilter))
      .sort(byCode);
    if (!inDivFilter(broad, divFilter) && !specs.length) continue;
    rows.push({ node: broad, level: 2 }, ...broadChildRows(specs, byId));
  }
  return rows;
}

/**
 * Build the WORKPLAN forest (preorder, depth-tagged), mirroring the live
 * "My workplan" page: Area → T2 indicator → Broad → linked T3/T4 indicator →
 * its specifics, plus specifics with no linked indicator directly under the broad.
 * Only areas / T2s / broads that have surviving activities appear (workplan view).
 *
 * @param {{ nodes: object[], divFilter?: string[] }} params
 * @returns {Array<{ node: object, level: number }>}
 */
function buildWorkplanForest({ nodes, divFilter = [] }) {
  const { byId, childrenOf } = indexNodes(nodes);
  const areas = nodes
    .filter((n) => n.node_type === PLAN_NODE_TYPES.OUTCOME_AREA)
    .sort(byCode);
  const out = [];

  for (const area of areas) {
    const areaBlock = [];
    const t2s = childrenByType(childrenOf, area.id, PLAN_NODE_TYPES.OUTCOME_INDICATOR)
      .filter((n) => (n.tier_id || 2) === 2)
      .sort(byCode);

    for (const t2 of t2s) {
      const t2Block = t2BroadRows(t2, { byId, childrenOf, divFilter });
      if (t2Block.length) areaBlock.push({ node: t2, level: 1 }, ...t2Block);
    }

    if (areaBlock.length) out.push({ node: area, level: 0 }, ...areaBlock);
  }

  return out;
}

/**
 * Build the PIRS forest (preorder, depth-tagged): every indicator grouped under
 * its outcome area, ordered (tier, code). Area → indicators (T2, then T3, T4).
 * With a division filter, only indicators owned by an allowed division appear,
 * and an area is kept only if it still has indicators.
 *
 * @param {{ nodes: object[], divFilter?: string[] }} params
 * @returns {Array<{ node: object, level: number }>}
 */
function buildPirsForest({ nodes, divFilter = [] }) {
  const { childrenOf } = indexNodes(nodes);
  const areas = nodes
    .filter((n) => n.node_type === PLAN_NODE_TYPES.OUTCOME_AREA)
    .sort(byCode);
  const out = [];

  for (const area of areas) {
    const inds = (childrenOf.get(area.id) || [])
      .filter((n) => n.node_type === PLAN_NODE_TYPES.OUTCOME_INDICATOR && inDivFilter(n, divFilter))
      .sort(byTierThenCode);
    if (!inds.length) continue;
    out.push({ node: area, level: 0 });
    inds.forEach((ind) => out.push({ node: ind, level: 1 }));
  }

  return out;
}

module.exports = {
  loadPlanNodes,
  buildWorkplanForest,
  buildPirsForest,
};
