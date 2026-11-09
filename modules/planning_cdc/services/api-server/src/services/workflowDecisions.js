/**
 * @module workflowDecisions
 *
 * Generic "decide the current step" helper shared by every template-driven
 * flow. Generalises the proven INDICATOR_DIVISION_REPORT pattern
 * (indicatorDivisionReportsService.findPendingStepForUser) so activity
 * reports, indicator actuals, division reports and plan nodes can route
 * approve/reject through the workflow engine with a uniform contract.
 *
 * Contract: `decideEntityStep` returns `{ handled: false }` when there is
 * no open IN_REVIEW instance for the entity (template toggled off — the
 * caller falls back to its direct status update), or when a scope-all
 * caller has nothing actionable. It throws 403 NO_PENDING_STEP when an
 * instance exists but the non-admin caller has no assigned step.
 *
 * Spec: docs/superpowers/specs/2026-08-17-workflow-templates-master-design.md
 */

'use strict';

const db = require('../config/db');
const workflowEngine = require('./workflowEngine');
const { actingFor, whereActionable } = require('./approvals/approverIdentity');
const { STATUSES, APPROVAL_STEP_DECISIONS } = require('@rbm/lib/enums');

/**
 * Locate the pending approval step actionable by `userId` on the entity's
 * open approval instance. A step is actionable when assigned to the user
 * directly, unassigned (historical NULL approver), or — with
 * `allowUnassigned` — any pending step (caller already proved admin scope).
 *
 * @param {string} entityType - approval_instances.entity_type
 * @param {number} entityId
 * @param {number} userId
 * @param {{allowUnassigned?: boolean}} [opts]
 * @returns {Promise<{step_id:number, step_label:string, step_order:number}|null>}
 * @example await findPendingStepForUser('ACTIVITY_REPORT', 7, 20)
 */
async function findPendingStepForUser(entityType, entityId, userId, { allowUnassigned = false } = {}) {
  const query = db('approval_steps as s')
    .join('approval_instances as ai', 'ai.id', 's.approval_instance_id')
    .where('ai.entity_type', entityType)
    .where('ai.entity_id', entityId)
    .where('ai.status', STATUSES.IN_REVIEW)
    .where('s.decision', APPROVAL_STEP_DECISIONS.PENDING);
  if (!allowUnassigned) {
    // Approver, delegate or escalation target (D-20261105-09), or unassigned.
    whereActionable(query, { alias: 's', userId, actingIds: await actingFor(userId), includeUnassigned: true });
  }
  return query.orderBy('s.step_order').first('s.id as step_id', 's.step_label', 's.step_order');
}

/**
 * Whether the entity has an open (IN_REVIEW) approval instance.
 *
 * @param {string} entityType
 * @param {number} entityId
 * @returns {Promise<boolean>}
 * @example await hasOpenInstance('PLAN_NODE', 42)
 */
async function hasOpenInstance(entityType, entityId) {
  const row = await db('approval_instances')
    .where({ entity_type: entityType, entity_id: entityId, status: STATUSES.IN_REVIEW })
    .first('id');
  return !!row;
}

/**
 * Decide the entity's current step through the workflow engine.
 *
 * @param {object} p
 * @param {string} p.entityType
 * @param {number} p.entityId
 * @param {string} p.decision - STATUSES.APPROVED or STATUSES.REJECTED
 * @param {number} p.userId
 * @param {string|null} [p.comment]
 * @param {boolean} [p.allowUnassigned] - true when the route gate already proved admin/scope-all
 * @param {import('express').Request} [p.req] - forwarded to the engine for audit
 * @returns {Promise<{handled: boolean, result?: object}>}
 * @throws {Error} 403 NO_PENDING_STEP when an instance exists but the caller has no step
 * @example const { handled } = await decideEntityStep({ entityType: APPROVAL_ENTITIES.ACTIVITY_REPORT, entityId: 7, decision: STATUSES.APPROVED, userId: 20, allowUnassigned: true });
 */
async function decideEntityStep({ entityType, entityId, decision, userId, comment = null, allowUnassigned = false, req }) {
  if (!await hasOpenInstance(entityType, entityId)) return { handled: false };
  const step = await findPendingStepForUser(entityType, entityId, userId, { allowUnassigned });
  if (!step) {
    if (allowUnassigned) return { handled: false }; // scope-all caller, nothing actionable → fallback
    const err = new Error('You have no pending approval step on this report');
    err.status = 403;
    err.code = 'NO_PENDING_STEP';
    throw err;
  }
  const result = await workflowEngine.decideWorkflowStep(step.step_id, decision, comment, userId, req);
  return { handled: true, result };
}

/**
 * Close (cancel) any open approval instance for the entity WITHOUT touching
 * the entity row — used when the entity is cancelled/deleted outside the
 * engine so no orphan instance lingers in reviewer inboxes.
 *
 * @param {string} entityType
 * @param {number} entityId
 * @returns {Promise<number>} number of instances closed
 * @example await closeOpenInstance('PLAN_NODE', 42)
 */
async function closeOpenInstance(entityType, entityId) {
  const ids = await db('approval_instances')
    .where({ entity_type: entityType, entity_id: entityId, status: STATUSES.IN_REVIEW })
    .pluck('id');
  if (!ids.length) return 0;
  await db('approval_steps')
    .whereIn('approval_instance_id', ids)
    .whereIn('decision', [APPROVAL_STEP_DECISIONS.PENDING, APPROVAL_STEP_DECISIONS.BLOCKED_NO_APPROVER])
    .update({ decision: APPROVAL_STEP_DECISIONS.CANCELLED, completed_date: db.fn.now() });
  await db('approval_instances').whereIn('id', ids).update({ status: STATUSES.CANCELLED });
  return ids.length;
}

module.exports = { findPendingStepForUser, decideEntityStep, hasOpenInstance, closeOpenInstance };
