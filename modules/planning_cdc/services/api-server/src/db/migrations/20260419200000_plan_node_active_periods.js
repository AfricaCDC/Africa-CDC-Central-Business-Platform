/**
 * Reporting periods table: one row per (indicator × fiscal_year × quarter)
 * that the indicator is actively reported on.
 *
 * Supersedes the plan_nodes.q{1..4}_active flags (dropped below) — those
 * were global, year-agnostic, and could not express "FY4 reports Q1+Q2+Q4
 * but FY5 reports only Q2+Q4".
 *
 * `fiscal_year_num` is the FY index (1..N) matching the central helper
 * packages/lib/fiscalYear.js (FY1 = 2023). Extending the plan to more
 * years does NOT require a schema change — just insert rows with a
 * larger `fiscal_year_num`.
 */

'use strict';

exports.up = async function up(knex) {
  // 1. Drop the short-lived plan_nodes.q{1..4}_active flags introduced in
  //    20260419100000 — they're replaced by the new association table.
  for (const col of ['q1_active', 'q2_active', 'q3_active', 'q4_active']) {
    // eslint-disable-next-line no-await-in-loop
    if (await knex.schema.hasColumn('plan_nodes', col)) {
      // eslint-disable-next-line no-await-in-loop
      await knex.schema.alterTable('plan_nodes', (t) => t.dropColumn(col));
    }
  }

  // 2. Create the association table.
  const exists = await knex.schema.hasTable('plan_node_active_periods');
  if (!exists) {
    await knex.schema.createTable('plan_node_active_periods', (t) => {
      t.integer('plan_node_id').unsigned().notNullable();
      t.tinyint('fiscal_year_num').unsigned().notNullable();
      t.tinyint('quarter').unsigned().notNullable();
      t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      t.primary(['plan_node_id', 'fiscal_year_num', 'quarter']);
      t.foreign('plan_node_id').references('plan_nodes.id').onDelete('CASCADE');
      t.index(['fiscal_year_num', 'quarter'], 'idx_active_periods_fy_q');
    });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable('plan_node_active_periods')) {
    await knex.schema.dropTable('plan_node_active_periods');
  }
  for (const col of ['q1_active', 'q2_active', 'q3_active', 'q4_active']) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await knex.schema.hasColumn('plan_nodes', col))) {
      // eslint-disable-next-line no-await-in-loop
      await knex.schema.alterTable('plan_nodes', (t) => {
        t.boolean(col).notNullable().defaultTo(true);
      });
    }
  }
};
