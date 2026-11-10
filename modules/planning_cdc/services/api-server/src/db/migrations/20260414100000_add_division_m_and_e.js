/**
 * Add `m_and_e_user_id` to `division_codes`.
 *
 * Each division has a single assigned M&E Officer who can view (read-only)
 * all activities and reports of the division, including any aliases of it,
 * but cannot create / update / delete and has no access to the global
 * Reports hub. Follows the same 1:1 pattern as focal_user_id and
 * responsible_user_id (see 20260408120000).
 *
 * Idempotent.
 */

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('division_codes'))) return;
  if (!(await knex.schema.hasTable('users'))) return;

  const cols = await knex('information_schema.columns')
    .select('column_name')
    .where({ table_schema: knex.client.database(), table_name: 'division_codes' });
  const have = new Set(cols.map((c) => c.column_name || c.COLUMN_NAME));

  if (!have.has('m_and_e_user_id')) {
    await knex.schema.alterTable('division_codes', (t) => {
      t.integer('m_and_e_user_id').unsigned().nullable()
        .references('id').inTable('users').onDelete('SET NULL')
        .after('responsible_user_id');
    });
  }

  // Reverse-lookup index: "which divisions is this user M&E for?"
  try {
    await knex.schema.alterTable('division_codes', (t) => {
      t.index('m_and_e_user_id', 'idx_div_m_and_e_user');
    });
  } catch (e) { /* re-run → already exists */ }
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('division_codes'))) return;

  try {
    await knex.schema.alterTable('division_codes', (t) => {
      t.dropIndex('m_and_e_user_id', 'idx_div_m_and_e_user');
    });
  } catch (e) { /* best effort */ }

  await knex.schema.alterTable('division_codes', (t) => {
    t.dropColumn('m_and_e_user_id');
  });
};
