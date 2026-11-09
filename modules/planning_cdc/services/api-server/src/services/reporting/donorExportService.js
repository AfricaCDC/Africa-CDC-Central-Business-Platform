// ── Donor Export — activities by funding source / grant ──
//
// Backlog VH-5 / C-2. A flat (one row per activity) export of broad + specific
// activities filtered by funding source and/or grant, for sharing a donor's
// funded portfolio. Reuses loadPlanNodes (planHierarchyService) so the funding /
// grant / budget columns come from the same plan_nodes select as the workplan
// export. Consumed by routes/reporting/exportRoutes.js, gated by workplan:export
// (donor data lives on workplan activities; there is no separate donor module).
//
// Headers are human-readable column labels (CSV/XLSX), not ENTITY_TYPES.
/* eslint-disable no-restricted-syntax -- column headers like "Division" are
 * spreadsheet labels, not ENTITY_TYPES references (CHARTER §11). */
'use strict';

const { PLAN_NODE_TYPES } = require('@rbm/lib/enums');
const { loadPlanNodes } = require('./planHierarchyService');

const DONOR_HEADERS = [
  'Type', 'Code', 'Title', 'Division', 'Funding source', 'Grant name',
  'Budget (Main)', 'Total 2026', 'Status',
];

/** Text cell: null/undefined → ''. */
function str(v) { return v == null ? '' : String(v); }

/** Numeric cell: null/empty/NaN → ''. */
function numOrEmpty(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
}

/** Case-insensitive trimmed equality (both undefined-safe). */
function ciEquals(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

const ACTIVITY_TYPES = [PLAN_NODE_TYPES.BROAD_ACTIVITY, PLAN_NODE_TYPES.SPECIFIC_ACTIVITY];
const TYPE_LABELS = {
  [PLAN_NODE_TYPES.BROAD_ACTIVITY]: 'Broad Activity',
  [PLAN_NODE_TYPES.SPECIFIC_ACTIVITY]: 'Specific Activity',
};

/**
 * Build donor export rows: every broad/specific activity for a fiscal year,
 * filtered by funding source and/or grant (case-insensitive exact match) and by
 * the (optional) owner-division scope. With no funding/grant filter, returns all
 * activities that carry a funding source (a "by donor" overview).
 *
 * @param {{ fiscalYear?: string, divFilter?: string[], fundingSource?: string, grant?: string }} params
 * @returns {Promise<Array<object>>} one row per matching activity, ordered by code
 * @example
 * const rows = await buildDonorRows({ fiscalYear: '2026', fundingSource: 'Japan Funds' });
 */
async function buildDonorRows({ fiscalYear, divFilter = [], fundingSource, grant } = {}) {
  const nodes = await loadPlanNodes({ fiscalYear });
  const wantFunding = fundingSource && String(fundingSource).trim();
  const wantGrant = grant && String(grant).trim();
  const divSet = divFilter.length ? new Set(divFilter) : null;

  const matches = nodes.filter((n) => {
    if (!ACTIVITY_TYPES.includes(n.node_type)) return false;
    if (divSet && !divSet.has(n.responsible_division_code)) return false;
    if (wantFunding) return ciEquals(n.primary_funding_source, fundingSource);
    if (wantGrant) return ciEquals(n.grant_name, grant);
    // No explicit filter → all activities that carry a funding source.
    return !!String(n.primary_funding_source || '').trim();
  });

  matches.sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), undefined, { numeric: true }));

  return matches.map((n) => ({
    'Type': TYPE_LABELS[n.node_type] || '',
    'Code': str(n.code),
    'Title': str(n.title),
    'Division': str(n.division_name || n.responsible_division_code),
    'Funding source': str(n.primary_funding_source),
    'Grant name': str(n.grant_name),
    'Budget (Main)': numOrEmpty(n.budget_main),
    'Total 2026': numOrEmpty(n.budget_total_2026),
    'Status': str(n.status),
  }));
}

module.exports = {
  buildDonorRows,
  DONOR_HEADERS,
};
