/* eslint-disable max-lines, complexity -- aggregated review-queue/all/summary + detail/submit/approve/reject in one file by design. */
/**
 * Indicator Division Report routes.
 *
 * One report per (indicator, division, quarter). RBAC-gated.
 */

'use strict';

const router = require('express').Router();
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticateToken } = require('../../middleware/authMiddleware');
const rbacService = require('../../services/rbacService');
const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');
const { PLAN_NODE_TYPES, STATUSES, APPROVAL_ENTITIES } = require('@rbm/lib/enums');
const { ROLES } = require('@rbm/lib/roles');
const { createLogger } = require('@rbm/lib/logger');

const logger = createLogger('api-server').child({ module: 'indicatorDivisionReportRoutes' });

// Write rules shared with the evidence routes (D-20261108-02).
const { maySubmitFor } = require('../../services/reporting/reportAccess');
const { scopeCoversDivision } = require('../../services/divisionAliasService');
const { ForbiddenError, NotFoundError, ValidationError } = require('@rbm/lib/errors');
const svc = require('../../services/reporting/indicatorDivisionReportsService');
const { notifyNotApplicable } = require('../../services/reporting/reportRemovalNotices');
const { getReportRole, isCoveredByOwner } = require('../../services/reporting/divisionContribution');
const db = require('../../config/db');
const { actingFor, whereActionable, canActOnPendingStep } = require('../../services/approvals/approverIdentity');
const reportingWindow = require('../../services/reportingWindowService');
const { audit } = require('../../middleware/auditLog');

router.use(authenticateToken);

/**
 * GET /api/reporting/indicator-division-reports/review-queue
 *
 * List indicator-division reports awaiting the current user's approval.
 * Admins (QUARTERLY_REPORT:approve:all) see every IN_REVIEW report.
 *
 * Response rows include the current pending step_label + indicator
 * metadata + submitter info so the Review Submissions UI can render a
 * self-contained row.
 */
router.get('/indicator-division-reports/review-queue', asyncHandler(async (req, res) => {
  const { allowed: isAdmin } = await rbacService.checkPermission(
    req.user.id, RBAC_MODULES.QUARTERLY_REPORT, RBAC_ACTIONS.APPROVE,
  ).then(r => ({ allowed: r.allowed && r.scope === 'all' }))
    .catch(() => ({ allowed: false }));

  // Optional `division` query param (CSV or repeated) — used by HODs /
  // focal persons to see every report FOR THE DIVISIONS they oversee,
  // even when the current pending step is assigned to another actor
  // (e.g. an M&E officer on an OWNER flow). Accepts a single code or a
  // comma-separated list ("All my divisions" expands to the user's full
  // scope). Codes the user has no user_divisions membership on are
  // silently dropped (non-admin cannot peek at foreign divisions).
  const rawDiv = req.query.division || req.query.division_code;
  const scopeDivisions = (Array.isArray(rawDiv) ? rawDiv : (rawDiv ? String(rawDiv).split(',') : []))
    .map((c) => String(c || '').trim().toUpperCase())
    .filter(Boolean);
  let allowedDivisions = scopeDivisions;
  if (scopeDivisions.length && !isAdmin) {
    const userDivisions = (await db('user_divisions')
      .where('user_id', req.user.id)
      .pluck('division_code')).map((d) => String(d).toUpperCase());
    allowedDivisions = scopeDivisions.filter((d) => userDivisions.includes(d));
  }
  const canScopeDivision = allowedDivisions.length > 0;

  // Pull the CURRENT pending step of every IN_REVIEW instance (the one
  // with the smallest step_order that is still PENDING). This collapses
  // a 3-step contributor chain into ONE inbox row instead of three.
  const base = db('indicator_division_reports as r')
    .join('approval_instances as ai', function () {
      this.on('ai.entity_id', '=', 'r.id')
        .andOn('ai.entity_type', '=', db.raw('?', ['INDICATOR_DIVISION_REPORT']));
    })
    .join('approval_steps as s', 's.approval_instance_id', 'ai.id')
    .leftJoin('plan_nodes as p', 'p.id', 'r.plan_node_id')
    .leftJoin('users as sub', 'sub.id', 'r.submitted_by')
    .where('ai.status', STATUSES.IN_REVIEW)
    .where('s.decision', 'PENDING')
    // Keep only the earliest pending step for each instance.
    .whereNotExists(function () {
      this.from('approval_steps as s2')
        .whereRaw('s2.approval_instance_id = s.approval_instance_id')
        .where('s2.decision', 'PENDING')
        .whereRaw('s2.step_order < s.step_order');
    })
    .leftJoin('division_codes as dc', 'dc.code', 'r.division_code')
    .leftJoin('division_codes as dcp1', 'dcp1.code', 'dc.parent_code')
    .leftJoin('division_codes as dcp2', 'dcp2.code', 'dcp1.parent_code')
    .select(
      'r.id as report_id', 'r.plan_node_id', 'r.division_code', 'r.role',
      'r.status', 'r.quarter', 'r.fiscal_year', 'r.actual_value',
      'r.submitted_at', 'r.updated_at',
      'p.code as indicator_code', 'p.title as indicator_title',
      'p.responsible_division_code as owner_division', 'p.is_big_ticket',
      // Directorate is resolved by walking up the parent chain to find the
      // ancestor flagged level_type='directorate' (the canonical org-tree
      // top-level). Falls back to the legacy `directorate` text column when
      // the chain isn't set up. Up to 2 ancestors covers the current org.
      db.raw(`COALESCE(
        CASE WHEN dc.level_type = 'directorate' THEN dc.division_name END,
        CASE WHEN dcp1.level_type = 'directorate' THEN dcp1.division_name END,
        CASE WHEN dcp2.level_type = 'directorate' THEN dcp2.division_name END,
        dc.directorate
      ) as directorate`),
      'dc.division_name as division_name',
      // Per-quarter target resolved against r.quarter so the UI shows the
      // right figure regardless of which quarter the report is for.
      db.raw(`CASE r.quarter
        WHEN 'Q1' THEN p.q1_target_numeric
        WHEN 'Q2' THEN p.q2_target_numeric
        WHEN 'Q3' THEN p.q3_target_numeric
        WHEN 'Q4' THEN p.q4_target_numeric
      END AS quarter_target`),
      'ai.id as instance_id', 'ai.is_contrib_flow', 'ai.round',
      's.id as step_id', 's.step_order', 's.step_label', 's.approver_id', 's.role_code',
      'sub.first_name as sub_first_name', 'sub.last_name as sub_last_name', 'sub.email as sub_email',
    )
    .orderBy('r.submitted_at', 'desc');

  // Scope by quarter + fiscal_year when provided — otherwise the inbox
  // leaks rows from other quarters onto the current tab.
  const qFilter = req.query.quarter ? String(req.query.quarter).toUpperCase() : null;
  const fyFilter = req.query.fiscal_year ? String(req.query.fiscal_year) : null;
  if (qFilter) base.where('r.quarter', qFilter);
  if (fyFilter) base.where('r.fiscal_year', fyFilter);

  let rows;
  if (canScopeDivision) {
    rows = await base.whereIn('r.division_code', allowedDivisions);
  } else if (isAdmin) {
    rows = await base;
  } else {
    rows = await whereActionable(base, { alias: 's', userId: req.user.id, actingIds: await actingFor(req.user.id) });
  }
  // Drop redundant CONTRIB rows (parent/child of OWNER) — these were
  // created before D-20260419-22; they don't deserve a slot in the queue.
  const filtered = [];
  for (const r of rows) {
    if (r.role === 'CONTRIB' && await isCoveredByOwner(r.plan_node_id, r.division_code)) continue;
    filtered.push(r);
  }
  res.json({ success: true, data: filtered });
}));

/**
 * GET /api/reporting/indicator-division-reports/all
 *
 * Admin/M&E oversight view: returns indicator-division reports, optionally
 * scoped by `quarter`, `fiscal_year` and/or `status` (all omittable — no
 * filter means "every quarter/year/status"). Enriched with indicator,
 * submitter, creator and current workflow step when one is active.
 *
 * Non-admins can call this ONLY with a `division` filter they belong to.
 */
router.get('/indicator-division-reports/all', asyncHandler(async (req, res) => {
  const quarter = req.query.quarter || null;
  const fiscalYear = req.query.fiscal_year || null;
  const status = req.query.status || null;

  const { allowed: isAdmin } = await rbacService.checkPermission(
    req.user.id, RBAC_MODULES.QUARTERLY_REPORT, RBAC_ACTIONS.APPROVE,
  ).then(r => ({ allowed: r.allowed && r.scope === 'all' }))
    .catch(() => ({ allowed: false }));

  const rawDiv = req.query.division || req.query.division_code;
  const divisions = (Array.isArray(rawDiv) ? rawDiv : (rawDiv ? String(rawDiv).split(',') : []))
    .map((c) => String(c || '').trim().toUpperCase()).filter(Boolean);

  if (!isAdmin && divisions.length === 0) {
    res.json({ success: true, data: [] });
    return;
  }

  const q = db('indicator_division_reports as r')
    .leftJoin('plan_nodes as p', 'p.id', 'r.plan_node_id')
    .leftJoin('users as sub', 'sub.id', 'r.submitted_by')
    .leftJoin('users as cr', 'cr.id', 'r.created_by')
    // Who actually flagged a NOT_APPLICABLE dispute. Not `submitted_by` —
    // a report flagged NOT_APPLICABLE was, by definition, never submitted,
    // so that column is always NULL here. The real actor is only ever
    // recorded in indicator_report_history.performed_by (written atomically
    // with the status flip in indicatorDivisionReportsService.markNotApplicable()),
    // so pull the most recent NOT_APPLICABLE history row per report (a
    // report can cycle flag -> dismiss -> re-flag more than once) and join
    // its performer. Mirrors the correlated-subquery style already used
    // below for the pending approval step.
    .leftJoin('users as flagger', function () {
      this.on('flagger.id', '=', db.raw(
        `(SELECT h.performed_by FROM indicator_report_history h
          WHERE h.report_id = r.id AND h.action = ?
          ORDER BY h.id DESC LIMIT 1)`,
        ['NOT_APPLICABLE'],
      ));
    })
    .leftJoin('approval_instances as ai', function () {
      this.on('ai.entity_id', '=', 'r.id')
        .andOn('ai.entity_type', '=', db.raw('?', ['INDICATOR_DIVISION_REPORT']))
        .andOn('ai.status', '=', db.raw('?', [STATUSES.IN_REVIEW]));
    })
    .leftJoin('approval_steps as s', function () {
      this.on('s.approval_instance_id', '=', 'ai.id')
        .andOn('s.decision', '=', db.raw('?', ['PENDING']))
        .andOn('s.step_order', '=', db.raw('(SELECT MIN(s2.step_order) FROM approval_steps s2 WHERE s2.approval_instance_id = ai.id AND s2.decision = ?)', ['PENDING']));
    })
    .leftJoin('division_codes as dc', 'dc.code', 'r.division_code')
    .leftJoin('division_codes as dcp1', 'dcp1.code', 'dc.parent_code')
    .leftJoin('division_codes as dcp2', 'dcp2.code', 'dcp1.parent_code')
    .select(
      'r.id as report_id', 'r.plan_node_id', 'r.division_code', 'r.role',
      'r.status', 'r.quarter', 'r.fiscal_year', 'r.actual_value',
      'r.narrative', 'r.rejection_reason',
      'r.submitted_at', 'r.updated_at', 'r.created_at',
      'p.code as indicator_code', 'p.title as indicator_title',
      'p.responsible_division_code as owner_division', 'p.tier_id', 'p.is_big_ticket',
      // Directorate is resolved by walking up the parent chain to find the
      // ancestor flagged level_type='directorate' (the canonical org-tree
      // top-level). Falls back to the legacy `directorate` text column when
      // the chain isn't set up. Up to 2 ancestors covers the current org.
      db.raw(`COALESCE(
        CASE WHEN dc.level_type = 'directorate' THEN dc.division_name END,
        CASE WHEN dcp1.level_type = 'directorate' THEN dcp1.division_name END,
        CASE WHEN dcp2.level_type = 'directorate' THEN dcp2.division_name END,
        dc.directorate
      ) as directorate`),
      'dc.division_name as division_name',
      db.raw(`CASE r.quarter
        WHEN 'Q1' THEN p.q1_target_numeric
        WHEN 'Q2' THEN p.q2_target_numeric
        WHEN 'Q3' THEN p.q3_target_numeric
        WHEN 'Q4' THEN p.q4_target_numeric
      END AS quarter_target`),
      'ai.id as instance_id', 'ai.is_contrib_flow', 'ai.round',
      's.id as step_id', 's.step_order', 's.step_label',
      'sub.first_name as sub_first_name', 'sub.last_name as sub_last_name', 'sub.email as sub_email',
      'cr.first_name as created_by_first_name', 'cr.last_name as created_by_last_name', 'cr.email as created_by_email',
      'flagger.first_name as flagged_by_first_name', 'flagger.last_name as flagged_by_last_name', 'flagger.email as flagged_by_email',
    )
    .orderBy('r.updated_at', 'desc');

  if (quarter) q.where('r.quarter', quarter);
  if (fiscalYear) q.where('r.fiscal_year', fiscalYear);
  if (status) q.where('r.status', status);
  if (divisions.length) q.whereIn('r.division_code', divisions);

  const rows = await q;
  res.json({ success: true, data: rows });
}));

/**
 * GET /api/reporting/indicator-division-reports/summary
 *
 * Per-indicator rollup used by the indicators list to show who has pushed
 * their contribution and where the approvals stand — without loading every
 * report row.
 *
 * Returns a map keyed by `${plan_node_id}__${quarter}` with:
 *   - owner_status          : OWNER division report status (null if no row)
 *   - contribs_expected     : total divisions listed as contributors
 *                             (contributing_divisions + Specific Activity
 *                             owners, de-duplicated)
 *   - contribs_draft        : CONTRIB reports in DRAFT
 *   - contribs_in_review    : CONTRIB reports IN_REVIEW/SUBMITTED
 *   - contribs_approved     : CONTRIB reports APPROVED
 *   - contribs_rejected     : CONTRIB reports REJECTED
 */
router.get('/indicator-division-reports/summary', asyncHandler(async (req, res) => {
  const fiscalYear = req.query.fiscal_year || new Date().getFullYear().toString();
  const quartersRaw = req.query.quarter;
  const quarters = Array.isArray(quartersRaw) ? quartersRaw : (quartersRaw ? [quartersRaw] : ['Q1', 'Q2', 'Q3', 'Q4']);
  const planNodeIdsRaw = req.query.plan_node_ids || req.query['plan_node_ids[]'];
  const planNodeIds = (Array.isArray(planNodeIdsRaw) ? planNodeIdsRaw : (planNodeIdsRaw ? String(planNodeIdsRaw).split(',') : []))
    .map((id) => parseInt(id, 10)).filter(Number.isFinite);

  if (!planNodeIds.length) {
    res.json({ success: true, data: {} });
    return;
  }

  // 1. Load the indicators + their Specific Activity children to compute
  //    the expected contributor set (de-duplicated).
  const nodes = await db('plan_nodes').whereIn('id', planNodeIds)
    .select('id', 'responsible_division_code', 'contributing_divisions');
  const sas = await db('plan_nodes')
    .whereIn('linked_indicator_id', planNodeIds)
    .where('node_type', PLAN_NODE_TYPES.SPECIFIC_ACTIVITY)
    .select('linked_indicator_id', 'responsible_division_code', 'contributing_divisions');

  const expectedByNode = {};
  for (const n of nodes) {
    const set = new Set();
    try {
      const arr = typeof n.contributing_divisions === 'string' ? JSON.parse(n.contributing_divisions) : (n.contributing_divisions || []);
      for (const c of arr) if (c) set.add(String(c).toUpperCase());
    } catch { /* ignore */ }
    expectedByNode[n.id] = { owner: String(n.responsible_division_code || '').toUpperCase(), contribs: set };
  }
  for (const sa of sas) {
    const bucket = expectedByNode[sa.linked_indicator_id];
    if (!bucket) continue;
    const own = String(sa.responsible_division_code || '').toUpperCase();
    if (own && own !== bucket.owner) bucket.contribs.add(own);
    try {
      const arr = typeof sa.contributing_divisions === 'string' ? JSON.parse(sa.contributing_divisions) : (sa.contributing_divisions || []);
      for (const c of arr) {
        const u = String(c || '').toUpperCase();
        if (u && u !== bucket.owner) bucket.contribs.add(u);
      }
    } catch { /* ignore */ }
  }

  // 2. Aggregate reports.
  const reports = await db('indicator_division_reports')
    .whereIn('plan_node_id', planNodeIds)
    .whereIn('quarter', quarters)
    .where('fiscal_year', fiscalYear)
    .select('plan_node_id', 'quarter', 'role', 'status');

  const out = {};
  for (const pnId of planNodeIds) {
    for (const q of quarters) {
      out[`${pnId}__${q}`] = {
        owner_status: null,
        contribs_expected: (expectedByNode[pnId]?.contribs.size) || 0,
        contribs_draft: 0,
        contribs_in_review: 0,
        contribs_approved: 0,
        contribs_rejected: 0,
      };
    }
  }
  for (const r of reports) {
    const key = `${r.plan_node_id}__${r.quarter}`;
    const bucket = out[key];
    if (!bucket) continue;
    if (r.role === 'OWNER') {
      bucket.owner_status = r.status;
    } else if (r.role === 'CONTRIB') {
      if (r.status === STATUSES.DRAFT) bucket.contribs_draft += 1;
      else if (r.status === STATUSES.IN_REVIEW || r.status === STATUSES.SUBMITTED) bucket.contribs_in_review += 1;
      else if (r.status === STATUSES.APPROVED) bucket.contribs_approved += 1;
      else if (r.status === STATUSES.REJECTED) bucket.contribs_rejected += 1;
    }
  }

  res.json({ success: true, data: out });
}));

/**
 * GET /api/reporting/indicator-division-reports
 * List all reports for a division (used by the list page to show statuses).
 */
/**
 * N/A set by the MAIN division of each indicator, for one fiscal year
 * (D-20261013-10): contributors see the indicator as not applicable too.
 *
 * @name GET /api/reporting/indicator-division-reports/owner-not-applicable
 * @param {express.Request} req — `?fiscal_year=2026`
 * @param {express.Response} res — 200 `{ success, data: [{ plan_node_id, quarter, division_code, rejection_reason }] }`
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/reporting/indicator-division-reports/owner-not-applicable?fiscal_year=2026
 */
router.get('/indicator-division-reports/owner-not-applicable', asyncHandler(async (req, res) => {
  const fiscalYear = String(req.query.fiscal_year || new Date().getFullYear());
  const rows = await db('indicator_division_reports as r')
    .join('plan_nodes as p', 'p.id', 'r.plan_node_id')
    .where('r.status', STATUSES.NOT_APPLICABLE)
    .where('r.fiscal_year', fiscalYear)
    .whereRaw('UPPER(r.division_code) = UPPER(p.responsible_division_code)')
    .select('r.plan_node_id', 'r.quarter', 'r.division_code', 'r.rejection_reason');
  res.json({ success: true, data: rows });
}));

router.get('/indicator-division-reports', asyncHandler(async (req, res) => {
  // One code or a comma list: the division page shows every division in the
  // user's active selection at once (D-20261013-05).
  const divisionCodes = String(req.query.division_code || req.user.division_code || '')
    .split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
  const fiscalYear = req.query.fiscal_year || new Date().getFullYear().toString();
  const reports = await db('indicator_division_reports')
    .whereIn('division_code', divisionCodes)
    .where({ fiscal_year: fiscalYear })
    .select('id', 'plan_node_id', 'division_code', 'quarter', 'role', 'actual_value', 'status');
  res.json({ success: true, data: reports });
}));

/**
 * GET /api/reporting/indicator-division-reports/:planNodeId
 * Get the current user's report + all division reports for this indicator.
 */
router.get('/indicator-division-reports/:planNodeId', asyncHandler(async (req, res) => {
  const planNodeId = parseInt(req.params.planNodeId, 10);
  const quarter = req.query.quarter || 'Q1';
  const fiscalYear = req.query.fiscal_year || new Date().getFullYear().toString();
  const divisionCode = req.query.division_code || req.user.division_code;

  // 1. Look up the user's own report (if any) for this division.
  let myReport = await db('indicator_division_reports')
    .where({ plan_node_id: planNodeId, division_code: divisionCode, quarter, fiscal_year: fiscalYear })
    .first();

  // 2. Pull all reports + check if the user is currently a pending
  //    approver on ANY of them. "Approver" means ANY of:
  //      - directly assigned (step.approver_id === user.id)
  //      - step unassigned (approver_id IS NULL) — we let system-wide
  //        approvers pick it up
  //      - user holds system-wide approve rights (SYSTEM_ADMIN /
  //        ME_OFFICER with quarterly_report:approve:all) and can
  //        act on ANY pending step regardless of who's assigned
  //        (admin override; governanceService also accepts this
  //        at the route layer)
  const allReportsBeforeInit = await svc.getAllForIndicator(planNodeId, quarter, fiscalYear);
  let pendingApproval = null;
  if (allReportsBeforeInit.length > 0) {
    const { allowed: canApproveAll } = await rbacService.checkPermission(
      req.user.id, RBAC_MODULES.QUARTERLY_REPORT, RBAC_ACTIONS.APPROVE,
    ).then((r) => ({ allowed: r.allowed && r.scope === 'all' }))
      .catch(() => ({ allowed: false }));

    const q = db('approval_steps as s')
      .join('approval_instances as ai', 'ai.id', 's.approval_instance_id')
      .where('s.decision', 'PENDING')
      .where('ai.entity_type', 'INDICATOR_DIVISION_REPORT')
      .whereIn('ai.entity_id', allReportsBeforeInit.map(r => r.id));

    if (!canApproveAll) {
      whereActionable(q, { alias: 's', userId: req.user.id, actingIds: await actingFor(req.user.id), includeUnassigned: true });
    }

    const step = await q
      .select('s.id as step_id', 's.step_label', 'ai.entity_id as report_id', 's.approver_id')
      .orderByRaw('s.step_order') // surface the EARLIEST pending step first
      .first();
    if (step) pendingApproval = step;
  }

  // 3. Auto-init when the user has no report yet AND their division holds a
  //    real role (OWNER or CONTRIB) on this indicator — including contribution
  //    via a Specific Activity (all handled by getReportRole, which returns
  //    null for a pure reviewer so this never inits a report for one).
  //
  //    H-4 lockout fix (D-20260621): the init MUST NOT be suppressed by
  //    `pendingApproval`. That flag is true whenever ANY report on this
  //    indicator has a pending step the user could act on — and because the
  //    CONTRIBUTOR_CHAIN leaves UNASSIGNED steps (approver_id IS NULL) that
  //    match every user, one division's submission used to block every other
  //    eligible division (owner + other contributors) from ever getting their
  //    own report. getReportRole already gates who may report, so we rely on
  //    it alone here; pendingApproval stays purely a reviewer-surface signal.
  if (!myReport) {
    const role = await getReportRole(planNodeId, divisionCode);
    if (role) {
      // silentInit: a form VIEW must not stamp "Report created — <viewer>"
      // on the timeline; the first real save writes it (D-20260714-01).
      myReport = await svc.getOrInit({ planNodeId, divisionCode, quarter, fiscalYear, userId: req.user.id, silentInit: true });
    }
  }

  // 4. Refresh allReports if init created a new row.
  const allReports = myReport && !allReportsBeforeInit.find(r => r.id === myReport.id)
    ? await svc.getAllForIndicator(planNodeId, quarter, fiscalYear)
    : allReportsBeforeInit;

  // 5. Timeline shows the lifecycle of the report the user is interacting
  //    with — their own when they have one, otherwise the report they are
  //    reviewing. Never the OWNER report when the user is just a reviewer
  //    for a CONTRIB report (avoids cross-report pollution).
  const focusReportId = myReport?.id || pendingApproval?.report_id || null;
  const history = focusReportId ? await svc.getHistory(focusReportId) : [];

  // 6. Workflow state of the active (IN_REVIEW) instance so the UI can
  //    render remaining steps as "pending" entries in the timeline and
  //    make it obvious that an "Approved — Step 1" is NOT the end.
  let workflow = null;
  if (focusReportId) {
    const activeInstance = await db('approval_instances')
      .where({ entity_type: 'INDICATOR_DIVISION_REPORT', entity_id: focusReportId, status: STATUSES.IN_REVIEW })
      .orderBy('id', 'desc')
      .first();
    if (activeInstance) {
      const steps = await db('approval_steps as s')
        .leftJoin('users as u', 'u.id', 's.approver_id')
        .where('s.approval_instance_id', activeInstance.id)
        .select(
          's.id', 's.step_order', 's.step_label', 's.decision', 's.completed_date',
          's.approver_id', 's.role_code', 'u.first_name', 'u.last_name', 'u.email',
        )
        .orderBy('s.step_order');
      workflow = {
        instance_id: activeInstance.id,
        instance_status: activeInstance.status,
        is_contrib_flow: activeInstance.is_contrib_flow,
        round: activeInstance.round,
        steps,
      };
    }
  }

  // Tag redundant CONTRIB rows (parent/child of OWNER). These were
  // created before D-20260419-22 closed the loophole; we keep them in
  // the response so the form can flag them as "covered by OWNER" instead
  // of pretending they're a real separate contribution.
  for (const r of allReports) {
    if (r.role === 'CONTRIB') {
      r.is_redundant_contrib = await isCoveredByOwner(planNodeId, r.division_code);
    } else {
      r.is_redundant_contrib = false;
    }
  }

  const total = allReports.reduce((s, r) => s + (Number(r.actual_value) || 0), 0);

  // Expected contributors set = OWNER division + every CONTRIB division
  // listed on the indicator OR owning a Specific Activity linked to it.
  // We return the MERGED view so the Contributors modal can show every
  // expected row, including divisions that have not started reporting.
  const node = await db('plan_nodes').where('id', planNodeId).first('id', 'responsible_division_code', 'contributing_divisions');
  const expectedCodesSet = new Set();
  if (node?.responsible_division_code) expectedCodesSet.add(String(node.responsible_division_code).toUpperCase());
  try {
    const raw = node?.contributing_divisions;
    const arr = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []);
    for (const c of arr) if (c) expectedCodesSet.add(String(c).toUpperCase());
  } catch { /* ignore */ }
  const sas = await db('plan_nodes')
    .where({ node_type: PLAN_NODE_TYPES.SPECIFIC_ACTIVITY, linked_indicator_id: planNodeId })
    .select('responsible_division_code', 'contributing_divisions');
  for (const sa of sas) {
    if (sa.responsible_division_code) expectedCodesSet.add(String(sa.responsible_division_code).toUpperCase());
    try {
      const raw = sa.contributing_divisions;
      const arr = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []);
      for (const c of arr) if (c) expectedCodesSet.add(String(c).toUpperCase());
    } catch { /* ignore */ }
  }
  const expectedCodes = Array.from(expectedCodesSet);
  const divRows = expectedCodes.length
    ? await db('division_codes').whereIn('code', expectedCodes).select('code', 'division_name')
    : [];
  const divNameByCode = new Map(divRows.map((d) => [String(d.code).toUpperCase(), d.division_name]));
  const ownerCode = String(node?.responsible_division_code || '').toUpperCase();
  const existingByDivision = new Map(allReports.map((r) => [String(r.division_code).toUpperCase(), r]));
  const expectedContributors = expectedCodes.map((code) => {
    const role = code === ownerCode ? 'OWNER' : 'CONTRIB';
    const existing = existingByDivision.get(code) || null;
    return {
      division_code: code,
      division_name: divNameByCode.get(code) || code,
      role,
      report: existing,
      // Synthetic UI status for a contributor that has not created a report yet
      // (not a DB-persisted value). Sourced from STATUSES to avoid a hardcoded literal.
      status: existing?.status || STATUSES.NOT_STARTED,
    };
  });

  res.json({
    success: true,
    data: {
      myReport: myReport || null,
      allReports,
      expectedContributors,
      history,
      totalActual: total,
      pendingApproval,
      workflow,
    },
  });
}));

/**
 * POST /api/reporting/indicator-division-reports
 * Save draft for current user's division.
 */
router.post('/indicator-division-reports', asyncHandler(async (req, res) => {
  const { plan_node_id, division_code, quarter, fiscal_year, ...data } = req.body;
  const divCode = division_code || req.user.division_code;

  // Only someone who reports for that division writes its draft (D-20261108-02).
  if (!(await maySubmitFor(req.user.id, divCode)).ok) {
    throw new ForbiddenError('You do not have permission to report on this division');
  }

  // A future fiscal year can be planned but never reported on (A-14).
  await reportingWindow.assertReportableNode(db, plan_node_id);
  reportingWindow.assertReportableYear(fiscal_year);
  await reportingWindow.assertOpenPeriod(db, quarter, fiscal_year);

  const report = await svc.saveDraft({
    planNodeId: parseInt(plan_node_id, 10),
    divisionCode: divCode,
    quarter,
    fiscalYear: fiscal_year,
    userId: req.user.id,
    data,
  });

  res.json({ success: true, data: report });
}));

/**
 * POST /api/reporting/indicator-division-reports/:id/submit
 */
router.post('/indicator-division-reports/:id/submit', asyncHandler(async (req, res) => {
  const report = await db('indicator_division_reports').where('id', parseInt(req.params.id, 10)).first();
  if (!report) throw new NotFoundError('Report not found');

  // Division roles in the report's division, or scope « all » (maySubmitFor).
  if (!(await maySubmitFor(req.user.id, report.division_code)).ok) {
    throw new ForbiddenError('You do not have permission to submit this report');
  }

  const result = await svc.submit(report.id, req.user.id, req);
  res.json({ success: true, data: result });
}));

/**
 * POST /api/reporting/indicator-division-reports/:id/not-applicable
 *
 * Flag an indicator as not applicable to the caller's division for the
 * given quarter. `:id` is the plan_node_id (the indicator), NOT an
 * existing report's primary key — a report row may not exist yet when
 * this is called from the division report queue list. Idempotent upsert
 * keyed on (plan_node_id, division_code, quarter, fiscal_year), the same
 * unique constraint every other report write in this table respects.
 */
router.post('/indicator-division-reports/:id/not-applicable', asyncHandler(async (req, res) => {
  const planNodeId = parseInt(req.params.id, 10);
  const reason = (req.body.reason || '').trim();
  const quarter = String(req.body.quarter || '').toUpperCase();
  const fiscalYear = String(req.body.fiscal_year || '');
  const divisionCode = req.body.division_code || req.user.division_code;

  if (!Number.isFinite(planNodeId)) {
    throw new ValidationError('Invalid indicator id');
  }
  if (!reason) {
    throw new ValidationError('A reason is required when marking an indicator as not applicable');
  }
  if (!quarter || !fiscalYear) {
    throw new ValidationError('quarter and fiscal_year are required');
  }
  if (!divisionCode) {
    throw new ValidationError('division_code is required');
  }

  const node = await db('plan_nodes').where('id', planNodeId).first();
  if (!node) {
    throw new NotFoundError('Indicator not found');
  }
  // Marking an indicator "not applicable" is a reporting write like any other.
  reportingWindow.assertReportableYear(node.fiscal_year);
  reportingWindow.assertReportableYear(fiscalYear);

  const { ok: authorised, scope } = await maySubmitFor(req.user.id, divisionCode);
  if (!authorised) {
    throw new ForbiddenError('You do not have permission to report on this division');
  }

  // Only the main division marks N/A (D-20261013-10): an administrator's
  // N/A is recorded under the main division, whatever division was sent.
  const naDivision = scope === 'all' ? (node.responsible_division_code || divisionCode) : divisionCode;
  const report = await svc.markNotApplicable({
    planNodeId, divisionCode: naDivision, quarter, fiscalYear, userId: req.user.id, reason,
  });

  await audit(req, 'OWNERSHIP_DISPUTE', 'indicator_division_report', report.id, { reason });
  await notifyNotApplicable({ report, node, actor: req.user, reason });

  // Admin notification block: wrapped in try/catch as best-effort.
  // If admin user query or notifications insert fails, the core action already succeeded,
  // so we log the error but still return success to the client.
  try {
    const indicatorLabel = `${node.code} — ${node.title}`;
    const userName = req.user.full_name || req.user.email || 'A focal person';
    const adminUsers = await db('user_roles')
      .join('roles', 'user_roles.role_id', 'roles.id')
      .join('users', 'user_roles.user_id', 'users.id')
      .whereIn('roles.code', [ROLES.SYSTEM_ADMIN, ROLES.RBM_ADMIN])
      .where('users.status', 'ACTIVE')
      .select('users.id')
      .groupBy('users.id');
    const notifications = adminUsers.map((u) => ({
      user_id: u.id,
      entity_type: 'indicator_division_report',
      entity_id: report.id,
      message: `Ownership dispute: ${userName} flagged "${indicatorLabel}" as not applicable to ${divisionCode}. Reason: ${reason}`,
      is_read: false,
    }));
    if (notifications.length) {
      await db('notifications').insert(notifications);
    }
  } catch (notifyError) {
    logger.error('[not-applicable] admin notification failed (core action succeeded)', { err: notifyError.message, stack: notifyError.stack, reportId: report.id, planNodeId, divisionCode });
  }

  res.json({ success: true, data: report });
}));

/**
 * POST /api/reporting/indicator-division-reports/:id/approve
 */
router.post('/indicator-division-reports/:id/approve', asyncHandler(async (req, res) => {
  const report = await db('indicator_division_reports').where('id', parseInt(req.params.id, 10)).first();
  if (!report) throw new NotFoundError('Report not found');

  const { allowed, scope } = await rbacService.checkPermission(
    req.user.id, RBAC_MODULES.QUARTERLY_REPORT, RBAC_ACTIONS.APPROVE,
  );
  // A delegate or an escalation target decides without the RBAC scope (D-20261105-09).
  if ((!allowed || !await scopeCoversDivision(req.user, scope, report.division_code))
    && !await canActOnPendingStep(req.user.id, APPROVAL_ENTITIES.INDICATOR_DIVISION_REPORT, report.id)) {
    throw new ForbiddenError('You do not have permission to approve this report');
  }

  const allowUnassigned = allowed && scope === 'all';
  const result = await svc.approve(report.id, req.user.id, req.body.comment, { allowUnassigned });
  res.json({ success: true, data: result });
}));

/**
 * POST /api/reporting/indicator-division-reports/:id/reject
 */
router.post('/indicator-division-reports/:id/reject', asyncHandler(async (req, res) => {
  const report = await db('indicator_division_reports').where('id', parseInt(req.params.id, 10)).first();
  if (!report) throw new NotFoundError('Report not found');

  const { allowed, scope } = await rbacService.checkPermission(
    req.user.id, RBAC_MODULES.QUARTERLY_REPORT, RBAC_ACTIONS.REJECT,
  );
  if ((!allowed || !await scopeCoversDivision(req.user, scope, report.division_code))
    && !await canActOnPendingStep(req.user.id, APPROVAL_ENTITIES.INDICATOR_DIVISION_REPORT, report.id)) {
    throw new ForbiddenError('You do not have permission to reject this report');
  }

  const allowUnassigned = allowed && scope === 'all';
  const result = await svc.reject(report.id, req.user.id, req.body.comment || req.body.reason, { allowUnassigned });
  res.json({ success: true, data: result });
}));

/**
 * POST /api/reporting/indicator-division-reports/:id/admin-set-status
 *
 * Admin-only override. Accepts `{ status, comment }`. Bypasses the
 * workflow engine and closes any live approval instance, so admins can
 * reopen APPROVED/VALIDATED reports, revoke approval, or unlock a
 * stuck DRAFT without having to edit the DB by hand. Gated by
 * `quarterly_report:approve` with scope='all'.
 */
router.post('/indicator-division-reports/:id/admin-set-status', asyncHandler(async (req, res) => {
  const reportId = parseInt(req.params.id, 10);
  const targetStatus = String(req.body?.status || '').trim().toUpperCase();
  const comment = req.body?.comment || null;

  const { allowed, scope } = await rbacService.checkPermission(
    req.user.id, RBAC_MODULES.QUARTERLY_REPORT, RBAC_ACTIONS.APPROVE,
  );
  if (!allowed || scope !== 'all') {
    throw new ForbiddenError('Admin override requires full approve scope');
  }

  const result = await svc.forceSetStatus(reportId, targetStatus, req.user.id, comment);
  res.json({ success: true, data: result });
}));

/**
 * GET /api/reporting/indicator-division-reports/:id/history
 */
router.get('/indicator-division-reports/:id/history', asyncHandler(async (req, res) => {
  const history = await svc.getHistory(parseInt(req.params.id, 10));
  res.json({ success: true, data: history });
}));

module.exports = router;
