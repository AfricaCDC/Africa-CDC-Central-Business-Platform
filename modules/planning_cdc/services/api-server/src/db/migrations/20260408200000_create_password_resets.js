/**
 * Password reset tokens (decided 2026-04-08).
 *
 * Stores one row per pending password-reset request. The token sent
 * by email is ONLY the random bytes — we store its SHA-256 hash in
 * `token_hash` so a DB leak never exposes valid tokens.
 *
 * Lifecycle:
 *   1. POST /auth/forgot-password: insert row with token_hash,
 *      expires_at = NOW() + 1h, used_at = NULL
 *   2. POST /auth/reset-password: lookup by hash, check expires + used,
 *      bcrypt new password, set used_at = NOW()
 *   3. Expired rows stay in the table for audit; a daily cron can
 *      DELETE them if volume grows.
 *
 * Idempotent: only creates the table if missing.
 */
exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('users'))) return;
  if (await knex.schema.hasTable('password_resets')) return;

  await knex.schema.createTable('password_resets', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    // SHA-256 of the random token sent to the user. 64 hex chars.
    t.string('token_hash', 64).notNullable().unique();
    t.timestamp('expires_at').notNullable();
    t.timestamp('used_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    // Best-effort audit: IP that requested the reset.
    t.string('ip_address', 45).nullable();

    t.index('user_id', 'idx_pwr_user');
    t.index('expires_at', 'idx_pwr_expires');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('password_resets');
};
