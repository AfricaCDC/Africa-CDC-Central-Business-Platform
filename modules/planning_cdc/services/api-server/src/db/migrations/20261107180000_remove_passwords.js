/**
 * Remove passwords (D-20261107-03).
 *
 * Users sign in with their Africa CDC Microsoft account only. The password
 * login, forgot-password and reset-password flows were removed, and every
 * stored hash was cleared in production on 2026-11-07 after a backup (353 of
 * the 379 hashes were the shared default password of the CBP staff sync).
 * This drops what is left: the `users.password_hash` column, the
 * `password_resets` table, and the notification events, subscriptions and
 * email template of the password flows (failed login, reset requested,
 * admin reset link, reset completed).
 *
 * `down` puts back an empty nullable column and an empty table; the
 * passwords and the notification rows are not restored.
 */
const PASSWORD_EVENTS = Object.freeze([
  'user.login_failed',
  'user.password_reset_requested',
  'user.password_reset_admin_sent',
  'user.password_reset_completed',
]);
const PASSWORD_TEMPLATE = 'password-reset';

async function dropNotificationRows(knex) {
  if (await knex.schema.hasTable('notification_subscriptions')) {
    await knex('notification_subscriptions')
      .whereIn('event_key', PASSWORD_EVENTS).orWhere('template_key', PASSWORD_TEMPLATE).del();
  }
  if (await knex.schema.hasTable('notification_templates')) {
    await knex('notification_templates').where('template_key', PASSWORD_TEMPLATE).del();
  }
  if (await knex.schema.hasTable('notification_events')) {
    await knex('notification_events').whereIn('event_key', PASSWORD_EVENTS).del();
  }
}

exports.up = async (knex) => {
  await dropNotificationRows(knex);
  await knex.schema.dropTableIfExists('password_resets');
  if (await knex.schema.hasColumn('users', 'password_hash')) {
    await knex.schema.alterTable('users', (t) => t.dropColumn('password_hash'));
  }
};

exports.down = async (knex) => {
  if (!(await knex.schema.hasColumn('users', 'password_hash'))) {
    await knex.schema.alterTable('users', (t) => t.string('password_hash', 255).nullable());
  }
  if (await knex.schema.hasTable('password_resets')) return;
  await knex.schema.createTable('password_resets', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('token_hash', 64).notNullable().unique();
    t.timestamp('expires_at').notNullable();
    t.timestamp('used_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    t.string('ip_address', 45).nullable();
    t.index('user_id', 'idx_pwr_user');
    t.index('expires_at', 'idx_pwr_expires');
  });
};
