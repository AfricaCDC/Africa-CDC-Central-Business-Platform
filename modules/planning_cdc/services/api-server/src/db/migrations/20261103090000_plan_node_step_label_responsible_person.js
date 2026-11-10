/**
 * Specific activity approval step: « Responsible Person of the Business Unit »
 * instead of « Head of Division approval » (D-20261103-02). The approver is
 * the unit's Responsible Person, who is not always a head of division.
 *
 * Renames the seeded label only (a label edited in Admin → Workflows is kept)
 * and the pending steps already created with it, so the approval trail reads
 * the same. No change to roles, scopes or approvers.
 */

const { ENTITY_TYPES, APPROVAL_STEP_DECISIONS } = require('@rbm/lib/enums');

const OLD = 'Head of Division approval';
const NEW = 'Responsible Person of the Business Unit';

const rename = (knex, from, to) => Promise.all([
  knex('workflow_template_steps')
    .whereIn('template_id', knex('workflow_templates').where('entity_type', ENTITY_TYPES.PLAN_NODE).select('id'))
    .where('step_label', from)
    .update({ step_label: to }),
  knex('approval_steps')
    .whereIn('approval_instance_id', knex('approval_instances').where('entity_type', ENTITY_TYPES.PLAN_NODE).select('id'))
    .where({ step_label: from, decision: APPROVAL_STEP_DECISIONS.PENDING })
    .update({ step_label: to }),
]);

exports.up = (knex) => rename(knex, OLD, NEW);
exports.down = (knex) => rename(knex, NEW, OLD);
