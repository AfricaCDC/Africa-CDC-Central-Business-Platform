/**
 * indicator_broad_links — broad activity ↔ T3/T4 indicator (many-to-many),
 * edited on /pirs/mapping (D-20261016-04).
 *
 * The table exists in production (created outside the migrations when the
 * plan was imported) but no migration created it, so a fresh database lacked
 * it. Created here only when missing, with the production definition; a
 * no-op in production.
 */

'use strict';

exports.up = async (knex) => {
  if (await knex.schema.hasTable('indicator_broad_links')) return;
  await knex.schema.createTable('indicator_broad_links', (t) => {
    t.increments('id');
    t.integer('indicator_id').unsigned().notNullable().references('id').inTable('plan_nodes').onDelete('CASCADE');
    t.integer('broad_activity_id').unsigned().notNullable().references('id').inTable('plan_nodes').onDelete('CASCADE');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['indicator_id', 'broad_activity_id']);
    t.index('indicator_id', 'idx_ibl_indicator');
    t.index('broad_activity_id', 'idx_ibl_broad');
  });
};

// Never dropped: production holds the links imported with the plan.
exports.down = async () => {};
