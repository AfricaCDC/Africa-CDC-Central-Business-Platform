/**
 * Add q1_active..q4_active boolean flags on plan_nodes.
 *
 * These let the PIRS admin declare WHICH quarters of the current fiscal
 * year an indicator is reported for. The existing q{1..4}_target_numeric
 * columns carry the quarterly target VALUE but nothing before today told
 * the reporting UI whether Q1 is even expected to have a submission or
 * if the indicator is (e.g.) annual-only / semester-based.
 *
 * workplan_items already has the same four booleans — we mirror them
 * here so OUTCOME_INDICATOR nodes can carry the same signal.
 *
 * Default TRUE for all four so existing indicators keep their current
 * "reportable every quarter" behaviour until an admin narrows the scope.
 */

'use strict';

exports.up = async function up(knex) {
  const addBool = async (col) => {
    if (!(await knex.schema.hasColumn('plan_nodes', col))) {
      await knex.schema.alterTable('plan_nodes', (t) => {
        t.boolean(col).notNullable().defaultTo(true);
      });
    }
  };
  await addBool('q1_active');
  await addBool('q2_active');
  await addBool('q3_active');
  await addBool('q4_active');
};

exports.down = async function down(knex) {
  for (const col of ['q1_active', 'q2_active', 'q3_active', 'q4_active']) {
    // eslint-disable-next-line no-await-in-loop
    if (await knex.schema.hasColumn('plan_nodes', col)) {
      // eslint-disable-next-line no-await-in-loop
      await knex.schema.alterTable('plan_nodes', (t) => t.dropColumn(col));
    }
  }
};
