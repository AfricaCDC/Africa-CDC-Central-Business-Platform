/**
 * Admin-triggered deadline reminders for APPROVERS with reports still awaiting
 * their decision.
 *
 * POST /api/reporting/admin/remind-deadline
 *   body: { dryRun?: boolean, fiscalYear?: string, quarter?: string }
 *
 * Resolves the target reporting period:
 *   - `fiscalYear` + `quarter` given  → that specific period.
 *   - otherwise                        → the currently OPEN period.
 * Then collects the current pending approval step of every IN_REVIEW indicator
 * report for that period, groups by the assigned approver, and enqueues one
 * `report-deadline-reminder` email per approver into `notification_outbox`.
 *
 * Scope: `quarterly_report:approve:all` (admin / M&E officer). Safe to call
 * manually; the cron (`quarterDeadlineReminderCron`) uses the same service.
 *
 * @name deadlineReminderRoutes
 */
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticateToken } = require('../../middleware/authMiddleware');
const { authorize } = require('../../middleware/rbacMiddleware');
const { buildSuccess, buildError } = require('@rbm/lib/errors');
const { STATUSES } = require('@rbm/lib/enums');
const { createLogger } = require('@rbm/lib/logger');
const { remindForPeriod } = require('../../services/reporting/deadlineReminders');

const log = createLogger('api-server').child({ module: 'deadlineReminders' });

router.use(authenticateToken);
const canAdminReports = authorize({ module: 'quarterly_report', action: 'approve' });

/**
 * Resolve which reporting period to remind on. Prefers an explicit
 * fiscalYear+quarter, else the currently OPEN period.
 * @returns {Promise<object|null>} reporting_periods row or null
 */
async function resolvePeriod({ fiscalYear, quarter }) {
  if (fiscalYear && quarter) {
    const row = await db('reporting_periods')
      .where('fiscal_year', fiscalYear)
      .where('quarter', String(quarter).toUpperCase())
      .first();
    return row || null;
  }
  const open = await db('reporting_periods').where('status', STATUSES.OPEN).first();
  return open || null;
}

router.post('/admin/remind-deadline', canAdminReports, asyncHandler(async (req, res) => {
  const { dryRun = false, fiscalYear, quarter } = req.body || {};

  const period = await resolvePeriod({ fiscalYear, quarter });
  if (!period) {
    return res.status(404).json(buildError(
      'NOT_FOUND',
      'No matching reporting period found. Open a period or pass a valid fiscalYear + quarter.',
    ));
  }

  const correlationId = `deadline-reminder-${Date.now()}`;
  const summary = await remindForPeriod({ period, dryRun, correlationId });

  if (!dryRun) {
    log.info({
      enqueued: summary.enqueued, totalReports: summary.total_reports,
      period: `${period.quarter} ${period.fiscal_year}`, correlationId,
    }, 'deadline reminders enqueued');
  }

  res.json(buildSuccess({
    period: { quarter: period.quarter, fiscal_year: period.fiscal_year, end_date: period.end_date, status: period.status },
    ...summary,
  }));
}));

module.exports = router;
