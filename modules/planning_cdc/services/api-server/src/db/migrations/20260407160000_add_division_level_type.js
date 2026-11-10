/**
 * Division level classification — Africa CDC uses 3 organisational levels:
 *
 *   directorate  → top-level centre / directorate
 *   division     → child of a directorate
 *   unit         → child of a division
 *
 * This column is a semantic label on top of the parent_code tree — it
 * doesn't constrain the structure itself, but lets the UI show typed
 * badges and lets future features (dashboards, dropdowns) filter by
 * level. Nullable so rows can stay unclassified until Lenny assigns them
 * by hand from the org chart UI.
 *
 * NO auto-backfill — Lenny defines every directorate/division/unit
 * manually from the page so the system never invents structure.
 *
 * Idempotent: re-runs only add the column if missing.
 */

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('division_codes'))) return;

  const cols = await knex('information_schema.columns')
    .select('column_name')
    .where({ table_schema: knex.client.database(), table_name: 'division_codes' });
  const have = new Set(cols.map(c => c.column_name || c.COLUMN_NAME));

  if (!have.has('level_type')) {
    await knex.schema.alterTable('division_codes', t => {
      t.enum('level_type', ['directorate', 'division', 'unit']).nullable().after('alias_of');
    });
    try {
      await knex.schema.alterTable('division_codes', t => {
        t.index('level_type', 'idx_div_level_type');
      });
    } catch (e) { /* re-run → already indexed */ }
  }
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('division_codes'))) return;
  await knex.schema.alterTable('division_codes', t => {
    try { t.dropIndex('level_type', 'idx_div_level_type'); } catch (e) {}
    t.dropColumn('level_type');
  });
};
