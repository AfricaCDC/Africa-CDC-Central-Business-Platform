/**
 * Add `plan_nodes.is_big_ticket TINYINT(1) NULL` — a manual leadership-priority
 * flag curated by M&E in the PIRS/indicator form and used only to filter the
 * review-submissions and division-report queues. No backfill: all rows start
 * NULL/0. Idempotent — guarded by hasColumn, mirroring the is_operational
 * precedent (20260412200000_specific_activity_extra_fields.js).
 */
'use strict';

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('plan_nodes'))) return;
  if (await knex.schema.hasColumn('plan_nodes', 'is_big_ticket')) return;
  await knex.raw('ALTER TABLE plan_nodes ADD COLUMN is_big_ticket TINYINT(1) NULL AFTER is_operational');
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('plan_nodes'))) return;
  if (!(await knex.schema.hasColumn('plan_nodes', 'is_big_ticket'))) return;
  await knex.raw('ALTER TABLE plan_nodes DROP COLUMN is_big_ticket');
};
