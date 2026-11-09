/**
 * Many-to-many user ↔ division with a role qualifier.
 *
 * The `users.division_code` column stays for backwards compatibility (acts
 * as the user's "primary" division), but operational queries should now
 * read from this junction so a single user can be:
 *   - FOCAL_PERSON for several divisions
 *   - HEAD_OF_DIVISION for several divisions
 *   - Both at the same time for different divisions
 *
 * Idempotent: checks table existence + backfills only on first run.
 */
exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('users'))) return;
  if (!(await knex.schema.hasTable('division_codes'))) return;

  const has = await knex.schema.hasTable('user_divisions');
  if (!has) {
    await knex.schema.createTable('user_divisions', t => {
      t.increments('id').primary();
      t.integer('user_id').unsigned().notNullable()
        .references('id').inTable('users').onDelete('CASCADE');
      t.string('division_code', 20).notNullable()
        .references('code').inTable('division_codes').onDelete('CASCADE');
      // Two roles supported on this assignment table.
      t.enum('role', ['FOCAL_PERSON', 'HEAD_OF_DIVISION']).notNullable();
      t.timestamp('assigned_at').defaultTo(knex.fn.now()).notNullable();
      t.integer('assigned_by').unsigned().nullable()
        .references('id').inTable('users').onDelete('SET NULL');

      t.unique(['user_id', 'division_code', 'role'], 'uq_user_division_role');
      t.index(['division_code', 'role'], 'idx_user_div_role');
      t.index('user_id', 'idx_user_div_user');
    });
  }

  // ── Backfill ────────────────────────────────────────────────
  // For every user that has a division_code AND the FOCAL_PERSON or
  // HEAD_OF_DIVISION role, create a matching user_divisions row.
  // Legacy column: only present on databases created before this junction
  // table existed — fresh installs skip the backfill entirely.
  if (!(await knex.schema.hasColumn('users', 'division_code'))) return;

  const users = await knex('users')
    .leftJoin('user_roles', 'user_roles.user_id', 'users.id')
    .leftJoin('roles', 'roles.id', 'user_roles.role_id')
    .select('users.id as user_id', 'users.division_code', 'roles.code as role_code')
    .whereNotNull('users.division_code')
    .whereIn('roles.code', ['FOCAL_PERSON', 'HEAD_OF_DIVISION']);

  for (const row of users) {
    if (!row.division_code || !row.role_code) continue;
    // Check division_code actually exists in the FK table
    const divExists = await knex('division_codes').where('code', row.division_code).first();
    if (!divExists) continue;
    // Check existing assignment first to keep this idempotent
    const existing = await knex('user_divisions')
      .where({ user_id: row.user_id, division_code: row.division_code, role: row.role_code })
      .first();
    if (existing) continue;
    await knex('user_divisions').insert({
      user_id: row.user_id,
      division_code: row.division_code,
      role: row.role_code,
      assigned_by: null,
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('user_divisions');
};
