/**
 * Add `options` JSON column to indicator_disaggregations so each
 * disaggregation can carry its own list of buckets (e.g. Sex →
 * [{code:'male',label:'Male'},{code:'female',label:'Female'}]).
 * Before this column, only the name/description pair was stored and
 * option values lived client-side.
 */
'use strict';

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('indicator_disaggregations'))) return;
  if (await knex.schema.hasColumn('indicator_disaggregations', 'options')) return;
  await knex.schema.alterTable('indicator_disaggregations', (t) => {
    t.json('options').nullable();
    t.string('code', 50).nullable();
    t.index(['code']);
  });
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('indicator_disaggregations'))) return;
  if (await knex.schema.hasColumn('indicator_disaggregations', 'options')) {
    await knex.schema.alterTable('indicator_disaggregations', (t) => {
      t.dropColumn('options');
      t.dropColumn('code');
    });
  }
};
