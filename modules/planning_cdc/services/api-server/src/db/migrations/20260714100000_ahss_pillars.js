/**
 * AHSS Pillars (D-20260714-02).
 *
 * Adds the Africa Health Systems Strategy pillar dimension to indicators:
 *   1. `pillars` reference table (name unique, sort_order) seeded from
 *      Lenny's alignment workbook — the 5 canonical AHSS pillars plus the
 *      extra labels present in the data ("Crosscuting",
 *      "Pillar 2_Supply transformation"), kept verbatim so no indicator
 *      loses its alignment; admins can rename/merge later.
 *   2. `plan_nodes.pillar_id` (nullable FK) linking each T3/T4 indicator
 *      to its pillar, seeded by indicator code from the same workbook
 *      (247 links, 100% code match verified on both local and staging).
 *
 * Source data snapshot lives in src/db/data/ahss_pillar_alignment.json.
 * Idempotent: insert-if-missing pillars, links only set when the code
 * matches (re-running refreshes links to the snapshot values).
 */

'use strict';

const alignment = require('../data/ahss_pillar_alignment.json');

exports.up = async function up(knex) {
  // ── 1. pillars reference table ────────────────────────────────
  if (!(await knex.schema.hasTable('pillars'))) {
    await knex.schema.createTable('pillars', (t) => {
      t.increments('id').primary();
      t.string('name', 160).notNullable().unique();
      t.integer('sort_order').notNullable().defaultTo(0);
      t.timestamps(true, true);
    });
  }

  const idByName = {};
  for (let i = 0; i < alignment.pillars.length; i++) {
    const name = alignment.pillars[i];
    let row = await knex('pillars').where('name', name).first();
    if (!row) {
      const [id] = await knex('pillars').insert({ name, sort_order: i + 1 });
      row = { id };
    }
    idByName[name] = row.id;
  }

  // ── 2. plan_nodes.pillar_id ───────────────────────────────────
  if (!(await knex.schema.hasColumn('plan_nodes', 'pillar_id'))) {
    await knex.schema.alterTable('plan_nodes', (t) => {
      t.integer('pillar_id').unsigned().nullable()
        .references('id').inTable('pillars').onDelete('SET NULL');
    });
  }

  // ── 3. Link indicators by code ────────────────────────────────
  for (const [code, pillarName] of Object.entries(alignment.links)) {
    const pillarId = idByName[pillarName];
    if (!pillarId) continue;
    await knex('plan_nodes')
      .where({ code, node_type: 'OUTCOME_INDICATOR' })
      .update({ pillar_id: pillarId });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasColumn('plan_nodes', 'pillar_id')) {
    await knex.schema.alterTable('plan_nodes', (t) => {
      t.dropForeign(['pillar_id']);
      t.dropColumn('pillar_id');
    });
  }
  await knex.schema.dropTableIfExists('pillars');
};
