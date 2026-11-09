// ── Pending M&E sign-offs follow the unit's current M&E officer (D-20261022-01) ──
//
// An M&E step is assigned when the report is submitted. When the unit's M&E
// officer changes, or the person loses the M&E role, the step used to stay
// with them: they kept receiving the daily reminder, and nobody else could
// see it in their queue. realignMeSteps() puts every pending M&E step back on
// the unit's current M&E officer (or the pool when the unit has none). It
// runs after every change of users or units in the admin, and before the
// daily review reminders.

'use strict';

const db = require('../config/db');
const { ROLES } = require('@rbm/lib/roles');
const { STATUSES, APPROVAL_ENTITIES, APPROVAL_STEP_DECISIONS } = require('@rbm/lib/enums');
const { createLogger } = require('@rbm/lib/logger');
const { resolveMeOfficer } = require('./approverPool');

const log = createLogger('api-server').child({ module: 'approverRealign' });

/** Pending M&E steps of reports in review, with the unit the report belongs to. */
function pendingMeSteps(knex) {
  return knex('approval_steps as s')
    .join('approval_instances as ai', 'ai.id', 's.approval_instance_id')
    .leftJoin('indicator_division_reports as ir', function indicatorReport() {
      this.on('ir.id', 'ai.entity_id').andOnVal('ai.entity_type', APPROVAL_ENTITIES.INDICATOR_DIVISION_REPORT);
    })
    .leftJoin('activity_reports as ar', function activityReport() {
      this.on('ar.id', 'ai.entity_id').andOnVal('ai.entity_type', APPROVAL_ENTITIES.ACTIVITY_REPORT);
    })
    .leftJoin('plan_nodes as p', 'p.id', knex.raw('COALESCE(ir.plan_node_id, ar.plan_node_id, CASE WHEN ai.entity_type = ? THEN ai.entity_id END)', [APPROVAL_ENTITIES.PLAN_NODE]))
    .where('s.role_code', ROLES.ME_OFFICER)
    .where('s.decision', APPROVAL_STEP_DECISIONS.PENDING)
    .where('ai.status', STATUSES.IN_REVIEW)
    // The main business unit, as when the step was created (contributor reports go to the main unit's M&E).
    .select('s.id', 's.approver_id', knex.raw('COALESCE(p.responsible_division_code, ir.division_code) as unit'));
}

/**
 * Reassign every pending M&E step whose approver is no longer the unit's M&E
 * officer. Steps of reports without a known unit are left as they are.
 *
 * @param {import('knex').Knex} [knex]
 * @returns {Promise<Array<{ step_id: number, from: number|null, to: number|null, unit: string }>>} the changes
 * @throws {Error} on DB failure
 * @example await realignMeSteps(); // [{ step_id: 893, from: 40, to: 48, unit: 'FMG' }]
 */
async function realignMeSteps(knex = db) {
  const steps = await pendingMeSteps(knex);
  const expected = new Map();
  const changes = [];
  for (const step of steps) {
    if (!step.unit) continue;
    if (!expected.has(step.unit)) expected.set(step.unit, await resolveMeOfficer(knex, step.unit));
    const to = expected.get(step.unit);
    if ((step.approver_id ?? null) === to) continue;
    await knex('approval_steps').where('id', step.id).update({ approver_id: to, updated_at: knex.fn.now() });
    changes.push({ step_id: step.id, from: step.approver_id ?? null, to, unit: step.unit });
  }
  if (changes.length) log.info({ changes }, 'approval.me_steps_realigned');
  return changes;
}

/**
 * Fire-and-forget realign, for request handlers: a failure is logged, never thrown.
 *
 * @returns {void}
 * @example realignMeStepsLater();
 */
function realignMeStepsLater() {
  realignMeSteps().catch((err) => log.error({ err: err.message }, 'approval.me_steps_realign_failed'));
}

module.exports = { realignMeSteps, realignMeStepsLater, _internals: { pendingMeSteps } };
