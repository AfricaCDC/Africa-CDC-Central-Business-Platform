/**
 * Activity reports: "the activity has not started yet" (D-20261013-08).
 *
 * not_started             — the reporter ticked "not started yet"
 * expected_start_quarter  — 'Q1'..'Q4', when it is expected to start
 * expected_start_year     — fiscal year of that quarter
 *
 * A not-started report is submitted with the expected start only; the other
 * fields and the verification file are not required. Idempotent.
 */

'use strict';

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('activity_reports'))) return;
  const add = async (column, build) => {
    if (!(await knex.schema.hasColumn('activity_reports', column))) {
      await knex.schema.alterTable('activity_reports', build);
    }
  };
  await add('not_started', (t) => t.boolean('not_started').notNullable().defaultTo(false));
  await add('expected_start_quarter', (t) => t.string('expected_start_quarter', 2).nullable());
  await add('expected_start_year', (t) => t.string('expected_start_year', 4).nullable());
};

exports.down = async function down(knex) {
  for (const column of ['expected_start_year', 'expected_start_quarter', 'not_started']) {
    if (await knex.schema.hasColumn('activity_reports', column)) {
      await knex.schema.alterTable('activity_reports', (t) => t.dropColumn(column));
    }
  }
};
