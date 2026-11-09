// ── Change who prepared an activity report (D-20261013-03) ──
//
// Administrators and M&E officers only, matrix-driven: the gate is
// activity_report:approve at scope `all` (same as dismissing an ownership
// dispute), never a role list. The previous preparer stays on record.

'use strict';

const router = require('express').Router();
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticateToken } = require('../../middleware/authMiddleware');
const rbacService = require('../../services/rbacService');
const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');
const { ForbiddenError, ValidationError } = require('@rbm/lib/errors');
const { audit } = require('../../middleware/auditLog');
const preparerService = require('../../services/reporting/activityReportPreparerService');
const { emitEvent } = require('../../services/eventBusService');
const db = require('../../config/db');
const { createLogger } = require('@rbm/lib/logger');

const logger = createLogger('activity-report-preparer-routes');
const APP_URL = (process.env.APP_BASE_URL || 'https://pra.africacdc.org').replace(/\/$/, '');

/**
 * Tell the new and the previous preparer (activity_report.preparer_changed,
 * D-20261013-07). Fire-and-forget: the change is already saved.
 */
function notifyPreparerChange(req, report, change, changes) {
  const last = changes[changes.length - 1] || {};
  db('plan_nodes').where('id', report.plan_node_id).first()
    .then((node = {}) => emitEvent({
      eventKey: 'activity_report.preparer_changed',
      entity: {
        ...report,
        responsible_division_code: node.responsible_division_code,
        owner_user_id: change.to_user_id,
        previous_owner_user_id: change.from_user_id,
      },
      actor: req.user,
      metadata: {
        template_key: 'report-preparer-changed',
        code: node.code,
        title: node.title,
        quarter: report.quarter,
        fiscalYear: report.fiscal_year,
        fromName: last.from_name,
        toName: last.to_name,
        changedBy: last.changed_by_name,
        reason: change.reason,
        reportUrl: `${APP_URL}/activity-report/${report.plan_node_id}/report/${report.id}`,
      },
      knex: db,
    }))
    .catch((err) => logger.error('activity_report.preparer_changed emitEvent failed', { error: err.message }));
}

router.use(authenticateToken);

/** Administrators and M&E officers: activity_report:approve at scope `all`. */
async function assertCanChangePreparer(userId) {
  const { allowed, scope } = await rbacService.checkPermission(
    userId, RBAC_MODULES.ACTIVITY_REPORT, RBAC_ACTIONS.APPROVE,
  );
  if (!allowed || scope !== 'all') {
    throw new ForbiddenError('Only an administrator or M&E officer can change who prepared a report');
  }
}

/**
 * Active users a report can be given to (id, name, email), for the picker.
 * Own path, not under /activity-reports/, so `/activity-reports/:id` never
 * captures it.
 *
 * @name GET /api/reporting/activity-report-preparers
 * @param {express.Request} req
 * @param {express.Response} res — 200 `{ success, data: [{ id, name, email }] }`
 * @returns {Promise<void>}
 * @throws {ForbiddenError} 403 without activity_report:approve at scope `all`
 * @example GET /api/reporting/activity-report-preparers
 */
router.get('/activity-report-preparers', asyncHandler(async (req, res) => {
  await assertCanChangePreparer(req.user.id);
  res.json({ success: true, data: await preparerService.listCandidates() });
}));

/**
 * Give an activity report to another preparer.
 *
 * @name POST /api/reporting/activity-reports/:id/preparer
 * @param {express.Request} req — body `{ user_id, reason }`
 * @param {express.Response} res — 200 `{ success, data: { report, changes } }`
 * @returns {Promise<void>}
 * @throws {ForbiddenError} 403 without activity_report:approve at scope `all`
 * @throws {ValidationError} 400 on a bad id, user or missing reason
 * @throws {NotFoundError} 404 when the report does not exist
 * @example POST /api/reporting/activity-reports/12/preparer { "user_id": 7, "reason": "Prepared by Jane" }
 */
router.post('/activity-reports/:id/preparer', asyncHandler(async (req, res) => {
  await assertCanChangePreparer(req.user.id);
  const reportId = parseInt(req.params.id, 10);
  if (!Number.isFinite(reportId)) throw new ValidationError('Invalid report id');

  const { report, change } = await preparerService.changePreparer({
    reportId,
    toUserId: parseInt(req.body.user_id, 10),
    reason: req.body.reason,
    actorId: req.user.id,
  });
  await audit(req, 'ACTIVITY_REPORT_PREPARER_CHANGED', 'activity_report', reportId, {
    from_user_id: change.from_user_id, to_user_id: change.to_user_id, reason: change.reason,
  });
  const changes = await preparerService.listChanges(reportId);
  notifyPreparerChange(req, report, change, changes);
  res.json({ success: true, data: { changes } });
}));

module.exports = router;
