// ── Who may act on an approval step (automation roadmap, lot 1, D-20261105-09) ──
//
// One place answers « is this step mine? »: the step's approver, the
// delegate of that approver while an out-of-office delegation is active,
// and the Responsible Person the step was escalated to. Every check that
// used to compare `approver_id` with the caller goes through here.

'use strict';

const db = require('../../config/db');
const rbacService = require('../rbacService');
const { STATUSES, APPROVAL_STEP_DECISIONS, APPROVAL_ENTITIES } = require('@rbm/lib/enums');
const { RBAC_MODULES, RBAC_ACTIONS, RBAC_SCOPES } = require('@rbm/lib/rbac');
const { getUserDivisionCodes, DIVISION_ROLE_RESPONSIBLE } = require('@rbm/lib/user-divisions');

// Module whose approve right at scope « all » lets a user decide any step of the entity.
const APPROVE_MODULE = Object.freeze({
  [APPROVAL_ENTITIES.PLAN_NODE]: RBAC_MODULES.TASKS,
  [APPROVAL_ENTITIES.ACTIVITY_REPORT]: RBAC_MODULES.ACTIVITY_REPORT,
  [APPROVAL_ENTITIES.INDICATOR_DIVISION_REPORT]: RBAC_MODULES.QUARTERLY_REPORT,
});

const isoDay = (d) => d.toISOString().slice(0, 10);

/** Active (not revoked, today within the dates) delegations matching `where`. */
function activeDelegations(today) {
  const day = isoDay(today);
  return db('approval_delegations')
    .whereNull('revoked_at')
    .where('starts_on', '<=', day)
    .where('ends_on', '>=', day);
}

/**
 * The user plus every user who delegated to them today (no chains).
 *
 * @param {number} userId
 * @param {Date} [today]
 * @returns {Promise<number[]>} the user first
 * @throws {Error} on DB failure
 * @example await actingFor(12) // [12, 5] while user 5 is away and delegated to 12
 */
async function actingFor(userId, today = new Date()) {
  if (!userId) return [];
  const delegators = await activeDelegations(today).where('delegate_id', userId).pluck('delegator_id');
  return [Number(userId), ...new Set((delegators || []).map(Number).filter((id) => id !== Number(userId)))];
}

/**
 * Delegates of the given users today: { delegatorId → delegateId }.
 *
 * @param {number[]} userIds
 * @param {Date} [today]
 * @returns {Promise<Map<number, number>>}
 * @example await delegatesOf([5]) // Map { 5 => 12 }
 */
async function delegatesOf(userIds, today = new Date()) {
  const ids = (userIds || []).map(Number).filter(Boolean);
  if (!ids.length) return new Map();
  const rows = await activeDelegations(today).whereIn('delegator_id', ids).select('delegator_id', 'delegate_id');
  return new Map(rows.map((r) => [Number(r.delegator_id), Number(r.delegate_id)]));
}

/**
 * Restrict an approval_steps query to the steps `userId` may act on:
 * approver among `actingIds`, or escalated to the user. With
 * `includeUnassigned`, steps without an approver are kept (historical rule).
 *
 * @param {import('knex').Knex.QueryBuilder} query
 * @param {{ alias?: string, userId: number, actingIds: number[], includeUnassigned?: boolean }} o
 * @returns {import('knex').Knex.QueryBuilder}
 * @example whereActionable(q, { alias: 's', userId: 12, actingIds: [12, 5] })
 */
function whereActionable(query, { alias = 's', userId, actingIds, includeUnassigned = false }) {
  return query.where(function actionable() {
    this.whereIn(`${alias}.approver_id`, actingIds.length ? actingIds : [userId])
      .orWhere(`${alias}.escalated_to_id`, userId);
    if (includeUnassigned) this.orWhereNull(`${alias}.approver_id`);
  });
}

/**
 * Whether `userId` may act on this step as its approver, the approver's
 * delegate or the escalation target.
 *
 * @param {number} userId
 * @param {{ approver_id?: number|null, escalated_to_id?: number|null }} step
 * @returns {Promise<boolean>}
 * @example await isActingApproverOf(12, { approver_id: 5 })
 */
async function isActingApproverOf(userId, step) {
  if (!step || !userId) return false;
  if (step.escalated_to_id && Number(step.escalated_to_id) === Number(userId)) return true;
  if (!step.approver_id) return false;
  return (await actingFor(userId)).includes(Number(step.approver_id));
}

/**
 * Whether `userId` holds the approve right of the entity's module at scope
 * « all » (M&E, admins): such a user may decide any step of that entity.
 *
 * @param {number} userId
 * @param {string} entityType - approval_instances.entity_type
 * @returns {Promise<boolean>} false for an entity type without a module
 * @example await approvesEverything(3, APPROVAL_ENTITIES.ACTIVITY_REPORT)
 */
async function approvesEverything(userId, entityType) {
  const module = APPROVE_MODULE[entityType];
  if (!module) return false;
  const { allowed, scope } = await rbacService.checkPermission(userId, module, RBAC_ACTIONS.APPROVE)
    .catch(() => ({ allowed: false, scope: null }));
  return allowed && scope === RBAC_SCOPES.ALL;
}

/**
 * Whether `userId` may decide this approval step: its acting approver
 * (approver, delegate, escalation target), or a user who approves every
 * step of the step's entity type (D-20261108-02).
 *
 * @param {number} userId
 * @param {number} stepId - approval_steps.id
 * @returns {Promise<boolean>} false when the step does not exist
 * @throws {Error} on DB failure
 * @example if (!(await canDecideStep(req.user.id, 311))) throw new ForbiddenError('…');
 */
async function canDecideStep(userId, stepId) {
  const step = await db('approval_steps as s')
    .join('approval_instances as ai', 'ai.id', 's.approval_instance_id')
    .where('s.id', stepId)
    .first('s.approver_id', 's.escalated_to_id', 'ai.entity_type');
  if (!step) return false;
  return (await isActingApproverOf(userId, step)) || approvesEverything(userId, step.entity_type);
}

/**
 * Whether `userId` may act on the current pending step of the entity's open
 * instance (route gates of the approve / reject endpoints).
 *
 * @param {number} userId
 * @param {string} entityType - approval_instances.entity_type
 * @param {number} entityId
 * @returns {Promise<boolean>}
 * @example await canActOnPendingStep(12, APPROVAL_ENTITIES.ACTIVITY_REPORT, 7)
 */
async function canActOnPendingStep(userId, entityType, entityId) {
  const step = await db('approval_steps as s')
    .join('approval_instances as ai', 'ai.id', 's.approval_instance_id')
    .where({ 'ai.entity_type': entityType, 'ai.entity_id': entityId, 'ai.status': STATUSES.IN_REVIEW })
    .where('s.decision', APPROVAL_STEP_DECISIONS.PENDING)
    .orderBy('s.step_order')
    .first('s.approver_id', 's.escalated_to_id');
  return isActingApproverOf(userId, step);
}

/**
 * Units the user is the Responsible Person of, plus those of the users who
 * delegated to them today. Single copy for the review queues and `isHodFor`.
 *
 * @param {number} userId
 * @returns {Promise<string[]>}
 * @throws {Error} on DB failure
 * @example await getResponsibleDivisions(12) // ['EPR', 'SDI'] (SDI through a delegation)
 */
async function getResponsibleDivisions(userId) {
  if (!userId) return [];
  const ids = await actingFor(userId);
  const lists = await Promise.all(ids.map((id) => getUserDivisionCodes(db, id, { roles: [DIVISION_ROLE_RESPONSIBLE] })));
  return [...new Set(lists.flat())];
}

module.exports = {
  actingFor, delegatesOf, whereActionable, isActingApproverOf, canActOnPendingStep, getResponsibleDivisions,
  approvesEverything, canDecideStep, APPROVE_MODULE,
};
