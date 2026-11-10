// ── Workflow engine → notification events ──
//
// The approval engine (workflowEngine.js) changes entity status but emitted
// nothing, so a submitted specific activity never reached its approver's
// inbox and the creator never heard the decision. The engine calls this
// module after its transaction commits.
//
// Only entity types listed in WORKFLOW_EVENTS are emitted here. Reports
// (indicator, activity, division) already emit their own lifecycle events
// from their routes; listing them would mail every approver twice.
// Recipients and templates stay in the notification_subscriptions rows of
// each event (/admin/notifications).
//
// Never throws: a notification failure must not undo or fail an approval.

const db = require('../config/db');
const { createLogger } = require('@rbm/lib/logger');
const { APPROVAL_ENTITIES, STATUSES } = require('@rbm/lib/enums');
const { emitEvent } = require('./eventBusService');
const { decideUrlFor } = require('./approvals/stepSummary');

const log = createLogger('api-server').child({ module: 'workflowNotify' });

const APP_URL = (process.env.APP_BASE_URL || 'https://pra.africacdc.org').replace(/\/$/, '');

const WORKFLOW_EVENTS = Object.freeze({
  [APPROVAL_ENTITIES.PLAN_NODE]: {
    table: 'plan_nodes',
    label: 'Specific activity',
    submitted: 'plan_node.submitted',
    [STATUSES.APPROVED]: 'plan_node.approved',
    [STATUSES.REJECTED]: 'plan_node.rejected',
    reviewPath: '/review-submissions',
    ownerPath: (id) => `/my-specifics/${id}/edit`,
  },
});

/**
 * Display name of a user, for the "submitted by / decided by" lines.
 *
 * @param {number|null} userId
 * @returns {Promise<{id: number, email: string, name: string}|null>}
 */
async function loadUser(userId) {
  if (!userId) return null;
  const u = await db('users').where('id', userId).first('id', 'email', 'first_name', 'last_name');
  if (!u) return null;
  return { id: u.id, email: u.email, name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email };
}

/**
 * The approver of the submission is notified (subscription of the
 * `submitted` event, e.g. entity_main_hod).
 *
 * @param {{entityType: string, entityId: number, submittedById: number, steps?: Array<object>}} args
 * @returns {Promise<void>}
 * @example await notifySubmitted({ entityType: 'PLAN_NODE', entityId: 42, submittedById: 7 });
 */
async function notifySubmitted({ entityType, entityId, submittedById, steps = [] }) {
  const cfg = WORKFLOW_EVENTS[entityType];
  if (!cfg) return;
  try {
    const row = await db(cfg.table).where('id', entityId).first();
    if (!row) return;
    const actor = await loadUser(submittedById);
    const first = steps.find((s) => s.approver_id) || {};
    await emitEvent({
      eventKey: cfg.submitted,
      entity: { ...row, entity_type: entityType },
      actor,
      metadata: {
        entity_label: cfg.label,
        actor_name: actor && actor.name,
        step_label: first.step_label || 'Approval needed',
        reviewUrl: `${APP_URL}${cfg.reviewPath}`,
        decideUrl: await decideUrlFor(entityType, entityId), // Approve / Reject buttons (D-20261105-10)
      },
    });
  } catch (err) {
    log.warn('workflow_notify.submitted_failed', { entityType, entityId, err: err && err.message });
  }
}

/**
 * The submitter is told the final decision (subscription of the
 * approved/rejected event, entity_responsible = the submitter).
 *
 * @param {{instance: object, decision: string, decidedById: number, comments?: string}} args
 * @returns {Promise<void>}
 * @example await notifyDecided({ instance, decision: STATUSES.APPROVED, decidedById: 9 });
 */
async function notifyDecided({ instance, decision, decidedById, comments }) {
  const cfg = WORKFLOW_EVENTS[(instance || {}).entity_type] || {};
  const eventKey = cfg[decision];
  if (!eventKey) return;
  try {
    const row = await db(cfg.table).where('id', instance.entity_id).first();
    if (!row) return;
    const decider = await loadUser(decidedById);
    await emitEvent({ eventKey, ...decidedPayload({ cfg, instance, row, decider, decision, comments }) });
  } catch (err) {
    log.warn('workflow_notify.decided_failed', { entityType: instance.entity_type, err: err && err.message });
  }
}

/** entity / actor / metadata of a decision event; the submitter is the recipient. */
function decidedPayload({ cfg, instance, row, decider, decision, comments }) {
  const submitterId = instance.submitted_by_id || row.created_by_user_id;
  return {
    entity: { ...row, entity_type: instance.entity_type, responsible_user_id: submitterId },
    actor: decider,
    metadata: {
      entity_label: cfg.label,
      decision,
      actor_name: decider ? decider.name : null,
      reason: comments || null,
      reportUrl: `${APP_URL}${cfg.ownerPath(instance.entity_id)}`,
    },
  };
}

module.exports = { notifySubmitted, notifyDecided, WORKFLOW_EVENTS };
