/* eslint-disable max-lines, complexity, no-restricted-syntax --
 * Extracted from reportingRoutes.js (task #27 commit 8/N). Retains the
 * legacy debt pragma for the original file — this sub-router carries the
 * largest block (activity-reports CRUD + workflow + indicator-aggregate +
 * not-applicable dispute). Follow-up tasks will migrate the legacy
 * `{success: false, error: {...}}` envelopes to canonical shape and extract
 * status/role literals. Do NOT add new violations.
 */
// ── Activity Reports + Indicator Aggregate Routes ──
//
// Extracted from `services/api-server/src/routes/reportingRoutes.js` as the
// fifth routes-layer commit of the task #27 split (commit 8/N). Nine
// routes: four activity-report reads (list, by id, by activity, history),
// upsert + submit/approve/reject workflow, not-applicable dispute, plus
// the `GET /indicator-aggregate` quarterly roll-up. Mounted at
// `/api/reporting` via the parent aggregator — URL paths identical to
// pre-split.

const router = require('express').Router();
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticateToken } = require('../../middleware/authMiddleware');
const rbacService = require('../../services/rbacService');
const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');
const { STATUSES, APPROVAL_ENTITIES } = require('@rbm/lib/enums');
const { scopeCoversDivision, getUserDivisionScope, sameDivision } = require('../../services/divisionAliasService');
const { NotFoundError, ValidationError, ForbiddenError } = require('@rbm/lib/errors');
const { audit } = require('../../middleware/auditLog');
const { emitEvent } = require('../../services/eventBusService');
const { activityReportEmail, activityReportUrl, outcomeRecipients } = require('../../services/reporting/reportEmailDetails');
const contributorEngine = require('../../services/contributorWorkflowEngine');
const workflowEngine = require('../../services/workflowEngine');
const { decideEntityStep } = require('../../services/workflowDecisions');
const { canActOnPendingStep } = require('../../services/approvals/approverIdentity');
const contribFlowDerivation = require('../../services/contribFlowDerivation');
const arService = require('../../services/reporting/activityReportsService');
const { notifyDraftDeleted } = require('../../services/reporting/reportRemovalNotices');
const preparerService = require('../../services/reporting/activityReportPreparerService');
const { ROLES } = require('@rbm/lib/roles');
const db = require('../../config/db');
const reportingWindow = require('../../services/reportingWindowService');
const { createLogger } = require('@rbm/lib/logger');

const logger = createLogger('activity-reports-routes');

/** True when any division in `scope` alias-matches any of `allowedCodes`. */
async function scopeCoversAny(scope, allowedCodes) {
  for (const mine of scope) {
    for (const target of allowedCodes) {
      if (await sameDivision(mine, target)) return true;
    }
  }
  return false;
}

router.use(authenticateToken);


/**
 * List activity reports (scoped by division / period).
 * @name GET /api/reporting/activity-reports
 * @param {express.Request} req — query `division`, `period_id`
 * @param {express.Response} res — 200 JSON array
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/reporting/activity-reports?division=WHC&period_id=3
 */
router.get('/activity-reports', asyncHandler(async (req, res) => {
  const { division, period_id, status } = req.query;
  const q = db('activity_reports')
    .leftJoin('plan_nodes', 'activity_reports.plan_node_id', 'plan_nodes.id')
    .leftJoin('users as preparer', 'activity_reports.user_id', 'preparer.id')
    .select('activity_reports.*', 'preparer.full_name as prepared_by_name',
      'plan_nodes.title as activity_name', 'plan_nodes.code as activity_code',
      'plan_nodes.responsible_division_code');
  if (period_id) {
    // activity_reports has no reporting_period_id column — resolve the
    // period into its quarter/fiscal_year (this filter 500'd before).
    const f = await arService.resolvePeriodFilters(period_id);
    if (!f) return res.json([]);
    q.where('activity_reports.quarter', f.quarter)
      .where('activity_reports.fiscal_year', f.fiscal_year);
  }
  if (status) q.where('activity_reports.status', status);
  if (division) {
    q.where('plan_nodes.responsible_division_code', division);
  }
  res.json(await q.orderBy('activity_reports.created_at', 'desc'));
}));

/**
 * Fetch a single activity report by id.
 * @name GET /api/reporting/activity-reports/:id
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON row, 404 when not found
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/reporting/activity-reports/7
 */
router.get('/activity-reports/:id', asyncHandler(async (req, res) => {
  const report = await db('activity_reports').where('id', parseInt(req.params.id, 10)).first();
  if (!report) throw new NotFoundError('Not found');
  // "Prepared by" history (D-20261013-03): the previous preparers stay visible.
  const preparerChanges = await preparerService.listChanges(report.id);
  res.json({ ...(await arService.withSignOffNames(report)), preparer_changes: preparerChanges });
}));

/**
 * List the activity reports for a workplan item, newest first.
 * @name GET /api/reporting/activity-reports/by-activity/:itemId
 * @param {express.Request} req — query `quarter`, `fiscal_year`, `mine`
 * @param {express.Response} res — 200 JSON array (possibly empty)
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/reporting/activity-reports/by-activity/42?quarter=Q1&mine=1
 */
router.get('/activity-reports/by-activity/:itemId', asyncHandler(async (req, res) => {
  // Multi-report model (D-20260818-01): an activity can carry any number
  // of reports per quarter — this endpoint returns the (filtered) list,
  // newest first. Callers that used to expect row|null now receive [].
  const { quarter, fiscal_year, mine } = req.query;
  const rows = await arService.listByActivity({
    planNodeId: parseInt(req.params.itemId, 10),
    quarter,
    fiscalYear: fiscal_year,
    mine: mine === '1' || mine === 'true',
    userId: req.user.id,
  });
  res.json(rows);
}));

/**
 * History of activity reports for a workplan item across periods.
 * @name GET /api/reporting/activity-reports/history/:itemId
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON array ordered by fiscal_year desc
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/reporting/activity-reports/history/42
 */
router.get('/activity-reports/history/:itemId', asyncHandler(async (req, res) => {
  // activity_reports keys on quarter + fiscal_year directly (NO reporting_period_id
  // column, NO budget_spent_*/overall_progress_pct columns). The previous query
  // joined + selected non-existent columns → 500 on every call (cleaning bug REP-2).
  const reports = await db('activity_reports')
    .where('plan_node_id', parseInt(req.params.itemId, 10))
    .select(
      'id',
      'status',
      'quarter',
      'fiscal_year',
      'actual_spend',
      'total_budget',
      'narrative',
      'participants_count',
      'location',
      'submitted_at',
    )
    .orderBy('fiscal_year', 'desc')
    .orderBy('quarter', 'desc');
  res.json(reports);
}));

/**
 * Create an activity report (ownership-checked against division unless admin).
 * Always a NEW DRAFT — an activity carries any number of independent reports
 * per quarter (D-20260818-01). Any `status` in the body is ignored; edits go
 * through PUT /:id and transitions through /:id/submit.
 * @name POST /api/reporting/activity-reports
 * @param {express.Request} req — body with report values
 * @param {express.Response} res — 201 JSON with the created row, 403 if foreign division
 * @returns {Promise<void>}
 * @throws {Error} 400 without plan_node_id, 403 foreign division, 500 on DB failure
 * @example POST /api/reporting/activity-reports { plan_node_id: 42, quarter: 'Q3' }
 */
router.post('/activity-reports', asyncHandler(async (req, res) => {
  const data = req.body;
  // Only scope='all' (SYSTEM_ADMIN / RBM_ADMIN) bypasses the division gate.
  // Focals hold activity_report.create with scope='own', so a bare `allowed`
  // check silently disabled the ownership/contributor rule for everyone.
  const { allowed, scope: rbacScope } = await rbacService.checkPermission(
    req.user.id, RBAC_MODULES.ACTIVITY_REPORT, RBAC_ACTIONS.CREATE,
  );
  const isAdmin = allowed && rbacScope === 'all';

  // Normalize: accept both plan_node_id and workplan_item_id for backward compat
  const nodeId = data.plan_node_id || data.workplan_item_id;
  if (!nodeId) {
    throw new ValidationError('plan_node_id is required');
  }

  // Fetched once and reused: both the reporting-window guard and the ownership
  // rule below need the node, and a second lookup is a second round-trip.
  const node = await db('plan_nodes').where('id', nodeId).first();

  // A future fiscal year can be planned but never reported on. Keyed on the
  // node, not on the body, so a client that omits or fakes `fiscal_year` does
  // not slip past. Applies to admins too: the year has not started for anyone
  // (A-14).
  if (node) reportingWindow.assertReportableYear(node.fiscal_year);
  await reportingWindow.assertOpenPeriod(db, data.quarter, data.fiscal_year);

  // Check ownership — reporting is allowed for the RESPONSIBLE division AND
  // for divisions listed in the specific's own `contributing_divisions`
  // (D-20260708-01; the contributor approval chain at /submit already routes
  // these through contributor HOD → main HOD → M&E). Division scope comes
  // from user_divisions (alias-aware) with the legacy users.division_code as
  // fallback (D-20260415-11). Users with no division at all keep the
  // historical lenient behaviour — RBAC still gates the module.
  if (!isAdmin) {
    if (node) {
      // Defensive copy: never mutate the Set returned by the service (it may
      // be cached/shared; the shared-instance test mock caught exactly that).
      const scope = new Set(await getUserDivisionScope(req.user.id));
      if (req.user.division_code) scope.add(String(req.user.division_code).toUpperCase());
      const allowedCodes = [
        node.responsible_division_code,
        ...contribFlowDerivation.parseContribList(node.contributing_divisions),
      ].filter(Boolean);
      if (scope.size && allowedCodes.length && !(await scopeCoversAny(scope, allowedCodes))) {
        throw new ForbiddenError('You can only report on activities assigned to your division or listing it as a contributor');
      }
    }
  }

  // Multi-report model (D-20260818-01): POST always creates a new DRAFT.
  // Status transitions happen ONLY via /:id/submit and the review routes,
  // so the old direct-to-SUBMITTED shortcut (and its emitEvent) is gone —
  // the submit route now owns that event.
  const { status: _ignored, ...cleanData } = data;
  const report = await arService.createReport({
    data: { ...cleanData, plan_node_id: nodeId }, userId: req.user.id,
  });
  res.status(201).json(report);
}));

/**
 * Update an activity report by primary key (author while DRAFT/REJECTED,
 * admins always). Never changes status — use /:id/submit.
 * @name PUT /api/reporting/activity-reports/:id
 * @param {express.Request} req — body with report fields
 * @param {express.Response} res — 200 JSON updated row
 * @returns {Promise<void>}
 * @throws {Error} 403 non-author, 404 missing, 400 locked status
 * @example PUT /api/reporting/activity-reports/11 { narrative: '...' }
 */
router.put('/activity-reports/:id', asyncHandler(async (req, res) => {
  const { allowed, scope: rbacScope } = await rbacService.checkPermission(
    req.user.id, RBAC_MODULES.ACTIVITY_REPORT, RBAC_ACTIONS.CREATE,
  );
  const isAdmin = allowed && rbacScope === 'all';
  const report = await arService.updateReport({
    id: parseInt(req.params.id, 10), data: req.body, userId: req.user.id, isAdmin,
  });
  res.json(report);
}));

/**
 * Delete a draft activity report (D-20261013-04). The author, or an
 * administrator (activity_report:create at scope `all`, as for PUT).
 *
 * @name DELETE /api/reporting/activity-reports/:id
 * @param {express.Request} req
 * @param {express.Response} res — 200 `{ success, data: { id } }`
 * @returns {Promise<void>}
 * @throws {ValidationError} 400 on a bad id or a report that is not a draft
 * @throws {ForbiddenError} 403 when the caller is neither the author nor an admin
 * @throws {NotFoundError} 404 when the report does not exist
 * @example DELETE /api/reporting/activity-reports/12
 */
router.delete('/activity-reports/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) throw new ValidationError('Invalid report id');
  const { allowed, scope: rbacScope } = await rbacService.checkPermission(
    req.user.id, RBAC_MODULES.ACTIVITY_REPORT, RBAC_ACTIONS.CREATE,
  );
  const removed = await arService.deleteDraft({ id, userId: req.user.id, isAdmin: allowed && rbacScope === 'all' });
  await audit(req, 'ACTIVITY_REPORT_DRAFT_DELETED', 'activity_report', id, removed);
  res.json({ success: true, data: { id } });
  await notifyDraftDeleted({ removed, actor: req.user });
}));

// Required-fields gate for submission (D-20260818-01): a report is saved as
// DRAFT freely, but submitting demands the minimal set below plus at least
// one uploaded verification file. Column → human-readable label, so the 400
// message names exactly what the author still has to fill in.
// Mirrored by listMissingForSubmit in
// services/web-app/src/pages/reporting/ActivityReportFormPage.jsx — adding a
// required field means updating BOTH lists.
const SUBMIT_REQUIRED_FIELDS = Object.freeze([
  ['start_date', 'start date'],
  ['end_date', 'end date'],
  ['location', 'location'],
  ['lead_organiser', 'lead organiser'],
  ['narrative', 'narrative'],
]);

// "Not started yet" (D-20261013-08): only a valid expected start is required,
// and it must come after the reported quarter. Mirrored in reportTemplate.js.
const quarterIndex = (quarter, year) => Number(year) * 4 + Number(String(quarter || '').replace(/^Q/i, ''));
function listMissingWhenNotStarted(report) {
  const { expected_start_quarter: q, expected_start_year: y } = report;
  if (!/^Q[1-4]$/.test(q || '') || !/^\d{4}$/.test(y || '')) return ['expected start quarter'];
  if (quarterIndex(q, y) <= quarterIndex(report.quarter, report.fiscal_year)) {
    return [`an expected start after ${report.quarter} ${report.fiscal_year}`];
  }
  return [];
}

// `actual_spend` defaults to 0 in the DB, so 0 is a legitimate answer — only
// a NULL means "the author never provided it". Text fields are also rejected
// when blank/whitespace-only.
const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';

/**
 * Collect the human-readable labels of everything still missing before an
 * activity report may be submitted.
 * @param {object} report — the `activity_reports` row
 * @param {number} evidenceCount — rows in `evidence_files` for this report
 * @returns {string[]} labels, empty when the report is submittable
 * @example listMissingForSubmit({ narrative: null }, 0) // ['start date', …, 'verification file']
 */
function listMissingForSubmit(report, evidenceCount) {
  if (report.not_started) return listMissingWhenNotStarted(report);
  const missing = SUBMIT_REQUIRED_FIELDS
    .filter(([column]) => isBlank(report[column]))
    .map(([, label]) => label);
  if (report.actual_spend === null || report.actual_spend === undefined) {
    missing.push('actual spend');
  }
  if (!evidenceCount) missing.push('verification file');
  return missing;
}

/**
 * Submit an activity report (DRAFT → SUBMITTED).
 *
 * Refuses the transition (and leaves the status untouched) until the report
 * carries its dates, location, lead organiser, narrative, actual spend and at
 * least one verification file — see `listMissingForSubmit`.
 *
 * @name POST /api/reporting/activity-reports/:id/submit
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON with the updated row
 * @returns {Promise<void>}
 * @throws {NotFoundError} 404 when the report does not exist
 * @throws {ForbiddenError} 403 when the caller is neither the author nor an admin
 * @throws {ValidationError} 400 when not a draft/rejected report, or listing the missing required fields
 * @example POST /api/reporting/activity-reports/7/submit
 */
router.post('/activity-reports/:id/submit', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);

  // Gate BEFORE any status flip / workflow start — a refused submission must
  // leave the report exactly as it was.
  const existing = await db('activity_reports').where('id', id).first();
  if (!existing) throw new NotFoundError('Activity report not found');
  const { allowed, scope: rbacScope } = await rbacService.checkPermission(
    req.user.id, RBAC_MODULES.ACTIVITY_REPORT, RBAC_ACTIONS.CREATE,
  );
  arService.assertCanSubmit(existing, req.user.id, allowed && rbacScope === 'all');
  const evidence = await db('evidence_files')
    .where({ parent_type: 'activity_report', parent_id: id })
    .count('* as c')
    .first();
  const missing = listMissingForSubmit(existing, Number(evidence?.c || 0));
  if (missing.length) {
    throw new ValidationError(`Cannot submit: missing ${missing.join(', ')}`);
  }

  await db('activity_reports').where('id', id).update({
    status: STATUSES.SUBMITTED, submitted_at: db.fn.now(),
  });
  // Template-driven submit (D-20260817-02): contributor submissions start
  // the CONTRIBUTOR_CHAIN, owner submissions start the DEFAULT chain. A
  // toggled-off template degrades to the flat SUBMITTED stamp above.
  const d = await contribFlowDerivation.deriveContribFlowForActivityReport(id, req.user.id);
  try {
    if (d.isContribFlow) {
      await contributorEngine.startContributorWorkflow({
        entityType: APPROVAL_ENTITIES.ACTIVITY_REPORT, entityId: id, submittedById: req.user.id,
        contribOrgCode: d.contribOrgCode, mainOrgCode: d.mainOrgCode, req,
      });
    } else {
      await workflowEngine.startWorkflow({
        entityType: APPROVAL_ENTITIES.ACTIVITY_REPORT, entityId: id, submittedById: req.user.id,
        divisionCode: d.mainOrgCode || null, req,
      });
    }
  } catch (err) {
    if (err.code !== 'TEMPLATE_NOT_FOUND' && err.code !== 'APPROVER_NOT_RESOLVED') throw err;
    logger.warn('activity_report.submit_degraded', { id, code: err.code });
  }
  // Fan-out via subscription bus — moved here from the old POST-with-status
  // path (D-20260818-01), which no longer exists. Fire-and-forget: the
  // response is sent regardless so a notification failure can never trigger
  // "headers already sent".
  const submitted = await db('activity_reports').where('id', id).first();
  const node = submitted ? await db('plan_nodes').where('id', submitted.plan_node_id).first() : null;
  if (node) {
    const authorName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || req.user.email;
    // The report itself travels in the email: fields + attachment links
    // (template report-submitted-details, D-20261013-07).
    activityReportEmail({ report: submitted, node, submittedBy: authorName })
      .then((details) => emitEvent({
        eventKey: 'activity_report.submitted',
        entity: { ...node, responsible_division_code: node.responsible_division_code },
        actor: req.user,
        metadata: { template_key: 'report-submitted-details', ...details },
        knex: db,
      }))
      .catch((err) => logger.error('activity_report.submitted emitEvent failed', { error: err.message }));
  }
  res.json(submitted);
}));

/**
 * Approve an activity report (approver = current user).
 * @name POST /api/reporting/activity-reports/:id/approve
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON with the updated row
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example POST /api/reporting/activity-reports/7/approve
 */
router.post('/activity-reports/:id/approve', asyncHandler(async (req, res) => {
  const existing = await db('activity_reports').where('id', req.params.id).first();
  if (!existing) throw new NotFoundError('Activity report not found');
  const node = await db('plan_nodes').where('id', existing.plan_node_id).first();
  const divCode = node?.responsible_division_code || null;
  const { allowed, scope } = await rbacService.checkPermission(
    req.user.id, RBAC_MODULES.ACTIVITY_REPORT, RBAC_ACTIONS.APPROVE,
  );
  // A delegate or an escalation target decides without the RBAC scope (D-20261105-09).
  if ((!allowed || !await scopeCoversDivision(req.user, scope, divCode))
    && !await canActOnPendingStep(req.user.id, APPROVAL_ENTITIES.ACTIVITY_REPORT, existing.id)) {
    throw new ForbiddenError('You do not have permission to approve this report');
  }
  // Engine-first (D-20260817-02): decide the pending template step (the RBAC
  // gate above proved scope, so allowUnassigned). Fallback to the direct
  // transition when no instance exists (template toggled off).
  const { handled } = await decideEntityStep({
    entityType: APPROVAL_ENTITIES.ACTIVITY_REPORT, entityId: parseInt(req.params.id, 10),
    decision: STATUSES.APPROVED, userId: req.user.id, comment: null, allowUnassigned: true, req,
  });
  if (!handled) {
    // Clear any stale rejection reason — mirrors workflowEngine's approve path.
    await db('activity_reports').where('id', req.params.id).update({
      status: STATUSES.APPROVED, approved_by: req.user.id, approved_at: db.fn.now(),
      rejection_reason: null,
    });
  }
  const report = await db('activity_reports').where('id', req.params.id).first();
  res.json(report);

  // Fan-out via subscription bus — recipients resolved by
  // `notification_subscriptions`. Multi-step chains may still be mid-flight
  // after one decision, so only fire on the terminal status.
  if (report && report.status === STATUSES.APPROVED) {
    const node = await db('plan_nodes').where('id', report.plan_node_id).first();
    const reviewerName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || req.user.email;
    await emitEvent({
      eventKey: 'activity_report.approved',
      // Outcome to the author, the BU focal person and the BU head (D-20261015-01).
      entity: { ...report, ...(node || {}), submitted_by: report.user_id, ...outcomeRecipients(report.user_id, node?.responsible_division_code) },
      actor: req.user,
      metadata: {
        template_key: 'report-reviewed',
        reportType: 'Activity Report',
        code: node?.code || '',
        title: node?.title || '',
        division: node?.responsible_division_code || '',
        reportUrl: activityReportUrl(report),
        decision: STATUSES.APPROVED,
        reviewedBy: reviewerName,
        quarter: report.quarter || '',
        fiscalYear: report.fiscal_year || '',
      },
      knex: db,
    });
  }
}));

/**
 * Reject an activity report with a reason.
 * @name POST /api/reporting/activity-reports/:id/reject
 * @param {express.Request} req — body `{ reason }`
 * @param {express.Response} res — 200 JSON with the updated row
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example POST /api/reporting/activity-reports/7/reject { reason: '...' }
 */
router.post('/activity-reports/:id/reject', asyncHandler(async (req, res) => {
  // The review modal enforces this client-side; keep the API honest too.
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason) throw new ValidationError('Rejection reason is required');
  const existing = await db('activity_reports').where('id', req.params.id).first();
  if (!existing) throw new NotFoundError('Activity report not found');
  const node = await db('plan_nodes').where('id', existing.plan_node_id).first();
  const divCode = node?.responsible_division_code || null;
  const { allowed, scope } = await rbacService.checkPermission(
    req.user.id, RBAC_MODULES.ACTIVITY_REPORT, RBAC_ACTIONS.REJECT,
  );
  if ((!allowed || !await scopeCoversDivision(req.user, scope, divCode))
    && !await canActOnPendingStep(req.user.id, APPROVAL_ENTITIES.ACTIVITY_REPORT, existing.id)) {
    throw new ForbiddenError('You do not have permission to reject this report');
  }
  // Engine-first (D-20260817-02) — mirror of the approve path.
  const { handled } = await decideEntityStep({
    entityType: APPROVAL_ENTITIES.ACTIVITY_REPORT, entityId: parseInt(req.params.id, 10),
    decision: STATUSES.REJECTED, userId: req.user.id, comment: reason, allowUnassigned: true, req,
  });
  if (!handled) {
    // Rejecting invalidates any earlier approval — clear its stamps.
    await db('activity_reports').where('id', req.params.id).update({
      status: STATUSES.REJECTED, rejection_reason: reason,
      approved_by: null, approved_at: null,
    });
  }
  const report = await db('activity_reports').where('id', req.params.id).first();
  res.json(report);

  // Fan-out via subscription bus — only on the terminal status (a rejection
  // through the engine is terminal by design, this guard keeps it symmetric).
  if (report && report.status === STATUSES.REJECTED) {
    const node = await db('plan_nodes').where('id', report.plan_node_id).first();
    const reviewerName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || req.user.email;
    await emitEvent({
      eventKey: 'activity_report.rejected',
      // Outcome to the author, the BU focal person and the BU head (D-20261015-01).
      entity: { ...report, ...(node || {}), submitted_by: report.user_id, ...outcomeRecipients(report.user_id, node?.responsible_division_code) },
      actor: req.user,
      metadata: {
        template_key: 'report-reviewed',
        reportType: 'Activity Report',
        code: node?.code || '',
        title: node?.title || '',
        division: node?.responsible_division_code || '',
        reportUrl: activityReportUrl(report),
        decision: STATUSES.REJECTED,
        reviewedBy: reviewerName,
        reason,
        quarter: report.quarter || '',
        fiscalYear: report.fiscal_year || '',
      },
      knex: db,
    });
  }
}));

/**
 * Aggregate activity report contributions for a given indicator + quarter.
 *
 * Returns the indicator metadata, the sum of contribution_value across
 * all activity reports linked to this indicator, and a per-activity
 * breakdown so the quarterly report can display what feeds the number.
 *
 * @name GET /api/reporting/indicator-aggregate
 * @param {express.Request} req — query: indicator_id (required), quarter, fiscal_year, division_code
 * @param {express.Response} res — 200 JSON { indicator, aggregate }
 */
router.get('/indicator-aggregate', asyncHandler(async (req, res) => {
  const { indicator_id, quarter, fiscal_year, division_code } = req.query;
  if (!indicator_id) {
    throw new ValidationError('indicator_id is required');
  }

  const fy = fiscal_year || String(new Date().getFullYear());
  const q = quarter || ('Q' + (Math.floor(new Date().getMonth() / 3) + 1));

  // Fetch the indicator
  const indicator = await db('plan_nodes').where('id', parseInt(indicator_id)).first();
  if (!indicator) {
    throw new NotFoundError('Indicator not found');
  }

  // Find all specific activities linked to this indicator
  let specsQuery = db('plan_nodes')
    .where('linked_indicator_id', parseInt(indicator_id))
    .where('node_type', 'SPECIFIC_ACTIVITY');
  if (division_code) {
    specsQuery = specsQuery.where('responsible_division_code', division_code);
  }
  const specs = await specsQuery.select('id', 'code', 'title', 'responsible_division_code');

  if (specs.length === 0) {
    return res.json({
      success: true,
      data: {
        indicator: { id: indicator.id, code: indicator.code, title: indicator.title, tier_id: indicator.tier_id, baseline_numeric: indicator.baseline_numeric, target_y1_numeric: indicator.target_y1_numeric },
        aggregate: { total_contribution: 0, activity_count: 0, reported_count: 0, activities: [] },
      },
    });
  }

  const specIds = specs.map(s => s.id);

  // Fetch activity reports for these specifics in the given quarter
  const reports = await db('activity_reports')
    .whereIn('plan_node_id', specIds)
    .where('quarter', q)
    .where('fiscal_year', fy)
    .whereNot('status', STATUSES.NOT_APPLICABLE)
    .select('id', 'plan_node_id', 'contribution_value', 'narrative', 'indicator_achievement',
      'participants_count', 'status', 'created_at')
    .orderBy('created_at', 'desc');

  // Multi-report model: group every report by activity, sum APPROVED
  // contributions, and pick the "best" status for display
  // (APPROVED > SUBMITTED > DRAFT > REJECTED).
  const reportsBySpec = {};
  reports.forEach((r) => {
    (reportsBySpec[r.plan_node_id] = reportsBySpec[r.plan_node_id] || []).push(r);
  });
  const STATUS_RANK = [STATUSES.APPROVED, STATUSES.SUBMITTED, STATUSES.DRAFT, STATUSES.REJECTED];
  const bestStatus = (rows) => STATUS_RANK.find((s) => rows.some((r) => r.status === s)) || rows[0]?.status || null;
  const isCounted = (r) => r.status === STATUSES.SUBMITTED || r.status === STATUSES.APPROVED;

  const activities = specs.map((spec) => {
    const rows = reportsBySpec[spec.id] || [];
    const approvedSum = rows
      .filter((r) => r.status === STATUSES.APPROVED && r.contribution_value != null)
      .reduce((sum, r) => sum + parseFloat(r.contribution_value), 0);
    const latest = rows[0] || null;
    return {
      plan_node_id: spec.id,
      activity_code: spec.code,
      activity_title: spec.title,
      division_code: spec.responsible_division_code,
      has_report: rows.length > 0,
      report_count: rows.length,
      activity_report_id: latest?.id || null,
      contribution_value: rows.length ? approvedSum : null,
      narrative: latest?.narrative || null,
      indicator_achievement: latest?.indicator_achievement || null,
      participants_count: latest?.participants_count || null,
      report_status: bestStatus(rows),
    };
  });

  const reportedActivities = activities.filter((a) =>
    (reportsBySpec[a.plan_node_id] || []).some(isCounted));
  const totalContribution = activities.reduce((sum, a) => sum + (a.contribution_value || 0), 0);

  res.json({
    success: true,
    data: {
      indicator: {
        id: indicator.id,
        code: indicator.code,
        title: indicator.title,
        tier_id: indicator.tier_id,
        baseline_numeric: indicator.baseline_numeric,
        target_y1_numeric: indicator.target_y1_numeric,
        unit: indicator.unit || null,
      },
      aggregate: {
        total_contribution: totalContribution,
        activity_count: specs.length,
        reported_count: reportedActivities.length,
        unreported_count: specs.length - reportedActivities.length,
        activities,
      },
    },
  });
}));

/**
 * Mark a specific activity as NOT_APPLICABLE for this division.
 * The focal person must provide a reason explaining why it doesn't
 * concern their division. Admins see this in the review dashboard.
 *
 * @name POST /api/reporting/activity-reports/:id/not-applicable
 */
router.post('/activity-reports/:id/not-applicable', asyncHandler(async (req, res) => {
  // The :id parameter is the plan_node_id (the specific activity being
  // flagged), NOT the activity_reports primary key. Earlier versions of
  // this handler treated it as activity_reports.id, which silently fell
  // through to an INSERT every call and crashed on the second attempt
  // with a duplicate-key violation on the
  // (plan_node_id, quarter, fiscal_year) unique index.
  const planNodeId = parseInt(req.params.id, 10);
  const reason = (req.body.reason || '').trim();
  if (!reason) {
    throw new ValidationError('A reason is required when marking an activity as not applicable');
  }
  if (!Number.isFinite(planNodeId)) {
    throw new ValidationError('Invalid activity id');
  }

  const spec = await db('plan_nodes').where('id', planNodeId).first();
  if (!spec) {
    throw new NotFoundError('Activity not found');
  }
  // Same gate as the create path: an activity belonging to a future plan
  // cannot be dismissed as "not applicable" (A-14).
  reportingWindow.assertReportableYear(spec.fiscal_year);

  // The activity's own year, and the quarter the client asked for, else the
  // OPEN reporting period. The wall clock filed N/A flags made during the Q3
  // window under Q4, where the Q3 page never showed them (D-20261013-01).
  const fiscalYear = String(spec.fiscal_year || new Date().getFullYear());
  const quarter = await reportingWindow.reportingQuarter(db, fiscalYear, req.body.quarter);

  // At most one NOT_APPLICABLE row per (activity, quarter, FY), enforced by
  // this status-scoped lookup. Since D-20260818-01 an activity carries many
  // reports for the same tuple, so an unscoped lookup would hijack (and
  // overwrite) a member's real report.
  let report = await db('activity_reports')
    .where({ plan_node_id: planNodeId, quarter, fiscal_year: fiscalYear, status: STATUSES.NOT_APPLICABLE })
    .first();

  if (report) {
    await db('activity_reports')
      .where('id', report.id)
      .update({
        status: STATUSES.NOT_APPLICABLE,
        narrative: reason,
        rejection_reason: reason,
        user_id: req.user.id,
        updated_at: db.fn.now(),
      });
    report = await db('activity_reports').where('id', report.id).first();
  } else {
    const [newId] = await db('activity_reports').insert({
      plan_node_id: planNodeId,
      user_id: req.user.id,
      quarter,
      fiscal_year: fiscalYear,
      status: STATUSES.NOT_APPLICABLE,
      narrative: reason,
    });
    report = await db('activity_reports').where('id', newId).first();
  }

  await audit(req, 'OWNERSHIP_DISPUTE', 'activity_report', report.id, { reason });

  // Notify all admins (SYSTEM_ADMIN + RBM_ADMIN). `spec` was already loaded
  // above (we needed it to validate the plan_node existed), so reuse it
  // instead of querying again.
  const activityLabel = spec ? `${spec.code} — ${spec.title}` : `Activity #${report.plan_node_id}`;
  const userName = req.user.full_name || req.user.email || 'A focal person';
  // user_roles stores role_id (FK → roles.id); the role CODE lives on
  // roles.code. Filtering `user_roles.role` referenced a column that does
  // not exist and 500'd at runtime — join roles the way
  // contributorWorkflowEngine does.
  const adminUsers = await db('user_roles')
    .join('roles', 'roles.id', 'user_roles.role_id')
    .join('users', 'user_roles.user_id', 'users.id')
    .whereIn('roles.code', [ROLES.SYSTEM_ADMIN, ROLES.RBM_ADMIN])
    .where('users.status', 'ACTIVE')
    .select('users.id')
    .groupBy('users.id');

  const notifications = adminUsers.map(u => ({
    user_id: u.id,
    entity_type: 'activity_report',
    entity_id: report.id,
    message: `Ownership dispute: ${userName} flagged "${activityLabel}" as not their division's responsibility. Reason: ${reason}`,
    is_read: false,
  }));
  if (notifications.length) {
    await db('notifications').insert(notifications);
  }

  res.json({ success: true, data: report });
}));

/**
 * Dismiss an ownership dispute: the activity stays with its current division,
 * so every NOT_APPLICABLE verdict on it is voided (all quarters — mirrors the
 * reassignment cleanup in plan-nodes/specificActivities.js).
 *
 * Why a dedicated endpoint: the dispute used to be dismissed by re-POSTing the
 * report with `status: DRAFT`, which the pre-multi-report upsert turned into an
 * UPDATE of the NA row. POST is create-only since D-20260818-01, so that call
 * now inserts a junk empty DRAFT and leaves the dispute standing.
 *
 * @name POST /api/reporting/activity-reports/:id/dismiss-dispute
 * @param {express.Request} req — `:id` is the plan_node_id (the specific
 *   activity), NOT an activity_reports primary key
 * @param {express.Response} res — 200 `{ success, data: { deleted } }`
 * @returns {Promise<void>}
 * @throws {ValidationError} 400 on a non-numeric id
 * @throws {ForbiddenError} 403 without activity_report:approve at scope `all`
 * @throws {NotFoundError} 404 when the activity does not exist
 * @example POST /api/reporting/activity-reports/42/dismiss-dispute
 */
router.post('/activity-reports/:id/dismiss-dispute', asyncHandler(async (req, res) => {
  // Admin-only, matrix-driven: dismissing overrides a focal person's verdict
  // on someone else's activity, so a division-scoped approver is not enough.
  const { allowed, scope } = await rbacService.checkPermission(
    req.user.id, RBAC_MODULES.ACTIVITY_REPORT, RBAC_ACTIONS.APPROVE,
  );
  if (!allowed || scope !== 'all') {
    throw new ForbiddenError('You do not have permission to dismiss ownership disputes');
  }

  const planNodeId = parseInt(req.params.id, 10);
  if (!Number.isFinite(planNodeId)) {
    throw new ValidationError('Invalid activity id');
  }

  const spec = await db('plan_nodes').where('id', planNodeId).first();
  if (!spec) {
    throw new NotFoundError('Activity not found');
  }

  const deleted = await db('activity_reports')
    .where({ plan_node_id: planNodeId, status: STATUSES.NOT_APPLICABLE })
    .del();

  await audit(req, 'OWNERSHIP_DISPUTE_DISMISSED', 'plan_node', planNodeId, { deleted });

  res.json({ success: true, data: { deleted } });
}));

module.exports = router;
