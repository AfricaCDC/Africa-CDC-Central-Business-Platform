/**
 * Add `activity_type` column to plan_nodes (decided 2026-04-08 meeting).
 *
 * Every SPECIFIC_ACTIVITY that a focal person creates must be classified
 * under one of six categories so HR / procurement / finance can plan
 * resources ahead of time:
 *
 *   PROCUREMENT, TRAINING, MEETING, CONFERENCE, WORKSHOP, TECHNICAL_ASSISTANCE
 *
 * The column is nullable on purpose — the existing ~570 imported TASK
 * rows and the ~103 seeded BROAD activities pre-date this decision and
 * we don't want the import pipeline to block on NULLs. Only the
 * user-facing SPECIFIC_ACTIVITY form enforces the choice.
 *
 * Idempotent: guarded by hasColumn so re-runs are a no-op.
 */

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('plan_nodes'))) return;
  const has = await knex.schema.hasColumn('plan_nodes', 'activity_type');
  if (has) return;

  await knex.raw(`
    ALTER TABLE plan_nodes
      ADD COLUMN activity_type
        ENUM('PROCUREMENT','TRAINING','MEETING','CONFERENCE','WORKSHOP','TECHNICAL_ASSISTANCE')
        NULL
        AFTER node_type
  `);
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('plan_nodes'))) return;
  const has = await knex.schema.hasColumn('plan_nodes', 'activity_type');
  if (!has) return;
  await knex.schema.alterTable('plan_nodes', (t) => {
    t.dropColumn('activity_type');
  });
};
