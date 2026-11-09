/**
 * Add `round` column on approval_instances.
 *
 * The contributor workflow engine increments a round counter on each
 * resubmission of a previously-rejected instance (spec §7.5). The earlier
 * migration `20260415300000_contributor_approval_chain.js` added `round`
 * on `approval_steps` but forgot it on `approval_instances`, so every
 * insert on a contributor instance was failing with
 *   "Unknown column 'round' in 'INSERT INTO'".
 *
 * This migration backfills the column.
 */

'use strict';

exports.up = async function up(knex) {
  const has = await knex.schema.hasColumn('approval_instances', 'round');
  if (!has) {
    await knex.schema.alterTable('approval_instances', (t) => {
      t.integer('round').notNullable().defaultTo(1);
    });
  }
};

exports.down = async function down(knex) {
  const has = await knex.schema.hasColumn('approval_instances', 'round');
  if (has) {
    await knex.schema.alterTable('approval_instances', (t) => {
      t.dropColumn('round');
    });
  }
};
