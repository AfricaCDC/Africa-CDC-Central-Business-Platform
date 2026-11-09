/**
 * Add disaggregated breakdown columns to indicator_reports.
 *
 *   - `disaggregations`  (JSON) — { categoryKey: { optionKey: number, ... }, ... }
 *   - `reporting_date`   (DATE) — when the data was actually collected
 *
 * Idempotent: checks column existence before adding.
 */

exports.up = async function (knex) {
  const has = await knex.schema.hasTable('indicator_reports');
  if (!has) return;

  const cols = await knex('information_schema.columns')
    .select('column_name')
    .where({ table_schema: knex.client.database(), table_name: 'indicator_reports' });
  const have = new Set(cols.map(c => c.column_name || c.COLUMN_NAME));

  await knex.schema.alterTable('indicator_reports', t => {
    if (!have.has('disaggregations')) t.json('disaggregations').nullable();
    if (!have.has('reporting_date'))  t.date('reporting_date').nullable();
  });
};

exports.down = async function (knex) {
  const has = await knex.schema.hasTable('indicator_reports');
  if (!has) return;
  await knex.schema.alterTable('indicator_reports', t => {
    t.dropColumn('disaggregations');
    t.dropColumn('reporting_date');
  });
};
