/**
 * Add `rejection_reason` to indicator_reports.
 * Idempotent: safe to re-run.
 */
exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('indicator_reports'))) return;
  const cols = await knex('information_schema.columns')
    .select('column_name')
    .where({ table_schema: knex.client.database(), table_name: 'indicator_reports' });
  const have = new Set(cols.map(c => c.column_name || c.COLUMN_NAME));

  await knex.schema.alterTable('indicator_reports', t => {
    if (!have.has('rejection_reason')) t.text('rejection_reason').nullable();
    if (!have.has('reviewed_by'))      t.integer('reviewed_by').unsigned().nullable();
    if (!have.has('reviewed_at'))      t.datetime('reviewed_at').nullable();
  });
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('indicator_reports'))) return;
  await knex.schema.alterTable('indicator_reports', t => {
    t.dropColumn('rejection_reason');
    t.dropColumn('reviewed_by');
    t.dropColumn('reviewed_at');
  });
};
