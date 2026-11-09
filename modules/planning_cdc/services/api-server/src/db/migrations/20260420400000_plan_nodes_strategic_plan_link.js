/**
 * Link OUTCOME_AREA plan_nodes to a strategic_plan row (priority OR enabler).
 *
 * RBM context: an "Outcome" in the plan and a "Strategic Priority/Enabler"
 * in the strategic plan are the same concept under different naming
 * conventions. There were 13 outcomes and 13 priorities+enablers, never
 * formally linked. This migration:
 *   1. adds `plan_nodes.strategic_plan_id` (nullable FK)
 *   2. seeds the initial 13 mappings (semantic match — verified by Lenny)
 *
 * The column is nullable for safety: only OUTCOME_AREA rows ever populate
 * it; everything else stays NULL.
 */
'use strict';

// Outcome code → strategic_plan.sp_code
const SEED_MAP = Object.freeze({
  '1.1': 'P1', // Health Systems
  '2.1': 'P2', // Surveillance
  '2.2': 'P3', // Emergency PPPR
  '2.3': 'P4', // NPHIs
  '2.4': 'P5', // Laboratories
  '3.1': 'P6', // Manufacturing
  '3.2': 'EA', // Digital
  '3.3': 'EB', // Workforce
  '3.4': 'ED', // Research
  '4.1': 'EF', // RCCs
  '4.2': 'EG', // Governance
  '5.1': 'EC', // Financing
  '5.2': 'EE', // Partnerships
});

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('plan_nodes'))) return;
  if (!(await knex.schema.hasTable('strategic_plan'))) return;

  if (!(await knex.schema.hasColumn('plan_nodes', 'strategic_plan_id'))) {
    await knex.schema.alterTable('plan_nodes', (t) => {
      t.integer('strategic_plan_id').unsigned().nullable();
      t.foreign('strategic_plan_id').references('strategic_plan.id').onDelete('SET NULL');
      t.index(['strategic_plan_id']);
    });
  }

  // Seed the 13 known mappings. Idempotent — only updates rows that don't
  // already have a link, so re-running won't overwrite manual edits.
  const sps = await knex('strategic_plan').select('id', 'sp_code');
  const idByCode = {};
  for (const r of sps) idByCode[String(r.sp_code).toUpperCase()] = r.id;

  for (const [outcomeCode, spCode] of Object.entries(SEED_MAP)) {
    const spId = idByCode[String(spCode).toUpperCase()];
    if (!spId) continue;
    await knex('plan_nodes')
      .where({ node_type: 'OUTCOME_AREA', code: outcomeCode })
      .whereNull('strategic_plan_id')
      .update({ strategic_plan_id: spId });
  }
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('plan_nodes'))) return;
  if (!(await knex.schema.hasColumn('plan_nodes', 'strategic_plan_id'))) return;
  await knex.schema.alterTable('plan_nodes', (t) => {
    t.dropForeign(['strategic_plan_id']);
    t.dropIndex(['strategic_plan_id']);
    t.dropColumn('strategic_plan_id');
  });
};
