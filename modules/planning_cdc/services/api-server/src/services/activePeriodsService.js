// ── Active Periods Service ──
//
// "Target set ⇒ reporting expected" (D-20260708-02): a T3/T4 indicator with
// a quarterly target > 0 must be flagged active in plan_node_active_periods
// for that (current FY × quarter) — automatically, not via manual PIRS-grid
// flagging (the Q2 "PIU case": 91 indicators with Q2 targets were invisible
// on the dashboard because nobody flagged them after the Q1-only seed).
//
// ADDITIVE ONLY — never removes flags. The PIRS grid can still add extra
// quarters (e.g. bonus reporting on a no-target quarter); opting a quarter
// out of reporting means clearing its target.

'use strict';

const db = require('../config/db');
const { NODE_TYPES } = require('@rbm/lib/enums');
const { currentFy } = require('@rbm/lib/fiscalYear');
const { createLogger } = require('@rbm/lib/logger');

const log = createLogger('api-server').child({ module: 'activePeriodsService' });

const QUARTER_COLS = {
  1: 'q1_target_numeric',
  2: 'q2_target_numeric',
  3: 'q3_target_numeric',
  4: 'q4_target_numeric',
};

/**
 * Flag the plan node active for every quarter of the current FY whose
 * quarterly target is > 0. Failures are logged, never thrown — a flag-sync
 * problem must not fail the indicator save that triggered it.
 *
 * @param {number} planNodeId
 * @returns {Promise<number>} number of (fy × quarter) slots ensured (0 on skip/error)
 * @example await ensureTargetQuartersActive(42); // after a PUT that set q2_target
 */
async function ensureTargetQuartersActive(planNodeId) {
  try {
    const row = await db('plan_nodes').where('id', planNodeId).first();
    if (!row || row.node_type !== NODE_TYPES.OUTCOME_INDICATOR) return 0;
    const fy = currentFy();
    const rows = [];
    for (const [quarter, col] of Object.entries(QUARTER_COLS)) {
      if (Number(row[col]) > 0) {
        rows.push({ plan_node_id: planNodeId, fiscal_year_num: fy, quarter: Number(quarter) });
      }
    }
    if (!rows.length) return 0;
    await db('plan_node_active_periods')
      .insert(rows)
      .onConflict(['plan_node_id', 'fiscal_year_num', 'quarter'])
      .ignore();
    return rows.length;
  } catch (err) {
    log.warn({ err: err && err.message, planNodeId }, 'ensureTargetQuartersActive failed (non-fatal)');
    return 0;
  }
}

module.exports = { ensureTargetQuartersActive, QUARTER_COLS };
