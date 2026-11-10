/**
 * Seed plan_node_active_periods so every T3/T4 OUTCOME_INDICATOR is
 * flagged as reportable for FY4 · Q1 (the currently open period).
 *
 * Without this seed the /reporting/quarterly-dashboard, the
 * `/indicator-division-reports/review-queue` and the `Due this Q`
 * column in `/my-indicators` would all show zero indicators — the
 * table is the authoritative source of "is this indicator expected
 * to report in that slot". We populate only (fy=4, q=1) for now;
 * admins can extend to other slots via the PIRS editor grid.
 *
 * Idempotent: uses INSERT IGNORE so re-running against a partially
 * seeded DB is safe and never duplicates rows.
 */

'use strict';

exports.up = async function up(knex) {
  const inds = await knex('plan_nodes')
    .where({ node_type: 'OUTCOME_INDICATOR' })
    .whereIn('tier_id', [3, 4])
    .pluck('id');
  if (!inds.length) return;

  const rows = inds.map((id) => ({
    plan_node_id: id,
    fiscal_year_num: 4,
    quarter: 1,
  }));

  // onConflict().ignore() keeps the migration idempotent across reruns.
  await knex('plan_node_active_periods').insert(rows).onConflict(['plan_node_id', 'fiscal_year_num', 'quarter']).ignore();
};

exports.down = async function down(knex) {
  // Only delete rows that match the seed set so we don't wipe admin-added
  // periods.
  await knex('plan_node_active_periods').where({ fiscal_year_num: 4, quarter: 1 }).delete();
};
