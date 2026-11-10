/**
 * `api_keys` — personal access tokens for external consumers (Excel/Power
 * Query pulling quarterly-report data into PowerPoint, partners, etc.).
 *
 * Keys are generated once, shown to the operator at creation, and stored
 * as a SHA-256 hash. Lookup happens on `key_hash`, so the raw value is
 * not recoverable from the DB. Scopes are a JSON array of capability
 * strings ({`report_export:read`}) — thin today, expandable later.
 */
'use strict';

exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable('api_keys');
  if (exists) return;

  await knex.schema.createTable('api_keys', (t) => {
    t.increments('id').unsigned().primary();
    t.string('name', 120).notNullable();
    t.string('key_hash', 64).notNullable().unique(); // sha256 hex
    t.string('key_prefix', 12).notNullable();        // first 8 chars for UI display
    t.json('scopes').nullable();
    t.integer('created_by').unsigned().notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('last_used_at').nullable();
    t.timestamp('revoked_at').nullable();
    t.string('note', 255).nullable();

    t.foreign('created_by').references('id').inTable('users').onDelete('RESTRICT');
    t.index(['revoked_at']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('api_keys');
};
