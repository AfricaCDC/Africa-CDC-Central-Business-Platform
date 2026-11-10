// ── Plan Export — Workplan & PIRS row builders ──
//
// Backlog VH-5 (workplan + PIRS exports). Builds tabular rows straight from
// plan_nodes for two in-app exports, reusing the generic CSV/XLSX encoders
// from quarterlyReportExportService. Consumed by routes/reporting/exportRoutes.
//
// Headers are human-readable column labels (not ENTITY_TYPES); the file-level
// pragma below documents that — see CHARTER §11 CSV-header exception.
/* eslint-disable no-restricted-syntax -- column headers like "Division" are
 * spreadsheet labels, not ENTITY_TYPES references (CHARTER §11). */
'use strict';

const { PLAN_NODE_TYPES } = require('@rbm/lib/enums');
const { loadPlanNodes, buildWorkplanForest, buildPirsForest } = require('./planHierarchyService');

/** Coerce a DB numeric to a clean cell value; null/NaN → ''. */
function numOrEmpty(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
}

/** Text cell: falsy (null/undefined/empty) → ''. Keeps the mapper branch-light. */
function str(v) { return v || ''; }

/** Value cell preserving 0/false: null/undefined → ''. */
function orEmpty(v) { return v ?? ''; }

/** First non-empty of two values (e.g. joined name → raw code), else ''. */
function firstNonEmpty(a, b) { return a || b || ''; }

/** Parse the contributing_divisions JSON column to a "A; B" label. */
function contribLabel(raw) {
  if (!raw) return '';
  try {
    const arr = Array.isArray(raw) ? raw : JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(Boolean).join('; ') : '';
  } catch { return String(raw); }
}

const WORKPLAN_HEADERS = [
  'Level', 'Type', 'Code', 'Title', 'Division', 'Activity type', 'Implementation at RCC',
  'Budgeting arrangement', 'Funding source', 'Grant name',
  'Budget (Main)', 'Pass-through', 'Tech assistance', 'Special projects',
  'Total 2026', 'Budget 2027', 'Budget 2028', 'Q1', 'Q2', 'Q3', 'Q4', 'Status',
  'Linked indicator',
];

const PIRS_HEADERS = [
  'Level', 'Indicator code', 'Tier', 'Indicator', 'Unit', 'Baseline',
  'Target Y1', 'Target Y2', 'Target Y3', 'Target Y4', 'Target Y5',
  'Q1 target', 'Q2 target', 'Q3 target', 'Q4 target',
  'Division', 'Contributing divisions', 'Status',
];

const TIER_LABELS = { 1: 'Impact', 2: 'Outcome', 3: 'Short-term Outcome', 4: 'Output' };

/** Human tier label, falling back to "T{n}" for an unmapped tier id. */
function tierLabel(tierId) {
  return TIER_LABELS[tierId] || (tierId ? `T${tierId}` : '');
}

/** Indent a title by its depth so the nesting is readable in a spreadsheet cell. */
function indent(level, title) {
  return `${'    '.repeat(Math.max(0, level))}${title || ''}`;
}

/** Row-type label for a node in a nested workplan/PIRS export. */
function nodeTypeLabel(node) {
  switch (node.node_type) {
    case PLAN_NODE_TYPES.OUTCOME_AREA: return 'Outcome Area';
    case PLAN_NODE_TYPES.OUTCOME_INDICATOR: return `${tierLabel(node.tier_id)} Indicator`;
    case PLAN_NODE_TYPES.BROAD_ACTIVITY: return 'Broad Activity';
    case PLAN_NODE_TYPES.SPECIFIC_ACTIVITY: return 'Specific Activity';
    default: return '';
  }
}

/** Is this node an activity (broad/specific) that carries budget/activity columns? */
function isActivity(node) {
  return node.node_type === PLAN_NODE_TYPES.BROAD_ACTIVITY
    || node.node_type === PLAN_NODE_TYPES.SPECIFIC_ACTIVITY;
}

const EMPTY_ACTIVITY_COLUMNS = {
  'Activity type': '', 'Implementation at RCC': '', 'Budgeting arrangement': '',
  'Funding source': '', 'Grant name': '',
  'Budget (Main)': '', 'Pass-through': '', 'Tech assistance': '', 'Special projects': '',
  'Total 2026': '', 'Budget 2027': '', 'Budget 2028': '',
  'Q1': '', 'Q2': '', 'Q3': '', 'Q4': '',
};

/** Activity-only columns; all '' for header rows (area / indicator). */
function activityColumns(node) {
  if (!isActivity(node)) return { ...EMPTY_ACTIVITY_COLUMNS };
  return {
    'Activity type': str(node.activity_type),
    'Implementation at RCC': str(node.implementation_at_rcc),
    'Budgeting arrangement': str(node.budgeting_arrangement),
    'Funding source': str(node.primary_funding_source),
    'Grant name': str(node.grant_name),
    'Budget (Main)': numOrEmpty(node.budget_main),
    'Pass-through': numOrEmpty(node.budget_pass_through),
    'Tech assistance': numOrEmpty(node.budget_tech_assistance),
    'Special projects': numOrEmpty(node.budget_special_projects),
    'Total 2026': numOrEmpty(node.budget_total_2026),
    'Budget 2027': numOrEmpty(node.budget_2027),
    'Budget 2028': numOrEmpty(node.budget_2028),
    'Q1': numOrEmpty(node.q1_budget),
    'Q2': numOrEmpty(node.q2_budget),
    'Q3': numOrEmpty(node.q3_budget),
    'Q4': numOrEmpty(node.q4_budget),
  };
}

/** Map one forest entry to a workplan row (every row shares the same keys). */
function workplanRow({ node, level }, codeById) {
  const linkedCode = node.linked_indicator_id ? str(codeById.get(node.linked_indicator_id)) : '';
  return {
    'Level': level,
    'Type': nodeTypeLabel(node),
    'Code': firstNonEmpty(node.code, node.indicator_code),
    'Title': indent(level, node.title),
    'Division': firstNonEmpty(node.division_name, node.responsible_division_code),
    ...activityColumns(node),
    'Status': str(node.status),
    'Linked indicator': linkedCode,
  };
}

/**
 * Build NESTED workplan rows for a fiscal year: outcome area → T2 indicator →
 * broad activity → contributing T3/T4 indicator → specific activities (plus
 * specifics with no linked indicator directly under the broad). Each row carries
 * a `Level` (0..4) and an indented title so the hierarchy is readable.
 *
 * @param {{ fiscalYear?: string, divFilter?: string[] }} params
 * @returns {Promise<Array<object>>}
 */
async function buildWorkplanRows({ fiscalYear, divFilter = [] } = {}) {
  const nodes = await loadPlanNodes({ fiscalYear });
  const codeById = new Map(nodes.map((n) => [n.id, firstNonEmpty(n.indicator_code, n.code)]));
  const forest = buildWorkplanForest({ nodes, divFilter });
  return forest.map((entry) => workplanRow(entry, codeById));
}

const EMPTY_INDICATOR_COLUMNS = {
  'Unit': '', 'Baseline': '', 'Target Y1': '', 'Target Y2': '', 'Target Y3': '',
  'Target Y4': '', 'Target Y5': '', 'Q1 target': '', 'Q2 target': '', 'Q3 target': '',
  'Q4 target': '', 'Division': '', 'Contributing divisions': '',
};

/** Indicator-only columns; all '' for area (header) rows. */
function indicatorColumns(node) {
  if (node.node_type === PLAN_NODE_TYPES.OUTCOME_AREA) return { ...EMPTY_INDICATOR_COLUMNS };
  return {
    'Unit': str(node.unit),
    'Baseline': orEmpty(node.baseline),
    'Target Y1': orEmpty(node.target_y1),
    'Target Y2': orEmpty(node.target_y2),
    'Target Y3': orEmpty(node.target_y3),
    'Target Y4': orEmpty(node.target_y4),
    'Target Y5': orEmpty(node.target_y5),
    'Q1 target': numOrEmpty(node.q1_target_numeric),
    'Q2 target': numOrEmpty(node.q2_target_numeric),
    'Q3 target': numOrEmpty(node.q3_target_numeric),
    'Q4 target': numOrEmpty(node.q4_target_numeric),
    'Division': firstNonEmpty(node.division_name, node.responsible_division_code),
    'Contributing divisions': contribLabel(node.contributing_divisions),
  };
}

/** Map one forest entry to a PIRS row (area header rows carry only Level/Code/Title). */
function pirsRow({ node, level }) {
  const isArea = node.node_type === PLAN_NODE_TYPES.OUTCOME_AREA;
  return {
    'Level': level,
    'Indicator code': isArea ? str(node.code) : firstNonEmpty(node.indicator_code, node.code),
    'Tier': isArea ? 'Outcome Area' : tierLabel(node.tier_id),
    'Indicator': indent(level, node.title),
    ...indicatorColumns(node),
    'Status': str(node.status),
  };
}

/**
 * Build NESTED PIRS rows for a fiscal year: each outcome area followed by its
 * indicators ordered (tier, code) — T2 outcome indicators, then their
 * contributing T3 short-term-outcome and T4 output indicators. Each row carries
 * a `Level` (0 area / 1 indicator) and an indented title.
 *
 * `statuses` keeps only the indicators in those statuses (the public API
 * passes the published ones); omitted, every indicator is listed.
 *
 * @param {{ fiscalYear?: string, divFilter?: string[], statuses?: string[] }} params
 * @returns {Promise<Array<object>>}
 */
async function buildPirsRows({ fiscalYear, divFilter = [], statuses } = {}) {
  const all = await loadPlanNodes({ fiscalYear });
  const nodes = statuses
    ? all.filter((n) => n.node_type !== PLAN_NODE_TYPES.OUTCOME_INDICATOR || statuses.includes(n.status))
    : all;
  const forest = buildPirsForest({ nodes, divFilter });
  return forest.map((entry) => pirsRow(entry));
}

module.exports = {
  buildWorkplanRows,
  buildPirsRows,
  WORKPLAN_HEADERS,
  PIRS_HEADERS,
};
