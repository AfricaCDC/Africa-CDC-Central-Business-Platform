/**
 * Cleaning Phase 1.1 (D-20260530-02) — remove the dead PLAN_NODE workflow template.
 *
 * Plan-node (specific activity) approval is a direct single-HOD step handled in
 * routes/plan-nodes/specificActivities.js, NOT a template-driven workflow. The
 * `Specific Activity Approval` template (entity_type='PLAN_NODE') was seeded but
 * never used: it has zero template steps and zero approval_instances reference it.
 * Leaving it invites future code to (re)start a PLAN_NODE workflow and resurrect the
 * dual-approval-path bug this cleaning removed.
 *
 * Reversible: `down` re-creates the template row (still step-less, as it was).
 */

exports.up = async function up(knex) {
  const tpls = await knex('workflow_templates').where({ entity_type: 'PLAN_NODE' }).select('id');
  const ids = tpls.map((t) => t.id);
  if (ids.length) {
    await knex('workflow_template_steps').whereIn('template_id', ids).del();
    await knex('workflow_templates').whereIn('id', ids).del();
  }
};

exports.down = async function down(knex) {
  const exists = await knex('workflow_templates').where({ entity_type: 'PLAN_NODE' }).first();
  if (!exists) {
    await knex('workflow_templates').insert({
      name: 'Specific Activity Approval',
      entity_type: 'PLAN_NODE',
      description: 'Focal-created specific activities approved by the HOD.',
      is_active: 1,
      template_variant: 'DEFAULT',
    });
  }
};
