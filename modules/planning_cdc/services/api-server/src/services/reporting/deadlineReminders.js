// ── Quarter-Deadline Reminders (approver-facing) ──
//
// Reminds APPROVERS (M&E / HoD / contributor chain step owners) that reports
// are still awaiting their decision while a reporting window is about to close.
//
// Source of truth for "who must act": the current PENDING step of every
// IN_REVIEW `indicator_division_reports` instance (approval_instances +
// approval_steps), grouped by approver; an M&E pool step goes to every M&E
// officer (D-20261015-07). Blocked steps are intentionally excluded — those need
// an admin re-assignment on the Review Submissions page, not a nudge to a
// specific person.
//
// Both the daily cron (`quarterDeadlineReminderCron`) and the admin endpoint
// (`POST /api/reporting/admin/remind-deadline`) go through this module so the
// collection + enqueue logic lives in exactly one place.

'use strict';

const db = require('../../config/db');
const { STATUSES, APPROVAL_ENTITIES, APPROVAL_STEP_DECISIONS } = require('@rbm/lib/enums');
const { joinApproverOrPool } = require('../approverPool');

const TEMPLATE_KEY = 'report-deadline-reminder';
const PORTAL_URL = process.env.PORTAL_URL || 'https://pra.africacdc.org/report';

/**
 * Whole-day difference (UTC) between `endDate` and `now`, normalised to
 * midnight so DST / time-of-day never shifts the count. Positive = future.
 *
 * @param {string|Date} endDate — the period `end_date`
 * @param {Date} [now] — defaults to current time (injectable for tests)
 * @returns {number} days until end_date (0 = today, negative = past)
 * @example daysUntil('2026-03-31', new Date('2026-03-28')) // => 3
 */
function daysUntil(endDate, now = new Date()) {
  const end = new Date(endDate);
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((endUtc - nowUtc) / 86400000);
}

/**
 * Fetch the current pending approval step of every IN_REVIEW indicator report
 * for a given fiscal year + quarter, joined with the assigned approver and
 * indicator/division metadata for the email body.
 *
 * @param {{ fiscalYear: string|number, quarter: string }} p
 * @returns {Promise<Array<object>>} one row per (report × current pending step)
 * @throws {Error} when the DB query fails
 * @example await collectPendingApprovals({ fiscalYear: 2026, quarter: 'Q1' });
 */
async function collectPendingApprovals({ fiscalYear, quarter }) {
  // indicator_division_reports.fiscal_year is a VARCHAR — coerce to string so
  // the filter matches regardless of whether the caller passed an int.
  const fy = String(fiscalYear);
  const q = String(quarter).toUpperCase();

  const base = db('indicator_division_reports as r')
    .join('approval_instances as ai', function () {
      this.on('ai.entity_id', '=', 'r.id')
        .andOn('ai.entity_type', '=', db.raw('?', [APPROVAL_ENTITIES.INDICATOR_DIVISION_REPORT]));
    })
    .join('approval_steps as s', 's.approval_instance_id', 'ai.id');
  // The approver, or every M&E officer for a pool step (D-20261015-07).
  // Blocked steps (decision BLOCKED_NO_APPROVER) stay out by the filter below.
  return joinApproverOrPool(base)
    .leftJoin('plan_nodes as p', 'p.id', 'r.plan_node_id')
    .leftJoin('division_codes as dc', 'dc.code', 'r.division_code')
    .where('ai.status', STATUSES.IN_REVIEW)
    .where('s.decision', APPROVAL_STEP_DECISIONS.PENDING)
    // Keep only the EARLIEST pending step per instance (collapses a 3-step
    // contributor chain into a single actionable row for its current owner).
    .whereNotExists(function () {
      this.from('approval_steps as s2')
        .whereRaw('s2.approval_instance_id = s.approval_instance_id')
        .where('s2.decision', APPROVAL_STEP_DECISIONS.PENDING)
        .whereRaw('s2.step_order < s.step_order');
    })
    .where('r.fiscal_year', fy)
    .where('r.quarter', q)
    .where(function () { this.where('u.status', 'ACTIVE').orWhereNull('u.status'); })
    .whereNotNull('u.email')
    .select(
      'u.id as user_id', 'u.email', 'u.first_name', 'u.last_name',
      'r.id as report_id', 'r.division_code', 'r.quarter', 'r.fiscal_year',
      's.step_label',
      'p.code as indicator_code', 'p.title as indicator_title',
      'dc.division_name',
    );
}

/**
 * Group pending-approval rows by approver into `{ user, items[] }` buckets.
 *
 * @param {Array<object>} rows — output of {@link collectPendingApprovals}
 * @returns {Map<number, { user: object, items: object[] }>}
 */
function groupByApprover(rows) {
  const byUser = new Map();
  for (const r of rows) {
    if (!r.email) continue;
    if (!byUser.has(r.user_id)) {
      byUser.set(r.user_id, {
        user: { id: r.user_id, email: r.email, first_name: r.first_name, last_name: r.last_name },
        items: [],
      });
    }
    byUser.get(r.user_id).items.push({
      indicator_code: r.indicator_code,
      indicator_title: r.indicator_title,
      division_name: r.division_name || r.division_code,
      step_label: r.step_label,
      quarter: r.quarter,
      fiscal_year: r.fiscal_year,
    });
  }
  return byUser;
}

/**
 * Enqueue one `report-deadline-reminder` outbox row per approver. The
 * notification-service worker resolves the template via `payload.template_key`.
 *
 * @param {object} p
 * @param {Map} p.byUser — output of {@link groupByApprover}
 * @param {object} p.period — reporting_periods row ({ quarter, fiscal_year, end_date, label })
 * @param {number} p.daysLeft — whole days until the window closes
 * @param {string} p.correlationId — batch id for tracing
 * @returns {Promise<number>} number of emails enqueued
 */
async function enqueueForApprovers({ byUser, period, daysLeft, correlationId }) {
  const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
  let enqueued = 0;
  for (const { user, items } of byUser.values()) {
    const payload = {
      template_key: TEMPLATE_KEY,
      user,
      count: items.length,
      items,
      quarter: period.quarter,
      fiscalYear: period.fiscal_year,
      endDate: period.end_date,
      daysLeft,
      portalUrl: PORTAL_URL,
    };
    const dayLabel = daysLeft <= 0 ? 'today' : `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
    await db('notification_outbox').insert({
      event_key: TEMPLATE_KEY,
      recipient: user.email,
      recipient_user_id: user.id,
      channel: 'email',
      subject: `[RBM] ${items.length} report${items.length > 1 ? 's' : ''} awaiting your approval — ${period.quarter} closes ${dayLabel}`,
      payload: JSON.stringify(payload),
      status: 'queued',
      correlation_id: correlationId,
      created_at: nowIso,
      updated_at: nowIso,
    });
    enqueued += 1;
  }
  return enqueued;
}

/**
 * End-to-end reminder for a single reporting period: collect → group → (maybe)
 * enqueue. On `dryRun` nothing is written; a preview summary is returned.
 *
 * @param {object} p
 * @param {object} p.period — reporting_periods row
 * @param {boolean} [p.dryRun=false]
 * @param {string} p.correlationId
 * @param {Date} [p.now] — injectable clock for daysLeft
 * @returns {Promise<{ users_targeted: number, total_reports: number, enqueued: number, days_left: number, sample: object[] }>}
 */
async function remindForPeriod({ period, dryRun = false, correlationId, now = new Date() }) {
  const rows = await collectPendingApprovals({ fiscalYear: period.fiscal_year, quarter: period.quarter });
  const byUser = groupByApprover(rows);
  const daysLeft = daysUntil(period.end_date, now);

  const summary = {
    users_targeted: byUser.size,
    total_reports: rows.length,
    days_left: daysLeft,
    enqueued: 0,
    sample: Array.from(byUser.values()).slice(0, 5).map((b) => ({
      email: b.user.email, pending_count: b.items.length,
    })),
  };

  if (dryRun || byUser.size === 0) return summary;

  summary.enqueued = await enqueueForApprovers({ byUser, period, daysLeft, correlationId });
  return summary;
}

module.exports = {
  TEMPLATE_KEY,
  daysUntil,
  collectPendingApprovals,
  groupByApprover,
  enqueueForApprovers,
  remindForPeriod,
};
