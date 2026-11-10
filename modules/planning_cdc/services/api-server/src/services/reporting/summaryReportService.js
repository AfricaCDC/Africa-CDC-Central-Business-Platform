// ── Division Quarterly Summary Report (VH-6 / D-1) ──
//
// Aggregates, for one division + fiscal year + quarter:
//   1. the division's OUTCOME_INDICATOR reports (OWNER it is responsible for +
//      any CONTRIB it submitted) with quarter target vs actual and achievement,
//   2. KPIs (owned indicator completeness + average achievement),
//   3. the activity reports filed on the division's specific activities for
//      the quarter (D-20261106-13).
//
// Data source of truth: plan_nodes (T3/T4 OUTCOME_INDICATOR) + the live
// indicator_division_reports + activity_reports. NOT the legacy
// (empty) `indicators` table. Consumed by the division-quarterly-reports route
// and the in-app XLSX/CSV export (VH-5 menu).
/* eslint-disable no-restricted-syntax --
 * The only flagged literals are 'directorate' (a division_codes SQL column
 * identifier in .first()) and the SUMMARY_HEADERS strings ('Indicator', …) which
 * are CSV/XLSX column-header labels (CHARTER §11), NOT ENTITY_TYPES references.
 * Same category as planExportService / activityReportExportService. */
'use strict';

const db = require('../../config/db');
const { STATUSES } = require('@rbm/lib/enums');

// Whitelisted quarter → target column map. `quarter` NEVER reaches a query
// string directly — it is always resolved through this map first.
const QUARTER_TARGET_COL = Object.freeze({
  Q1: 'q1_target_numeric',
  Q2: 'q2_target_numeric',
  Q3: 'q3_target_numeric',
  Q4: 'q4_target_numeric',
});

const REPORTED_STATUSES = new Set([STATUSES.SUBMITTED, STATUSES.IN_REVIEW, STATUSES.APPROVED, STATUSES.VALIDATED]);
const APPROVED_STATUSES = new Set([STATUSES.APPROVED, STATUSES.VALIDATED]);

/** Normalize a fiscal year value to the VARCHAR form stored on the reports. */
const fyStr = (fy) => String(fy).trim();

/**
 * Achievement % = actual / target * 100, rounded; null when not measurable.
 * CAPPED at 100 — over-performance never displays above 100% (D-20260710-02,
 * Lenny: "c'est max 100%, ça peut jamais être plus").
 */
function achievementPct(actual, target) {
  const a = Number(actual);
  const t = Number(target);
  if (!Number.isFinite(a) || !Number.isFinite(t) || t <= 0) return null;
  return Math.min(100, Math.round((a / t) * 100));
}

/** Number or null — never NaN, never undefined. */
const numOrNull = (v) => (v === null || v === undefined ? null : Number(v));

/**
 * Shape one indicator row from a (plan_node, report) join into the summary's
 * indicator entry.
 * @private
 */
function toIndicatorEntry(row, role) {
  const reported = !!row.status && REPORTED_STATUSES.has(row.status);
  return {
    id: row.id,
    code: row.code || null,
    title: row.title || null,
    tier_id: row.tier_id,
    role,
    quarter_target: numOrNull(row.quarter_target),
    actual_value: reported ? numOrNull(row.actual_value) : null,
    achievement_pct: reported ? achievementPct(row.actual_value, row.quarter_target) : null,
    status: row.status || null,
    narrative: row.narrative || null,
  };
}

/**
 * Owned T3/T4 indicators for the division, left-joined to the division's OWNER
 * report for (fy, quarter). Always lists owned indicators — even unreported —
 * so completeness ("3 of 5 reported") is meaningful.
 * @private
 */
async function ownedIndicators(divisionCode, fiscalYear, quarter, targetCol) {
  const rows = await db('plan_nodes as pn')
    .leftJoin('indicator_division_reports as idr', function () {
      this.on('idr.plan_node_id', '=', 'pn.id')
        .andOn('idr.division_code', '=', db.raw('?', [divisionCode]))
        .andOn('idr.quarter', '=', db.raw('?', [quarter]))
        .andOn('idr.fiscal_year', '=', db.raw('?', [fiscalYear]))
        .andOn('idr.role', '=', db.raw('?', ['OWNER']));
    })
    .where('pn.node_type', 'OUTCOME_INDICATOR')
    .whereIn('pn.tier_id', [3, 4])
    .where('pn.responsible_division_code', divisionCode)
    .select(
      'pn.id', 'pn.code', 'pn.title', 'pn.tier_id',
      db.raw(`pn.${targetCol} as quarter_target`),
      'idr.actual_value', 'idr.status', 'idr.narrative',
    )
    .orderBy(['pn.tier_id', 'pn.code']);
  return rows.map((r) => toIndicatorEntry(r, 'OWNER'));
}

/**
 * CONTRIB reports the division actually submitted for (fy, quarter), joined to
 * the indicator for code/title/target.
 * @private
 */
async function contribIndicators(divisionCode, fiscalYear, quarter, targetCol) {
  const rows = await db('indicator_division_reports as idr')
    .join('plan_nodes as pn', 'pn.id', 'idr.plan_node_id')
    .where({
      'idr.division_code': divisionCode,
      'idr.quarter': quarter,
      'idr.fiscal_year': fiscalYear,
      'idr.role': 'CONTRIB',
    })
    .select(
      'pn.id', 'pn.code', 'pn.title', 'pn.tier_id',
      db.raw(`pn.${targetCol} as quarter_target`),
      'idr.actual_value', 'idr.status', 'idr.narrative',
    )
    .orderBy(['pn.tier_id', 'pn.code']);
  return rows.map((r) => toIndicatorEntry(r, 'CONTRIB'));
}

/** Compute KPI rollup from the OWNED indicator entries. */
function buildKpis(owned) {
  const total = owned.length;
  const reported = owned.filter((i) => i.status && REPORTED_STATUSES.has(i.status));
  const approved = owned.filter((i) => i.status && APPROVED_STATUSES.has(i.status));
  const measurable = reported.filter((i) => i.achievement_pct !== null);
  const achievementSum = measurable.reduce((s, i) => s + i.achievement_pct, 0);
  return {
    total_indicators: total,
    reported_count: reported.length,
    approved_count: approved.length,
    completion_pct: total > 0 ? Math.round((reported.length / total) * 100) : 0,
    achievement_pct: measurable.length > 0 ? Math.round(achievementSum / measurable.length) : null,
  };
}

/**
 * Activity reports past draft (submitted or approved) on the division's
 * specific activities for the quarter, by activity code.
 * @private
 */
function activityReportsFor(divisionCode, fy, quarter) {
  return db('activity_reports as r')
    .join('plan_nodes as p', 'p.id', 'r.plan_node_id')
    .where({ 'p.responsible_division_code': divisionCode, 'r.fiscal_year': fy, 'r.quarter': quarter })
    .whereIn('r.status', [STATUSES.SUBMITTED, STATUSES.IN_REVIEW, STATUSES.APPROVED])
    .orderBy('p.code')
    .select('r.id', 'r.plan_node_id', 'p.code', 'p.title', 'r.status',
      'r.achievements', 'r.challenges', 'r.lessons_learned', 'r.next_steps');
}

/**
 * Build the full division quarterly summary payload.
 *
 * @param {{ divisionCode: string, fiscalYear: string|number, quarter: string }} params
 * @returns {Promise<object>} `{ division, fiscal_year, quarter, period, kpis, indicators, activities }`
 * @throws {Error} when any underlying query fails
 * @example
 * const summary = await getDivisionQuarterlySummary({ divisionCode: 'MIS', fiscalYear: '2026', quarter: 'Q1' });
 */
async function getDivisionQuarterlySummary({ divisionCode, fiscalYear, quarter }) {
  const code = String(divisionCode).trim().toUpperCase();
  const fy = fyStr(fiscalYear);
  const q = String(quarter || 'Q1').toUpperCase();
  const targetCol = QUARTER_TARGET_COL[q] || QUARTER_TARGET_COL.Q1;

  const div = await db('division_codes')
    .where('code', code)
    .first('code', 'division_name', 'directorate');
  const period = await db('reporting_periods').where({ fiscal_year: fy, quarter: q }).first() || null;

  const [owned, contrib] = await Promise.all([
    ownedIndicators(code, fy, q, targetCol),
    contribIndicators(code, fy, q, targetCol),
  ]);

  const activities = await activityReportsFor(code, fy, q);

  return {
    division: { code, name: div?.division_name || code, directorate: div?.directorate || null },
    fiscal_year: fy,
    quarter: q,
    period: period
      ? { id: period.id, quarter: period.quarter, fiscal_year: period.fiscal_year, status: period.status, label: period.label }
      : null,
    kpis: buildKpis(owned),
    indicators: [...owned, ...contrib],
    activities,
  };
}

const SUMMARY_HEADERS = Object.freeze([
  'Indicator code', 'Indicator', 'Tier', 'Role', 'Quarter target', 'Actual', 'Achievement %', 'Status',
]);

/**
 * Flatten the summary's indicator list into export rows (XLSX/CSV).
 *
 * @param {{ divisionCode: string, fiscalYear: string|number, quarter: string }} params
 * @returns {Promise<Array<object>>} rows keyed by SUMMARY_HEADERS
 * @throws {Error} when the summary build fails
 * @example
 * const rows = await buildDivisionSummaryRows({ divisionCode: 'MIS', fiscalYear: '2026', quarter: 'Q1' });
 */
async function buildDivisionSummaryRows({ divisionCode, fiscalYear, quarter }) {
  const summary = await getDivisionQuarterlySummary({ divisionCode, fiscalYear, quarter });
  return summary.indicators.map((i) => ({
    'Indicator code': i.code || '',
    Indicator: i.title || '',
    Tier: i.tier_id ?? '',
    Role: i.role,
    'Quarter target': i.quarter_target ?? '',
    Actual: i.actual_value ?? '',
    'Achievement %': i.achievement_pct ?? '',
    Status: i.status || '',
  }));
}

module.exports = {
  getDivisionQuarterlySummary,
  buildDivisionSummaryRows,
  SUMMARY_HEADERS,
};
