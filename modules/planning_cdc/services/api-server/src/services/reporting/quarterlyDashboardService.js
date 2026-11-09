/* eslint-disable complexity -- pre-existing legacy aggregator; split tracked as tech debt. */
// ── Quarterly Dashboard Service ──
//
// Aggregates per-division reporting completeness for a given quarter+fiscal year.
// Data source: plan_nodes (T3/T4 OUTCOME_INDICATOR) joined with indicator_actuals
// and division_codes. Used by GET /api/reporting/quarterly-dashboard.

const db = require('../../config/db');
const { STATUSES } = require('@rbm/lib/enums');
const { currentFy } = require('@rbm/lib/fiscalYear');
const { getActivePeriod } = require('./periodsService');

const QUARTER_COL = { Q1: 'q1_target_numeric', Q2: 'q2_target_numeric', Q3: 'q3_target_numeric', Q4: 'q4_target_numeric' };
const QUARTER_NUM = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };

/**
 * Build the quarterly dashboard payload: per-division indicator reporting status.
 *
 * @param {{ fiscal_year?: string|number, quarter?: string }} filters
 * @returns {Promise<object>} `{ period, divisions, summary }`
 * @throws {Error} when any underlying query fails
 * @example
 * const payload = await getQuarterlyDashboard({ fiscal_year: 2026, quarter: 'Q1' });
 */
const getQuarterlyDashboard = async (filters = {}) => {
  // 1. Resolve reporting period (may be null for quarters not yet opened)
  let period = null;
  const periodQ = db('reporting_periods');
  if (filters.fiscal_year) periodQ.where('fiscal_year', filters.fiscal_year);
  if (filters.quarter) periodQ.where('quarter', filters.quarter);

  if (filters.fiscal_year && filters.quarter) {
    period = await periodQ.first() || null;
  } else {
    period = await getActivePeriod();
    if (!period) {
      period = await db('reporting_periods')
        .orderBy('fiscal_year', 'desc')
        .orderBy('quarter', 'desc')
        .first() || null;
    }
  }

  // Determine which quarter column to use for targets
  const qNum = filters.quarter || (period ? period.quarter : null) || 'Q1';
  const targetCol = QUARTER_COL[qNum] || 'q1_target_numeric';
  const qInt = QUARTER_NUM[qNum] || 1;
  const fyInt = filters.fiscal_year_num || currentFy();
  // fiscal_year on indicator_division_reports is a VARCHAR column — coerce
  // whatever the caller passed to a string so the JOIN matches cleanly.
  const fiscalYear = String(filters.fiscal_year || (2023 + fyInt - 1));

  // Defensive: some environments may not have the new tables yet (legacy
  // schema drift). When plan_node_active_periods or indicator_division_reports
  // is missing we gracefully fall back to an empty rowset instead of 500-ing.
  const hasActivePeriods = await db.schema.hasTable('plan_node_active_periods');
  const hasDivReports = await db.schema.hasTable('indicator_division_reports');

  if (!hasActivePeriods) {
    return { period, divisions: [], summary: buildEmptySummary() };
  }

  // 2. Fetch T3/T4 indicators that are FLAGGED ACTIVE for this (fy × quarter)
  //    in plan_node_active_periods. Indicators without a period row are
  //    opted-out of reporting for that slot and excluded from counts.
  //    Division-report source of truth: `indicator_division_reports`
  //    (role=OWNER) via the new contributor-chain model.
  const base = db('plan_nodes as pn')
    .join('plan_node_active_periods as pap', function () {
      this.on('pap.plan_node_id', '=', 'pn.id')
        .andOn('pap.fiscal_year_num', '=', db.raw('?', [fyInt]))
        .andOn('pap.quarter', '=', db.raw('?', [qInt]));
    })
    .leftJoin('division_codes as dc', 'pn.responsible_division_code', 'dc.code');

  if (hasDivReports) {
    base.leftJoin('indicator_division_reports as idr', function () {
      this.on('idr.plan_node_id', '=', 'pn.id')
        .andOn('idr.division_code', '=', 'pn.responsible_division_code')
        .andOn('idr.quarter', '=', db.raw('?', [qNum]))
        .andOn('idr.fiscal_year', '=', db.raw('?', [fiscalYear]))
        .andOn('idr.role', '=', db.raw('?', ['OWNER']));
    });
  }

  const rows = await base
    .where('pn.node_type', 'OUTCOME_INDICATOR')
    .whereIn('pn.tier_id', [3, 4])
    .select(
      'pn.id as indicator_id',
      'pn.responsible_division_code',
      'pn.baseline_numeric',
      db.raw(`pn.${targetCol} as quarter_target`),
      'dc.division_name',
      'dc.directorate',
      ...(hasDivReports ? [
        'idr.id as actual_id',
        'idr.status as actual_status',
        'idr.actual_value',
      ] : [
        db.raw('NULL as actual_id'),
        db.raw('NULL as actual_status'),
        db.raw('NULL as actual_value'),
      ]),
    );

  // 3. Aggregate by division
  const divMap = new Map();

  for (const row of rows) {
    const code = row.responsible_division_code || '__UNASSIGNED__';
    if (!divMap.has(code)) {
      divMap.set(code, {
        code,
        name: row.division_name || code,
        directorate: row.directorate || null,
        total_indicators: 0,
        reported_count: 0,
        approved_count: 0,
        missing_baseline_count: 0,
        missing_target_count: 0,
        achieved_count: 0,
        overperformed_count: 0,
        underperformed_count: 0,
        _achievement_sum: 0,
        _achievement_n: 0,
      });
    }
    const div = divMap.get(code);

    // Treat target=0 the same as NULL: without a positive benchmark there's
    // nothing to measure against, so the indicator is effectively not part
    // of Q<n> reporting. A division that reports on such an indicator still
    // gets bonus credit below.
    const missingTarget = row.quarter_target === null
      || row.quarter_target === undefined
      || Number(row.quarter_target) === 0;
    const status = row.actual_status;
    const hasActual = !!row.actual_id
      && status !== STATUSES.DRAFT
      && status !== STATUSES.REJECTED;
    const missingBaseline = row.baseline_numeric === null || row.baseline_numeric === undefined;

    // Missing target + no report → OUT of scope for Q<n>. Surface as a
    // data-quality warning but don't touch any progress count.
    if (missingTarget && !hasActual) {
      div.missing_target_count += 1;
      if (missingBaseline) div.missing_baseline_count += 1;
      continue;
    }

    // Missing target BUT reported → only count as bonus when actual > 0.
    // A report with actual=0 (or null) on a no-target indicator is just
    // a cosmetic "done" click — no real work was done, so it doesn't
    // deserve denominator inflation nor a credit. Still surface the
    // missing_target warning either way.
    if (missingTarget && hasActual) {
      div.missing_target_count += 1;
      if (missingBaseline) div.missing_baseline_count += 1;
      const actualN = Number(row.actual_value);
      if (row.actual_value != null && Number.isFinite(actualN) && actualN > 0) {
        div.total_indicators += 1;
        div.reported_count += 1;
        if (status === STATUSES.APPROVED || status === STATUSES.VALIDATED) {
          div.approved_count += 1;
        }
        div.achieved_count += 1;
        div.overperformed_count += 1;
        div._achievement_sum += 100;
        div._achievement_n += 1;
      }
      continue;
    }

    // Normal flow — has target.
    div.total_indicators += 1;
    if (hasActual) {
      div.reported_count += 1;
      if (status === STATUSES.APPROVED || status === STATUSES.VALIDATED) {
        div.approved_count += 1;
      }
    }
    if (missingBaseline) div.missing_baseline_count += 1;

    // Performance metrics — reached only when target > 0 (missing target
    // and target = 0 are both handled above as "out of scope / bonus").
    if (hasActual && row.actual_value != null) {
      const actual = Number(row.actual_value);
      const target = Number(row.quarter_target);
      const ratio = actual / target;
      // Achievement is CAPPED at 100 per indicator (D-20260710-02) — the
      // division average can therefore never exceed 100% either. Over/under
      // performance counters below still use the raw ratio.
      div._achievement_sum += Math.min(100, ratio * 100);
      div._achievement_n += 1;
      if (actual >= target) div.achieved_count += 1;
      if (ratio > 1.1) div.overperformed_count += 1;
      if (ratio < 0.9) div.underperformed_count += 1;
    }
  }

  // 4. Compute completion % and status for each division
  const divisions = [];
  let totalFullyReported = 0;
  let totalFullyApproved = 0;
  let totalPartiallyReported = 0;
  let totalNotStarted = 0;
  let totalIndicators = 0;
  let totalReported = 0;
  let totalMissingBaseline = 0;
  let totalMissingTarget = 0;
  let totalAchieved = 0;
  let totalUnderperformed = 0;
  let totalApproved = 0;

  for (const div of divMap.values()) {
    // Skip divisions that have nothing measurable for this quarter — they
    // only carry no-target/no-report ghosts (cas A in the dashboard guide).
    // Showing "0/0 · No Target: 1" rows just adds noise.
    if (div.total_indicators === 0) continue;

    const pct = div.total_indicators > 0
      ? Math.round((div.reported_count / div.total_indicators) * 100)
      : 0;
    const approvedPct = div.total_indicators > 0
      ? Math.round((div.approved_count / div.total_indicators) * 100)
      : 0;

    // Status semantics:
    //   fully_approved = every indicator reported AND approved (M&E sign-off done)
    //   fully_reported = every indicator reported but at least one still awaiting approval
    //   in_progress    = some indicators reported, others not
    //   not_started    = zero reported
    let status = 'not_started';
    if (pct === 100) {
      if (approvedPct === 100) {
        status = 'fully_approved';
        totalFullyApproved += 1;
      } else {
        status = 'fully_reported';
      }
      totalFullyReported += 1;
    } else if (pct > 0) {
      status = 'in_progress';
      totalPartiallyReported += 1;
    } else {
      totalNotStarted += 1;
    }

    const achievement_pct = div._achievement_n > 0
      ? Math.round(div._achievement_sum / div._achievement_n)
      : null;

    divisions.push({
      code: div.code,
      name: div.name,
      directorate: div.directorate,
      total_indicators: div.total_indicators,
      reported_count: div.reported_count,
      approved_count: div.approved_count,
      approved_pct: approvedPct,
      missing_baseline_count: div.missing_baseline_count,
      missing_target_count: div.missing_target_count,
      achieved_count: div.achieved_count,
      overperformed_count: div.overperformed_count,
      underperformed_count: div.underperformed_count,
      achievement_pct,
      completion_pct: pct,
      status,
    });

    totalIndicators += div.total_indicators;
    totalReported += div.reported_count;
    totalApproved += div.approved_count;
    totalMissingBaseline += div.missing_baseline_count;
    totalMissingTarget += div.missing_target_count;
    totalAchieved += div.achieved_count;
    totalUnderperformed += div.underperformed_count;
  }

  // Sort by name
  divisions.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const periodPayload = period
    ? {
      id: period.id,
      quarter: period.quarter,
      fiscal_year: period.fiscal_year,
      status: period.status,
      label: period.label,
      start_date: period.start_date,
      end_date: period.end_date,
    }
    : null;

  return {
    period: periodPayload,
    requested_quarter: qNum,
    divisions,
    summary: {
      total_divisions: divisions.length,
      fully_reported: totalFullyReported,
      fully_approved: totalFullyApproved,
      partially_reported: totalPartiallyReported,
      not_started: totalNotStarted,
      total_indicators: totalIndicators,
      total_reported: totalReported,
      total_approved: totalApproved,
      total_missing_baseline: totalMissingBaseline,
      total_missing_target: totalMissingTarget,
      total_achieved: totalAchieved,
      total_underperformed: totalUnderperformed,
    },
  };
};

/**
 * @returns {object} empty summary shape
 */
function buildEmptySummary() {
  return {
    total_divisions: 0,
    fully_reported: 0,
    fully_approved: 0,
    partially_reported: 0,
    not_started: 0,
    total_indicators: 0,
    total_reported: 0,
    total_approved: 0,
    total_missing_baseline: 0,
    total_missing_target: 0,
  };
}

module.exports = { getQuarterlyDashboard };
