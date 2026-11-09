// ── Pending-review reminders for M&E officers and approvers (D-20261015-01) ──
//
// Every report waiting for a decision (indicator reports and activity
// reports, IN_REVIEW) has one current PENDING approval step with its
// approver. Each approver receives one email listing what waits for them,
// through the notification wizard: event `review_queue.pending`, entity
// `{ owner_user_id: <approver> }`, subscription `entity_owner`.

'use strict';

const db = require('../../config/db');
const { STATUSES, APPROVAL_ENTITIES, APPROVAL_STEP_DECISIONS } = require('@rbm/lib/enums');
const { emitEvent } = require('../eventBusService');
const { joinApproverOrPool } = require('../approverPool');
const { realignMeSteps } = require('../approverRealign');
const { decideUrl } = require('../approvals/stepSummary');
const { actingFor } = require('../approvals/approverIdentity');

const APP_URL = (process.env.APP_BASE_URL || 'https://pra.africacdc.org').replace(/\/$/, '');
const EVENT_KEY = 'review_queue.pending';

/** Current (earliest) PENDING step of every IN_REVIEW instance of `entityType`, with its approver (each M&E officer for a pool step). */
function pendingSteps(entityType) {
  const base = db('approval_instances as ai')
    .join('approval_steps as s', 's.approval_instance_id', 'ai.id');
  // The approver, or every M&E officer for a pool step (D-20261015-07).
  return joinApproverOrPool(base)
    .where('ai.entity_type', entityType)
    .where('ai.status', STATUSES.IN_REVIEW)
    .where('s.decision', APPROVAL_STEP_DECISIONS.PENDING)
    .whereNotExists(function earlierPending() {
      this.from('approval_steps as s2')
        .whereRaw('s2.approval_instance_id = s.approval_instance_id')
        .where('s2.decision', APPROVAL_STEP_DECISIONS.PENDING)
        .whereRaw('s2.step_order < s.step_order');
    })
    .where(function activeUser() { this.where('u.status', 'ACTIVE').orWhereNull('u.status'); })
    .whereNotNull('u.email');
}

/**
 * Every report waiting for a decision, one row per (report, current approver).
 * With `userId`, only the steps that user acts on: theirs, those of the
 * users who delegated to them today, and those escalated to them.
 *
 * @param {{ userId?: number }} [opts]
 * @returns {Promise<Array<{ approver_id: number, step_id: number, type: string, code: string, title: string,
 *   division: string, quarter: string, since: string }>>}
 * @throws {Error} on DB failure
 * @example await collectPendingReviews({ userId: 12 });
 */
async function collectPendingReviews({ userId } = {}) {
  const actingIds = userId ? await actingFor(userId) : null;
  const steps = (entityType) => (actingIds
    ? pendingSteps(entityType).where(function mine() { this.whereIn('u.id', actingIds).orWhere('s.escalated_to_id', userId); })
    : pendingSteps(entityType));
  const indicators = await steps(APPROVAL_ENTITIES.INDICATOR_DIVISION_REPORT)
    .join('indicator_division_reports as r', 'r.id', 'ai.entity_id')
    .leftJoin('plan_nodes as p', 'p.id', 'r.plan_node_id')
    .select('u.id as approver_id', 's.id as step_id', 'p.code', 'p.title', 'r.division_code as division', 'r.quarter', 'r.fiscal_year', 'ai.created_at as since');
  const activities = await steps(APPROVAL_ENTITIES.ACTIVITY_REPORT)
    .join('activity_reports as r', 'r.id', 'ai.entity_id')
    .leftJoin('plan_nodes as p', 'p.id', 'r.plan_node_id')
    .select('u.id as approver_id', 's.id as step_id', 'p.code', 'p.title', 'p.responsible_division_code as division', 'r.quarter', 'r.fiscal_year', 'ai.created_at as since');
  return [
    ...indicators.map((r) => ({ ...r, type: 'Indicator report' })),
    ...activities.map((r) => ({ ...r, type: 'Activity report' })),
  ];
}

/**
 * Email every approver the reports waiting for them (through the wizard).
 *
 * @param {{ correlationId?: string }} [opts]
 * @returns {Promise<{ approvers: number, items: number }>}
 * @throws {Error} on DB failure
 * @example await remindPendingReviews({ correlationId: 'review-reminder-2026-10-15' });
 */
async function remindPendingReviews({ correlationId } = {}) {
  await realignMeSteps(); // remind the unit's current M&E officer, not a former one
  const rows = await collectPendingReviews();
  const byApprover = new Map();
  for (const row of rows) {
    if (!byApprover.has(row.approver_id)) byApprover.set(row.approver_id, []);
    byApprover.get(row.approver_id).push(row);
  }
  for (const [approverId, items] of byApprover) {
    await emitEvent({
      eventKey: EVENT_KEY,
      entity: { owner_user_id: approverId },
      actor: null,
      metadata: {
        template_key: 'review-pending-reminder',
        count: items.length,
        reviewUrl: `${APP_URL}/review-submissions`,
        items: items.map((i) => ({
          type: i.type,
          code: i.code || '',
          title: i.title || '',
          division: i.division || '',
          period: [i.quarter, i.fiscal_year].filter(Boolean).join(' '),
          since: i.since ? new Date(i.since).toISOString().slice(0, 10) : '',
          decideUrl: i.step_id ? decideUrl(i.step_id) : '',
        })),
      },
      correlationId,
      knex: db,
    });
  }
  return { approvers: byApprover.size, items: rows.length };
}

module.exports = { collectPendingReviews, remindPendingReviews, EVENT_KEY };
