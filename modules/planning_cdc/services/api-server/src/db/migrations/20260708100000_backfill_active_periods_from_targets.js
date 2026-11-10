/**
 * Backfill plan_node_active_periods from quarterly targets (D-20260708-02).
 *
 * Rule (Lenny): a quarterly target > 0 MEANS reporting is expected that
 * quarter — the active flag must follow the target automatically.
 *
 * History: the FY4·Q1 seed (20260419400000) blanket-flagged every T3/T4 for
 * Q1 only and left Q2-Q4 to manual PIRS-grid flagging. Result: 91 indicators
 * with a Q2 target but no Q2 flag → 30 divisions invisible or incomplete on
 * the quarterly dashboard (the "PIU case"). This migration flags FY4 Q1-Q4
 * wherever the matching qN_target_numeric > 0.
 *
 * Additive only (INSERT ... ON CONFLICT IGNORE): admin-added flags for
 * no-target quarters are never touched. Going forward the same rule runs on
 * every indicator create/update (services/activePeriodsService.js).
 */

'use strict';

const FY = 4;
const QUARTER_COLS = {
  1: 'q1_target_numeric',
  2: 'q2_target_numeric',
  3: 'q3_target_numeric',
  4: 'q4_target_numeric',
};

exports.up = async function up(knex) {
  for (const [quarter, col] of Object.entries(QUARTER_COLS)) {
    const ids = await knex('plan_nodes')
      .where('node_type', 'OUTCOME_INDICATOR')
      .whereIn('tier_id', [3, 4])
      .where(col, '>', 0)
      .pluck('id');
    if (!ids.length) continue;
    const rows = ids.map((id) => ({
      plan_node_id: id,
      fiscal_year_num: FY,
      quarter: Number(quarter),
    }));
    await knex('plan_node_active_periods')
      .insert(rows)
      .onConflict(['plan_node_id', 'fiscal_year_num', 'quarter'])
      .ignore();
  }
};

exports.down = async function down() {
  // Intentionally irreversible: backfilled rows are indistinguishable from
  // admin-added flags, and deleting flags would silently hide indicators
  // from open reporting windows.
};
