/**
 * `api_key_usage_log` — one row per public-API request authenticated
 * with an API key. Lets admins see who hit what, when, from where.
 *
 * We keep the schema minimal (no body capture, no headers beyond the
 * caller IP/UA) — this is an audit trail, not request logging.
 */
'use strict';

exports.up = async function up(knex) {
  if (await knex.schema.hasTable('api_key_usage_log')) return;
  await knex.schema.createTable('api_key_usage_log', (t) => {
    t.bigIncrements('id').primary();
    t.integer('api_key_id').unsigned().notNullable();
    t.string('method', 8).notNullable();
    t.string('path', 255).notNullable();
    t.string('query', 1024).nullable();
    t.smallint('status_code').unsigned().nullable();
    t.string('ip', 64).nullable();
    t.string('user_agent', 255).nullable();
    t.smallint('duration_ms').unsigned().nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    t.foreign('api_key_id').references('id').inTable('api_keys').onDelete('CASCADE');
    t.index(['api_key_id', 'created_at']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('api_key_usage_log');
};
