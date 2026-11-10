/**
 * Rename strategic priority P1 short_name from "Health Systems" to
 * "Primary Health Care" — Lenny's terminology alignment with the
 * official Africa CDC strategic plan. Idempotent: only updates the
 * row if its short_name still matches the legacy value.
 */
'use strict';

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('strategic_plan'))) return;
  await knex('strategic_plan')
    .where({ sp_code: 'P1', short_name: 'Health Systems' })
    .update({ short_name: 'Primary Health Care' });
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('strategic_plan'))) return;
  await knex('strategic_plan')
    .where({ sp_code: 'P1', short_name: 'Primary Health Care' })
    .update({ short_name: 'Health Systems' });
};
