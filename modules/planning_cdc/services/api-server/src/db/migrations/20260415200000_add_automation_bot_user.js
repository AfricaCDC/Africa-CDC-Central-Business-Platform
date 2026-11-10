/**
 * Automation bot user + `is_bot` flag (D-07).
 *
 * Purpose: provide a stable, non-interactive identity that service-to-service
 * calls can attribute to when audit rows require a `user_id`. Replaces the
 * hardcoded `roles: ['SYSTEM']` pattern flagged in master-plan CSP-07.
 *
 * What this migration does:
 *   1. Adds a boolean `is_bot` column to `users` (default false, not null)
 *      — idempotent, skipped if already present.
 *   2. Upserts a single row:
 *        email         = 'automation@system.cdc'
 *        full_name     = 'Automation Bot'
 *        password_hash = NULL      (cannot log in)
 *        status        = 'ACTIVE'
 *        is_bot        = true
 *      The bot has NO role in `user_roles` — authorization comes from the
 *      service-token `svc` claim (see `@rbm/lib/serviceToken`), never from
 *      an RBAC role.
 *
 * Idempotent on both up() and down(): safe to re-run, safe to rollback.
 */

const BOT_EMAIL = 'automation@system.cdc';

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('users'))) return;

  // 1. Add is_bot column if missing.
  if (!(await knex.schema.hasColumn('users', 'is_bot'))) {
    await knex.schema.alterTable('users', (t) => {
      t.boolean('is_bot').notNullable().defaultTo(false).after('user_type');
    });
  }

  // 2. Upsert the automation bot. Use raw INSERT ... ON DUPLICATE KEY UPDATE
  //    so the migration works on MySQL 8 regardless of Knex version.
  const existing = await knex('users').where({ email: BOT_EMAIL }).first();
  if (existing) {
    await knex('users')
      .where({ id: existing.id })
      .update({
        full_name: 'Automation Bot',
        password_hash: null,
        status: 'ACTIVE',
        is_bot: true,
        updated_at: knex.fn.now(),
      });
  } else {
    await knex('users').insert({
      email: BOT_EMAIL,
      full_name: 'Automation Bot',
      password_hash: null,
      status: 'ACTIVE',
      user_type: 'STAFF',
      is_bot: true,
    });
  }
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('users'))) return;

  // Delete the bot row first (FK-safe: no role assignments by contract).
  await knex('users').where({ email: BOT_EMAIL, is_bot: true }).delete().catch(() => {});

  // Drop the column last.
  if (await knex.schema.hasColumn('users', 'is_bot')) {
    await knex.schema.alterTable('users', (t) => {
      t.dropColumn('is_bot');
    });
  }
};
