// ── Audit log extensions ──
//
// Extends the existing `audit_events` table created in
// `20240220000000_amert_v3_full_schema.js` with:
//   - `ip_address` (VARCHAR 45) — supports IPv6
//   - `user_agent` (VARCHAR 500)
//   - relaxes `action` from a fixed enum to a free-form VARCHAR(100) so
//     security-relevant actions like LOGIN, LOGIN_FAILED, LOGOUT, ROLE_CHANGE
//     can be recorded without re-running the migration every time we add a
//     new event type.
//   - adds composite indexes for the most common audit queries.
//
// MIGRATION SAFETY:
// This migration is idempotent (`hasColumn` guards) and only ALTERs an
// existing table — it never drops data.

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('audit_events');
  if (!hasTable) {
    // The base table is created by the v3 schema migration. If it does not
    // exist yet, create the full table here so this migration can be applied
    // standalone in test environments.
    await knex.schema.createTable('audit_events', (t) => {
      t.increments('id').unsigned().primary();
      t.string('entity_type', 50).notNullable();
      t.integer('entity_id').unsigned().nullable();
      t.string('action', 100).notNullable();
      t.integer('actor_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
      t.json('details').nullable();
      t.string('ip_address', 45).nullable();
      t.string('user_agent', 500).nullable();
      t.datetime('timestamp').defaultTo(knex.fn.now()).notNullable();
      t.index(['entity_type', 'entity_id'], 'audit_events_entity_idx');
      t.index('actor_id', 'audit_events_actor_idx');
      t.index('timestamp', 'audit_events_timestamp_idx');
      t.index(['action', 'timestamp'], 'audit_events_action_idx');
    });
    return;
  }

  // Add ip_address column if missing
  const hasIp = await knex.schema.hasColumn('audit_events', 'ip_address');
  if (!hasIp) {
    await knex.schema.alterTable('audit_events', (t) => {
      t.string('ip_address', 45).nullable();
    });
  }

  // Add user_agent column if missing
  const hasUa = await knex.schema.hasColumn('audit_events', 'user_agent');
  if (!hasUa) {
    await knex.schema.alterTable('audit_events', (t) => {
      t.string('user_agent', 500).nullable();
    });
  }

  // Relax `action` from ENUM to VARCHAR(100). MySQL stores ENUM as a special
  // type and ALTER COLUMN is the only way to widen it. Wrap in try/catch so
  // a re-run on an already-migrated DB does not fail.
  try {
    await knex.raw(
      "ALTER TABLE `audit_events` MODIFY COLUMN `action` VARCHAR(100) NOT NULL"
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[audit_log_extensions] could not widen `action` column', err && err.message);
  }

  // Add composite (action, timestamp) index for "all LOGIN events in last 24h"
  // style queries used by the security dashboard.
  try {
    await knex.raw(
      'CREATE INDEX `audit_events_action_idx` ON `audit_events` (`action`, `timestamp`)'
    );
  } catch (err) {
    // Index probably exists already; ignore.
  }
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  // We only roll back the additive changes, never the table itself.
  const hasTable = await knex.schema.hasTable('audit_events');
  if (!hasTable) return;

  try { await knex.raw('DROP INDEX `audit_events_action_idx` ON `audit_events`'); } catch (e) { /* ignore */ }

  const hasUa = await knex.schema.hasColumn('audit_events', 'user_agent');
  if (hasUa) {
    await knex.schema.alterTable('audit_events', (t) => { t.dropColumn('user_agent'); });
  }
  const hasIp = await knex.schema.hasColumn('audit_events', 'ip_address');
  if (hasIp) {
    await knex.schema.alterTable('audit_events', (t) => { t.dropColumn('ip_address'); });
  }
};
