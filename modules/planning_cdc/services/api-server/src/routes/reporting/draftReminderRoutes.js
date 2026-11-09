/**
 * Admin-triggered reminders for users with DRAFT quarterly reports.
 *
 * POST /api/reporting/admin/remind-drafts
 *   body: { dryRun?: boolean, fiscalYear?: string, quarter?: string }
 *
 * Scans `indicator_division_reports` with status=DRAFT whose reporting window
 * (quarter + fiscal year) is OPEN, groups by reporter
 * user, and enqueues a single `report-draft-reminder` email per user into
 * `notification_outbox`. The notification-service worker picks them up.
 *
 * Scope: `quarterly_report:approve:all` (admin / M&E officer). Intended to
 * be hit by a system cron daily or weekly. Also safe to call manually.
 *
 * @name draftReminderRoutes
 */
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { whereOpenPeriod } = require('../../services/reportingWindowService');
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticateToken } = require('../../middleware/authMiddleware');
const { authorize } = require('../../middleware/rbacMiddleware');
const { buildSuccess } = require('@rbm/lib/errors');
const { STATUSES } = require('@rbm/lib/enums');
const { createLogger } = require('@rbm/lib/logger');

const log = createLogger('api-server').child({ module: 'draftReminders' });

router.use(authenticateToken);
const canAdminReports = authorize({ module: 'quarterly_report', action: 'approve' });

const PORTAL_URL = process.env.PORTAL_URL || 'https://pra.africacdc.org/report';

/**
 * Fetch DRAFT reports and the user most likely responsible for them:
 *   1. `submitted_by` if set (happens after a rejection — user owns the redo)
 *   2. otherwise `created_by`
 * Joined with user + indicator + division for the email body.
 */
async function collectDrafts({ fiscalYear, quarter }) {
  // Only drafts whose reporting window (quarter + year) is OPEN: a closed window cannot be acted on.
  const q = whereOpenPeriod(db('indicator_division_reports as r'), 'r')
    .leftJoin('users as u', 'u.id', db.raw('COALESCE(r.submitted_by, r.created_by)'))
    .leftJoin('plan_nodes as p', 'p.id', 'r.plan_node_id')
    .leftJoin('division_codes as dc', 'dc.code', 'r.division_code')
    .where('r.status', STATUSES.DRAFT)
    .whereNotNull('u.id')
    .where(function () { this.where('u.status', 'ACTIVE').orWhereNull('u.status'); })
    .select(
      'u.id as user_id', 'u.email', 'u.first_name', 'u.last_name',
      'r.id as report_id', 'r.fiscal_year', 'r.quarter', 'r.division_code',
      'p.code as indicator_code', 'p.title as indicator_title',
      'dc.division_name',
    );
  if (fiscalYear) q.where('r.fiscal_year', String(fiscalYear));
  if (quarter) q.where('r.quarter', String(quarter).toUpperCase());
  return q;
}

router.post('/admin/remind-drafts', canAdminReports, asyncHandler(async (req, res) => {
  const { dryRun = false, fiscalYear, quarter } = req.body || {};
  const rows = await collectDrafts({ fiscalYear, quarter });

  // Group by user_id → { user, drafts[] }
  const byUser = new Map();
  for (const r of rows) {
    if (!r.email) continue;
    if (!byUser.has(r.user_id)) {
      byUser.set(r.user_id, {
        user: { id: r.user_id, email: r.email, first_name: r.first_name, last_name: r.last_name },
        drafts: [],
      });
    }
    byUser.get(r.user_id).drafts.push({
      indicator_code: r.indicator_code,
      indicator_title: r.indicator_title,
      fiscal_year: r.fiscal_year,
      quarter: r.quarter,
      division_name: r.division_name || r.division_code,
    });
  }

  if (dryRun) {
    return res.json(buildSuccess({
      users_targeted: byUser.size,
      total_drafts: rows.length,
      sample: Array.from(byUser.values()).slice(0, 5).map((b) => ({
        email: b.user.email, draft_count: b.drafts.length,
      })),
    }));
  }

  // Enqueue one outbox row per user. The notification-service worker
  // resolves the template by `event_key` and dispatches.
  const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const correlationId = `draft-reminder-${Date.now()}`;
  let enqueued = 0;
  for (const { user, drafts } of byUser.values()) {
    const payload = { user, count: drafts.length, drafts, portalUrl: PORTAL_URL };
    await db('notification_outbox').insert({
      event_key: 'report-draft-reminder',
      recipient: user.email,
      recipient_user_id: user.id,
      channel: 'email',
      subject: `[RBM] You have ${drafts.length} draft report${drafts.length > 1 ? 's' : ''} pending`,
      payload: JSON.stringify(payload),
      status: 'queued',
      correlation_id: correlationId,
      created_at: nowIso,
      updated_at: nowIso,
    });
    enqueued += 1;
  }

  log.info({ enqueued, totalDrafts: rows.length, correlationId }, 'draft reminders enqueued');
  res.json(buildSuccess({ enqueued, total_drafts: rows.length, correlation_id: correlationId }));
}));

module.exports = router;
