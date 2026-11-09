/**
 * Re-seed the PLAN_NODE (specific activity) workflow template.
 *
 * Supersedes D-20260530-02 (which removed it) per D-20260817-02
 * ("TOUJOURS BRANCHER"): specific-activity approval flows through the
 * template engine again — default chain identical to today's behaviour
 * (one step, Head of Division of the responsible division).
 *
 * Idempotent: skips when an active PLAN_NODE DEFAULT template exists.
 * Spec: docs/superpowers/specs/2026-08-17-workflow-templates-master-design.md
 */

exports.up = async function (knex) {
  const existing = await knex('workflow_templates')
    .where({ entity_type: 'PLAN_NODE', template_variant: 'DEFAULT', is_active: true })
    .first();
  if (existing) return;
  const [id] = await knex('workflow_templates').insert({
    name: 'Specific Activity Approval',
    entity_type: 'PLAN_NODE',
    template_variant: 'DEFAULT',
    description: 'New/edited specific activities approved by the Head of Division before entering the workplan.',
    is_active: true,
  });
  await knex('workflow_template_steps').insert({
    template_id: id,
    step_order: 1,
    step_label: 'Head of Division approval',
    role_code: 'HEAD_OF_DIVISION',
    // eslint-disable-next-line no-restricted-syntax -- 'DIVISION' is the step-scope column-enum value, not an ENTITY_TYPES reference.
    scope: 'DIVISION',
    is_required: true,
  });
};

exports.down = async function (knex) {
  const t = await knex('workflow_templates')
    .where({ entity_type: 'PLAN_NODE', name: 'Specific Activity Approval' })
    .first();
  if (!t) return;
  await knex('workflow_template_steps').where('template_id', t.id).del();
  await knex('workflow_templates').where('id', t.id).del();
};
