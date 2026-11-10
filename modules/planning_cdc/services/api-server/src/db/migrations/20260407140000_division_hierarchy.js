/**
 * Division hierarchy: turn `division_codes` into a self-referencing tree.
 *
 * Adds:
 *   - parent_code VARCHAR(20) NULL  (FK → division_codes.code, ON DELETE SET NULL)
 *   - sort_order  INT       DEFAULT 0
 *
 * NO auto-backfill — earlier versions of this migration generated synthetic
 * "DIR_*" parent rows from the legacy free-text `directorate` column, but
 * Lenny defines the directorate hierarchy by hand from the org chart UI.
 * Every existing row stays at parent_code = NULL until manually re-parented.
 *
 * Idempotent: safe to re-run, only adds columns that are missing.
 */
exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('division_codes'))) return;

  const cols = await knex('information_schema.columns')
    .select('column_name')
    .where({ table_schema: knex.client.database(), table_name: 'division_codes' });
  const have = new Set(cols.map(c => c.column_name || c.COLUMN_NAME));

  await knex.schema.alterTable('division_codes', t => {
    if (!have.has('parent_code')) {
      t.string('parent_code', 20).nullable().after('code');
    }
    if (!have.has('sort_order')) {
      t.integer('sort_order').defaultTo(0).notNullable().after('directorate');
    }
  });

  if (!have.has('parent_code')) {
    try {
      await knex.schema.alterTable('division_codes', t => {
        t.foreign('parent_code', 'fk_div_parent')
          .references('code').inTable('division_codes')
          .onDelete('SET NULL');
        t.index('parent_code', 'idx_div_parent');
      });
    } catch (e) {
      // Constraint may already exist on a partial re-run; safe to ignore.
    }
  }
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('division_codes'))) return;
  await knex.schema.alterTable('division_codes', t => {
    try { t.dropForeign('parent_code', 'fk_div_parent'); } catch (e) {}
    try { t.dropIndex('parent_code', 'idx_div_parent'); } catch (e) {}
    t.dropColumn('parent_code');
    t.dropColumn('sort_order');
  });
};
