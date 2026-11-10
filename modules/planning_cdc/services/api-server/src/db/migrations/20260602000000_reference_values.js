/**
 * `reference_values` — a lightweight, admin-curatable lookup table that backs
 * the funding-source / grant-name comboboxes on the Specific Activity form (H-3).
 *
 * Shape: one row per (type, value). `type` is one of REFERENCE_TYPES
 * (FUNDING_SOURCE | GRANT). The combobox always allows free text — this table
 * only supplies *suggestions*. The reference endpoint unions these curated rows
 * with the distinct values already used on plan_nodes, so user-typed values
 * surface as suggestions over time without any admin action.
 *
 * The `up` step seeds the known Africa CDC funding sources (the donor list the
 * platform already reports against + common internal sources). It is idempotent:
 * the unique (type, value) index + INSERT IGNORE means re-runs are a no-op, and
 * the table is only seeded when empty. GRANT is left to grow from real data.
 */

const FUNDING_SOURCES = [
  'African Union',
  'Member State Contributions',
  'Internal / Core Budget',
  'World Bank',
  'GAVI',
  'CEPI',
  'EU / HERA',
  'UNICEF',
  'AfDB',
  'FCDO',
  'MasterCard Foundation',
  'SBTF',
  'Korea Fund',
  'WHO',
  'US CDC',
  'Gates Foundation',
];

exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable('reference_values');
  if (!exists) {
    await knex.schema.createTable('reference_values', (t) => {
      t.increments('id').unsigned().primary();
      t.string('type', 40).notNullable();
      t.string('value', 255).notNullable();
      t.integer('sort_order').notNullable().defaultTo(0);
      t.boolean('active').notNullable().defaultTo(true);
      t.timestamps(true, true);
      t.unique(['type', 'value'], { indexName: 'uq_reference_values_type_value' });
      t.index(['type', 'active'], 'idx_reference_values_type_active');
    });
  }

  const [{ n }] = await knex('reference_values').count({ n: '*' });
  if (Number(n) === 0) {
    const rows = FUNDING_SOURCES.map((value, i) => ({
      type: 'FUNDING_SOURCE',
      value,
      sort_order: i,
      active: true,
    }));
    // INSERT IGNORE so a partial re-run never throws on the unique index.
    await knex('reference_values').insert(rows).onConflict(['type', 'value']).ignore();
  }
};

exports.down = async function down(knex) {
  const exists = await knex.schema.hasTable('reference_values');
  if (exists) await knex.schema.dropTable('reference_values');
};
