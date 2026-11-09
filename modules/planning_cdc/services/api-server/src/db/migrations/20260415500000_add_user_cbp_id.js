/**
 * Add `users.cbp_id` — stable external identifier coming from the CBP
 * directory (Capacity Building Platform).
 *
 * Used by `POST /api/admin/sync-staff` (D-03) to upsert staff records on
 * every CBP sync run. A unique index guarantees idempotency across
 * overlapping cron triggers.
 *
 * Nullable because existing users (Lenny, admins created before the
 * sync existed) don't have a CBP entry. Backfilled opportunistically on
 * the first sync that matches their email.
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasColumn('users', 'cbp_id')) return;

  await knex.schema.alterTable('users', (t) => {
    t.string('cbp_id', 64).nullable().after('email');
  });

  try {
    await knex.schema.alterTable('users', (t) => {
      t.unique('cbp_id', 'uq_users_cbp_id');
    });
  } catch (_e) {
    // Unique index already exists — treat as idempotent, don't fail the migration.
  }
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasColumn('users', 'cbp_id'))) return;

  try {
    await knex.schema.alterTable('users', (t) => {
      t.dropUnique('cbp_id', 'uq_users_cbp_id');
    });
  } catch (_e) { /* already gone */ }

  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('cbp_id');
  });
};
