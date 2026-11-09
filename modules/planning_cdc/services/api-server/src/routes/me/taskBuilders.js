/**
 * Task builders for GET /api/me/tasks.
 *
 * Each helper returns either a single task object, `null` when no work
 * applies, or an array of tasks (for fan-out cases: rejected SAs,
 * unread notifications). See `meRoutes.js` for the orchestrator.
 */

const knex = require('../../config/db');
const { STATUSES, NODE_TYPES } = require('@rbm/lib/enums');
const { collectPendingReviews } = require('../../services/reporting/reviewQueueReminders');

// `entity_type` values on the `notifications` table are lowercase
// singular forms — separate vocabulary from ENTITY_TYPES / ENTITY_TABLES.
// Aliased to named constants so linters don't flag them as magic strings.
const NOTIF_ENTITY_ACTIVITY_REPORT = 'activity_report';

async function fetchPendingSpecificActivities({ seeAll, respDivs }) {
  let q = knex('plan_nodes')
    .where('node_type', NODE_TYPES.SPECIFIC_ACTIVITY)
    .where('status', STATUSES.IN_REVIEW);
  if (!seeAll) q = q.whereIn('responsible_division_code', respDivs);
  return q
    .select('id', 'code', 'title', 'responsible_division_code', 'submitted_at')
    .orderBy('submitted_at', 'desc');
}

function buildSaReviewTask(rows) {
  if (!rows.length) return null;
  const oldest = rows[rows.length - 1];
  return {
    id: 'sa_review_queue',
    type: 'specific_activity_review',
    severity: 'action',
    title: `${rows.length} specific ${rows.length === 1 ? 'activity is' : 'activities are'} awaiting your approval`,
    description: rows.slice(0, 3).map((r) => `${r.code || '—'} ${r.title}`).join(' · '),
    count: rows.length,
    created_at: oldest.submitted_at || null,
    href: '/review-submissions',
  };
}

async function buildSaRejectedTasks(userId) {
  const rows = await knex('plan_nodes')
    .where('node_type', NODE_TYPES.SPECIFIC_ACTIVITY)
    .where('status', STATUSES.REJECTED)
    .where('created_by_user_id', userId)
    .select('id', 'code', 'title', 'rejection_reason', 'reviewed_at')
    .orderBy('reviewed_at', 'desc')
    .limit(20);
  return rows.map((r) => ({
    id: `sa_rejected_${r.id}`,
    type: 'specific_activity_rejected',
    severity: 'warning',
    title: `Rejected: ${r.code || ''} ${r.title}`.trim(),
    description: r.rejection_reason
      ? `Reason: ${r.rejection_reason}`
      : 'Open the activity to see why and resubmit.',
    count: 1,
    created_at: r.reviewed_at,
    href: '/my-specifics',
  }));
}

/**
 * Indicator and activity reports waiting for the user's decision: the
 * current approval step is theirs, delegated to them or escalated to them.
 *
 * @param {number} userId
 * @returns {Promise<object|null>} the task, null when nothing waits
 * @example await buildReportReviewTask(12)
 */
async function buildReportReviewTask(userId) {
  const rows = await collectPendingReviews({ userId });
  const byStep = [...new Map(rows.map((r) => [r.step_id, r])).values()]
    .sort((a, b) => new Date(b.since) - new Date(a.since));
  if (!byStep.length) return null;
  const [latest] = byStep;
  return {
    id: 'report_review_queue',
    type: 'report_review',
    severity: 'action',
    title: `${byStep.length} report${byStep.length === 1 ? '' : 's'} awaiting your decision`,
    description: `Latest: ${[latest.type, latest.code, latest.quarter, latest.fiscal_year].filter(Boolean).join(' ')}`,
    count: byStep.length,
    created_at: byStep[byStep.length - 1].since || null,
    href: '/review-submissions',
  };
}

async function buildOwnershipDisputesTask() {
  const rows = await knex('activity_reports')
    .leftJoin('plan_nodes', 'activity_reports.plan_node_id', 'plan_nodes.id')
    .leftJoin('users', 'activity_reports.user_id', 'users.id')
    .where('activity_reports.status', STATUSES.NOT_APPLICABLE)
    .select(
      'activity_reports.id',
      'activity_reports.plan_node_id',
      'plan_nodes.code',
      'plan_nodes.title',
      'users.full_name as flagged_by',
      'activity_reports.created_at',
    )
    .orderBy('activity_reports.created_at', 'desc');
  if (!rows.length) return null;
  // D-20260818-01: an activity can now carry several NA reports (the
  // (plan_node_id, quarter, fiscal_year) unique key is gone). The task is
  // about disputed ACTIVITIES, so count distinct plan nodes, not rows.
  const disputedActivities = new Set(rows.map((r) => r.plan_node_id)).size;
  return {
    id: 'ownership_disputes',
    type: 'ownership_dispute',
    severity: 'action',
    title: `${disputedActivities} ownership dispute${disputedActivities === 1 ? '' : 's'} to resolve`,
    description: rows.slice(0, 2).map((r) => `${r.code || '—'} flagged by ${r.flagged_by || '?'}`).join(' · '),
    count: disputedActivities,
    created_at: rows[0].created_at,
    href: '/review-submissions',
  };
}

async function buildNotificationTasks(userId) {
  const rows = await knex('notifications')
    .where({ user_id: userId, is_read: false })
    .select('id', 'message', 'entity_type', 'entity_id', 'created_at')
    .orderBy('created_at', 'desc')
    .limit(10);
  return rows.map((n) => ({
    id: `notif_${n.id}`,
    type: 'notification',
    severity: n.entity_type === NOTIF_ENTITY_ACTIVITY_REPORT ? 'action' : 'info',
    title: (n.message || '').slice(0, 120),
    description: null,
    count: 1,
    created_at: n.created_at,
    href: '/review-submissions',
  }));
}

const SEVERITY_RANK = { action: 0, warning: 1, info: 2 };

function sortTasks(tasks) {
  tasks.sort((a, b) => {
    const s = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
    if (s !== 0) return s;
    const da = a.created_at ? new Date(a.created_at).getTime() : 0;
    const db = b.created_at ? new Date(b.created_at).getTime() : 0;
    return db - da;
  });
}

module.exports = {
  fetchPendingSpecificActivities,
  buildSaReviewTask,
  buildSaRejectedTasks,
  buildReportReviewTask,
  buildOwnershipDisputesTask,
  buildNotificationTasks,
  sortTasks,
};
