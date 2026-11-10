/**
 * Indicator Division Reports service.
 *
 * One report per (indicator, division, quarter). Each division (MAIN or
 * CONTRIB) submits its own report. Total actual = SUM across divisions.
 */

/* eslint-disable complexity, max-lines -- orchestration service: status transitions, role routing, emitEvent hooks, admin override; the file is intentionally top-level procedural so each flow is readable end-to-end. */
'use strict';

const db = require('../../config/db');
const { ForbiddenError } = require('@rbm/lib/errors');
const { STATUSES, APPROVAL_ENTITIES } = require('@rbm/lib/enums');

// Statuses in which a quarterly report is no longer a draft its division edits.
const LOCKED_REPORT_STATUSES = Object.freeze([STATUSES.SUBMITTED, STATUSES.IN_REVIEW, STATUSES.APPROVED]);
const workflowEngine = require('../workflowEngine');
const { actingFor, whereActionable } = require('../approvals/approverIdentity');
const { startContributorWorkflow } = require('../contributorWorkflowEngine');
const { getReportRole } = require('./divisionContribution');
const { emitEvent } = require('../eventBusService');
const {
  indicatorReportEmail, indicatorReportUrl, outcomeRecipients, submitterName,
} = require('./reportEmailDetails');

/** Metadata of a decision email (`report-reviewed`): the decision, the reason and a link. */
async function outcomeDetails({ report, node, actor, decision, reason }) {
  return {
    code: node.code || '',
    title: node.title || '',
    division: report.division_code || '',
    quarter: report.quarter || '',
    fiscalYear: report.fiscal_year || '',
    decision,
    reason: reason || '',
    reviewedBy: await submitterName(actor?.id, actor),
    reportUrl: indicatorReportUrl(report),
  };
}

/**
 * Fire-and-forget event emission for an indicator-division-report
 * lifecycle change. Failures are swallowed — notifications must never
 * break the workflow path.
 *
 * @param {string} eventKey
 * @param {number} reportId
 * @param {object} actor
 * @param {{ decision?: string, reason?: string }} [outcome] - set for validated / rejected
 */
async function emitReportEvent(eventKey, reportId, actor, outcome = null) {
  try {
    const report = await db('indicator_division_reports').where('id', reportId).first();
    if (!report) return;
    const node = await db('plan_nodes').where('id', report.plan_node_id).first();
    if (!node) return;
    const isSubmit = eventKey === 'indicator_report.submitted';
    // On submit the report itself travels in the email (D-20261013-07); on a
    // decision the outcome goes to the author and the business unit (D-20261015-01).
    let details = {};
    if (isSubmit) details = await indicatorReportEmail({ report, node, actor });
    else if (outcome) details = await outcomeDetails({ report, node, actor, ...outcome });
    await emitEvent({
      eventKey,
      entity: {
        ...report, ...node, responsible_division_code: report.division_code, plan_node: node,
        ...outcomeRecipients(report.submitted_by || report.created_by, report.division_code),
      },
      actor: actor || { id: report.submitted_by, email: null },
      metadata: {
        template_key: isSubmit ? 'report-submitted-details' : 'report-reviewed',
        reportType: 'Indicator Quarterly Report',
        reportId,
        division_code: report.division_code,
        ...details,
      },
    });
  } catch {
    // Notification failures must never break the workflow — silently drop.
  }
}

const ROLE_CONTRIB = 'CONTRIB';
const HISTORY_ACTION = Object.freeze({ SUBMITTED: 'SUBMITTED', RESUBMITTED: 'RESUBMITTED' });

/**
 * Get or initialize a report for (indicator, division, quarter).
 *
 * Same-directorate rule (D-20260710-01): when the reporting division sits
 * under the SAME thematic directorate as the indicator's responsible
 * division (DG excluded), the report IS the main division's report — the
 * row is created/fetched under the main's code with role OWNER, so the
 * dashboard and queues show the main as having reported. Who typed it
 * stays traced via created_by/submitted_by.
 *
 * `silentInit` (D-20260714-01): the report-form GET auto-inits a row for
 * every role-holding viewer (H-4). With the default history write, MERELY
 * OPENING the form stamped "Report created — <viewer>" on the timeline.
 * Silent init skips that event; the CREATED entry is written by the first
 * real write instead (saveDraft's ensureCreatedHistory).
 */
async function getOrInit({ planNodeId, divisionCode, quarter, fiscalYear, userId, silentInit = false }) {
  let existing = await db('indicator_division_reports')
    .where({ plan_node_id: planNodeId, division_code: divisionCode, quarter, fiscal_year: fiscalYear })
    .first();
  if (existing) return existing;

  // Same-directorate snap (D-20260710-01) — only on the creation path:
  // migration 20260710010000 re-attributed all pre-existing rows, so any
  // row found above is already correctly attributed.
  const node = await db('plan_nodes').where('id', planNodeId).select('responsible_division_code').first();
  const mainCode = node && node.responsible_division_code;
  if (mainCode && divisionCode && mainCode.toUpperCase() !== String(divisionCode).toUpperCase()) {
    const { sameDirectorate } = require('../divisionAliasService');
    if (await sameDirectorate(divisionCode, mainCode)) {
      divisionCode = mainCode;
      existing = await db('indicator_division_reports')
        .where({ plan_node_id: planNodeId, division_code: divisionCode, quarter, fiscal_year: fiscalYear })
        .first();
      if (existing) return existing;
    }
  }

  // Resolve role via the canonical helper (handles list + Specific Activity).
  const resolvedRole = await getReportRole(planNodeId, divisionCode);
  if (!resolvedRole) {
    // ForbiddenError, not a plain Error: the error handler reads statusCode,
    // so `{ status: 403 }` surfaced as a 500 to the reporter.
    throw new ForbiddenError(`${divisionCode} is neither the owner nor a contributor of this indicator, so it cannot report on it.`);
  }

  const [id] = await db('indicator_division_reports').insert({
    plan_node_id: planNodeId,
    division_code: divisionCode,
    quarter,
    fiscal_year: fiscalYear,
    role: resolvedRole,
    status: STATUSES.DRAFT,
    created_by: userId,
  });

  if (!silentInit) {
    await addHistory(id, {
      action: 'CREATED',
      fromStatus: null,
      toStatus: STATUSES.DRAFT,
      performedBy: userId,
    });
  }

  return db('indicator_division_reports').where('id', id).first();
}

/**
 * Backfill the CREATED timeline entry on the FIRST real write of a report
 * that was silently auto-initialised by a form view (D-20260714-01).
 * No-op when a CREATED entry already exists.
 */
async function ensureCreatedHistory(reportId, userId) {
  const existing = await db('indicator_report_history')
    .where({ report_id: reportId, action: 'CREATED' })
    .first();
  if (existing) return;
  await addHistory(reportId, {
    action: 'CREATED',
    fromStatus: null,
    toStatus: STATUSES.DRAFT,
    performedBy: userId,
  });
}

/**
 * Nobody reports on an indicator its main division marked not applicable for
 * the quarter (D-20261013-12). The main division itself (or a division of its
 * directorate) may still reopen it.
 *
 * @param {{ planNodeId: number, quarter: string, fiscalYear: string, divisionCode: string }} p
 * @returns {Promise<void>}
 * @throws {Error} 400 INDICATOR_NOT_APPLICABLE
 */
async function assertNotDroppedByMain({ planNodeId, quarter, fiscalYear, divisionCode }) {
  const [ownerNa] = await db('indicator_division_reports as r')
    .join('plan_nodes as p', 'p.id', 'r.plan_node_id')
    .where({ 'r.plan_node_id': planNodeId, 'r.quarter': quarter, 'r.fiscal_year': fiscalYear, 'r.status': STATUSES.NOT_APPLICABLE })
    .whereRaw('UPPER(r.division_code) = UPPER(p.responsible_division_code)')
    .select('r.division_code')
    .limit(1);
  if (!ownerNa || String(ownerNa.division_code).toUpperCase() === String(divisionCode || '').toUpperCase()) return;
  const { sameDirectorate } = require('../divisionAliasService');
  if (await sameDirectorate(divisionCode, ownerNa.division_code)) return;
  throw Object.assign(
    new Error(`The main division (${ownerNa.division_code}) marked this indicator not applicable for ${quarter}: nothing to report.`),
    { status: 400, code: 'INDICATOR_NOT_APPLICABLE' },
  );
}

/** True when any number (or numeric string) nested in `value` is below zero. */
function hasNegativeNumber(value) {
  if (Array.isArray(value)) return value.some(hasNegativeNumber);
  if (value && typeof value === 'object') return Object.values(value).some(hasNegativeNumber);
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n < 0;
}

/**
 * Save draft (upsert). Rejects negative actual_value — results are always
 * zero-or-positive counts/percentages. (D-20260420-37)
 */
async function saveDraft({ planNodeId, divisionCode, quarter, fiscalYear, userId, data }) {
  if (data.actual_value !== undefined && data.actual_value !== null && data.actual_value !== '') {
    const n = Number(data.actual_value);
    if (Number.isFinite(n) && n < 0) {
      throw Object.assign(
        new Error('Actual value cannot be negative'),
        { status: 400, code: 'VALIDATION_FAILED' },
      );
    }
  }

  await assertNotDroppedByMain({ planNodeId, quarter, fiscalYear, divisionCode });

  // Disaggregation counts are never negative either (D-20261013-11).
  if (data.disaggregations !== undefined && hasNegativeNumber(data.disaggregations)) {
    throw Object.assign(new Error('Disaggregation values cannot be negative'), { status: 400, code: 'VALIDATION_FAILED' });
  }

  // An emptied field arrives as '' and actual_value is DECIMAL: strict MySQL
  // rejects '' (every autosave of a report with no value failed with a 500).
  const actualValue = data.actual_value === '' ? null : data.actual_value;

  const report = await getOrInit({ planNodeId, divisionCode, quarter, fiscalYear, userId });
  // A report in review or approved is not edited back to a draft (D-20261108-02).
  if (LOCKED_REPORT_STATUSES.includes(report.status)) {
    throw Object.assign(
      new Error('This report is in review or approved and can no longer be edited'),
      { status: 409, code: 'REPORT_LOCKED' },
    );
  }
  // First REAL write owns the "Report created" timeline entry — view-time
  // silent inits never wrote one (D-20260714-01).
  await ensureCreatedHistory(report.id, userId);

  await db('indicator_division_reports').where('id', report.id).update({
    actual_value: actualValue !== undefined ? actualValue : report.actual_value,
    narrative: data.narrative !== undefined ? data.narrative : report.narrative,
    challenges: data.challenges !== undefined ? data.challenges : report.challenges,
    recommendations: data.recommendations !== undefined ? data.recommendations : report.recommendations,
    evidence_url: data.evidence_url !== undefined ? data.evidence_url : report.evidence_url,
    disaggregations: data.disaggregations !== undefined ? JSON.stringify(data.disaggregations) : report.disaggregations,
    reporting_date: data.reporting_date || report.reporting_date,
    status: STATUSES.DRAFT,
    updated_at: db.fn.now(),
  });

  return db('indicator_division_reports').where('id', report.id).first();
}

/**
 * Submit a report (DRAFT → SUBMITTED).
 */
async function submit(reportId, userId, req) {
  const report = await db('indicator_division_reports').where('id', reportId).first();
  if (!report) throw Object.assign(new Error('Report not found'), { status: 404 });
  if (report.status !== STATUSES.DRAFT && report.status !== STATUSES.REJECTED) {
    throw Object.assign(new Error(`Cannot submit from status ${report.status}`), { status: 400 });
  }
  const stored = Number(report.actual_value);
  if (Number.isFinite(stored) && stored < 0) {
    throw Object.assign(
      new Error('Actual value cannot be negative — edit the draft before submitting'),
      { status: 400, code: 'VALIDATION_FAILED' },
    );
  }

  await assertNotDroppedByMain({
    planNodeId: report.plan_node_id, quarter: report.quarter, fiscalYear: report.fiscal_year, divisionCode: report.division_code,
  });

  const action = report.status === STATUSES.REJECTED ? HISTORY_ACTION.RESUBMITTED : HISTORY_ACTION.SUBMITTED;
  let actualToStatus = STATUSES.SUBMITTED;

  // Route by role: OWNER -> DEFAULT (1-step M&E sign-off);
  //                CONTRIB -> CONTRIBUTOR_CHAIN (3-step cross-division chain).
  try {
    if (report.role === ROLE_CONTRIB) {
      const planNode = await db('plan_nodes').where('id', report.plan_node_id).first('responsible_division_code');
      const mainOrgCode = planNode?.responsible_division_code || null;
      await startContributorWorkflow({
        entityType: APPROVAL_ENTITIES.INDICATOR_DIVISION_REPORT,
        entityId: reportId,
        submittedById: userId,
        contribOrgCode: report.division_code,
        mainOrgCode,
        req,
      });
    } else {
      await workflowEngine.startWorkflow({
        entityType: APPROVAL_ENTITIES.INDICATOR_DIVISION_REPORT,
        entityId: reportId,
        submittedById: userId,
        divisionCode: report.division_code,
        req,
      });
    }
    // Both engines set status to IN_REVIEW for INDICATOR_DIVISION_REPORT
    actualToStatus = STATUSES.IN_REVIEW;
  } catch (err) {
    if (err.code === 'TEMPLATE_NOT_FOUND') {
      await db('indicator_division_reports').where('id', reportId).update({
        status: STATUSES.SUBMITTED,
        submitted_by: userId,
        submitted_at: db.fn.now(),
        updated_at: db.fn.now(),
      });
      actualToStatus = STATUSES.SUBMITTED;
    } else {
      throw err;
    }
  }

  // A silently-initialised report submitted without a prior save still
  // deserves its CREATED entry before the SUBMITTED one (D-20260714-01).
  await ensureCreatedHistory(reportId, userId);
  await addHistory(reportId, {
    action,
    fromStatus: report.status,
    toStatus: actualToStatus,
    performedBy: userId,
  });

  // Notify reviewers: M&E for OWNER reports, full chain for CONTRIB.
  await emitReportEvent('indicator_report.submitted', reportId, req?.user || { id: userId });

  return db('indicator_division_reports').where('id', reportId).first();
}

/**
 * Locate the pending approval step actionable by `userId` on `reportId`'s
 * current approval instance. A step is actionable when it was assigned to
 * the user directly OR when it is unassigned and `opts.allowUnassigned`
 * is true (set by callers who already verified the user holds the
 * admin/M&E scope). Returns `null` when none found.
 * @private
 */
async function findPendingStepForUser(reportId, userId, { allowUnassigned = false } = {}) {
  const query = db('approval_steps as s')
    .join('approval_instances as ai', 'ai.id', 's.approval_instance_id')
    .where('ai.entity_type', APPROVAL_ENTITIES.INDICATOR_DIVISION_REPORT)
    .where('ai.entity_id', reportId)
    .whereIn('ai.status', [STATUSES.IN_REVIEW])
    .where('s.decision', 'PENDING');
  // Admin / M&E scope=all → can approve ANY pending step regardless of
  // who it's assigned to. Otherwise the step must be assigned to the user
  // directly (or unassigned, for historical steps with NULL approver_id).
  if (!allowUnassigned) {
    // Approver, delegate or escalation target (D-20261105-09), or unassigned.
    whereActionable(query, { alias: 's', userId, actingIds: await actingFor(userId), includeUnassigned: true });
  }
  return query
    .orderBy('s.step_order')
    .first('s.id as step_id', 's.step_label', 's.step_order');
}

/**
 * Approve the current pending step of the report's workflow on behalf of
 * `userId`. Advances the workflow (next step becomes pending) or finalises
 * the report (status=APPROVED) when this was the last step.
 *
 * Delegates to workflowEngine.decideWorkflowStep so step history is
 * persisted and the timeline reflects every actor's decision — instead of
 * short-circuiting the report straight to APPROVED as the old impl did.
 *
 * @param {number} reportId
 * @param {number} userId
 * @param {string} [comment]
 * @returns {Promise<object>} the updated report row
 * @throws {Error} NO_PENDING_STEP when the user has no pending step on this report
 */
async function approve(reportId, userId, comment, { allowUnassigned = false } = {}) {
  const report = await db('indicator_division_reports').where('id', reportId).first();
  if (!report) throw Object.assign(new Error('Report not found'), { status: 404 });
  if (report.status !== STATUSES.SUBMITTED && report.status !== STATUSES.IN_REVIEW) {
    throw Object.assign(new Error(`Cannot approve from status ${report.status}`), { status: 400 });
  }

  const step = await findPendingStepForUser(reportId, userId, { allowUnassigned });
  if (!step) {
    throw Object.assign(
      new Error('You have no pending approval step on this report'),
      { status: 403, code: 'NO_PENDING_STEP' },
    );
  }

  await workflowEngine.decideWorkflowStep(step.step_id, STATUSES.APPROVED, comment, userId);

  // Notify when the report transitions to its terminal APPROVED status —
  // step-level decisions may continue (multi-step CONTRIB chain), so we
  // only fire the report-level event when the row's status is now APPROVED.
  const after = await db('indicator_division_reports').where('id', reportId).first();
  if (after?.status === STATUSES.APPROVED || after?.status === STATUSES.VALIDATED) {
    await emitReportEvent('indicator_report.validated', reportId, { id: userId }, { decision: STATUSES.APPROVED });
  }
  return after;
}

/**
 * Reject the current pending step of the report's workflow on behalf of
 * `userId`. Rejects the whole instance and resets the report to REJECTED
 * so the submitter can edit and resubmit.
 *
 * @param {number} reportId
 * @param {number} userId
 * @param {string} comment
 * @returns {Promise<object>} the updated report row
 */
async function reject(reportId, userId, comment, { allowUnassigned = false } = {}) {
  const report = await db('indicator_division_reports').where('id', reportId).first();
  if (!report) throw Object.assign(new Error('Report not found'), { status: 404 });
  if (report.status !== STATUSES.SUBMITTED && report.status !== STATUSES.IN_REVIEW) {
    throw Object.assign(new Error(`Cannot reject from status ${report.status}`), { status: 400 });
  }

  const step = await findPendingStepForUser(reportId, userId, { allowUnassigned });
  if (!step) {
    throw Object.assign(
      new Error('You have no pending approval step on this report'),
      { status: 403, code: 'NO_PENDING_STEP' },
    );
  }

  await workflowEngine.decideWorkflowStep(step.step_id, STATUSES.REJECTED, comment, userId);

  await emitReportEvent('indicator_report.rejected', reportId, { id: userId }, { decision: STATUSES.REJECTED, reason: comment });
  return db('indicator_division_reports').where('id', reportId).first();
}

/**
 * Flag a report as not applicable to the division (ownership dispute —
 * the indicator-report equivalent of the activity_reports NOT_APPLICABLE
 * flow). Reuses getOrInit so a fresh row is created with the correct
 * OWNER/CONTRIB role when the division hasn't reported on this indicator
 * yet this quarter; otherwise flips the existing row's status.
 *
 * @param {{ planNodeId: number, divisionCode: string, quarter: string, fiscalYear: string, userId: number, reason: string }} params
 * @returns {Promise<object>} the updated report row
 */
async function markNotApplicable({ planNodeId, divisionCode, quarter, fiscalYear, userId, reason }) {
  await assertMainDivision(planNodeId, divisionCode);
  const report = await getOrInit({ planNodeId, divisionCode, quarter, fiscalYear, userId });
  const fromStatus = report.status;

  await db('indicator_division_reports').where('id', report.id).update({
    status: STATUSES.NOT_APPLICABLE,
    narrative: reason,
    rejection_reason: reason,
    updated_at: db.fn.now(),
  });

  await addHistory(report.id, {
    action: 'NOT_APPLICABLE',
    fromStatus,
    toStatus: STATUSES.NOT_APPLICABLE,
    performedBy: userId,
    comment: reason,
  });

  return db('indicator_division_reports').where('id', report.id).first();
}

/**
 * Only the main division marks an indicator not applicable (D-20261013-10):
 * a contributor's N/A hid nothing and confused the owner. A division of the
 * same directorate reports as the main (D-20260710-01), so it may too.
 *
 * @param {number} planNodeId
 * @param {string} divisionCode
 * @returns {Promise<void>}
 * @throws {ForbiddenError} 403 for any other division
 */
async function assertMainDivision(planNodeId, divisionCode) {
  const node = await db('plan_nodes').where('id', planNodeId).first('responsible_division_code');
  const main = node && node.responsible_division_code;
  const { sameDivision, sameDirectorate } = require('../divisionAliasService');
  if (main && ((await sameDivision(main, divisionCode)) || (await sameDirectorate(divisionCode, main)))) return;
  throw new ForbiddenError(`Only the main division${main ? ` (${main})` : ''} can mark this indicator as not applicable.`);
}

/**
 * Get all division reports for an indicator + quarter (for MAIN dashboard).
 */
async function getAllForIndicator(planNodeId, quarter, fiscalYear) {
  return db('indicator_division_reports')
    .where({ plan_node_id: planNodeId, quarter, fiscal_year: fiscalYear })
    .orderByRaw("FIELD(role, 'OWNER', 'CONTRIB'), division_code");
}

/**
 * Get report history (timeline).
 */
async function getHistory(reportId) {
  return db('indicator_report_history as h')
    .leftJoin('users as u', 'h.performed_by', 'u.id')
    .where('h.report_id', reportId)
    .select(
      'h.id', 'h.action', 'h.from_status', 'h.to_status',
      'h.performed_at', 'h.comment',
      'u.first_name', 'u.last_name', 'u.email',
    )
    .orderBy('h.performed_at', 'asc');
}

/**
 * Internal: add a history row.
 */
async function addHistory(reportId, { action, fromStatus, toStatus, performedBy, comment }) {
  await db('indicator_report_history').insert({
    report_id: reportId,
    action,
    from_status: fromStatus,
    to_status: toStatus,
    performed_by: performedBy,
    comment: comment || null,
  });
}

const OVERRIDE_STATUSES = [STATUSES.DRAFT, STATUSES.SUBMITTED, STATUSES.IN_REVIEW, STATUSES.APPROVED, STATUSES.REJECTED];
const TERMINAL_INSTANCE_STATUSES = [STATUSES.APPROVED, STATUSES.REJECTED];
const REVIEW_TARGETS = new Set([STATUSES.SUBMITTED, STATUSES.IN_REVIEW]);

/**
 * Admin-only override: force the report to a new status, bypassing the
 * workflow engine. Used when an admin needs to reopen an approved
 * report, revoke approval, or bump a stuck DRAFT back to submitter.
 * Closes any non-terminal approval_instance on the report so the
 * workflow state cannot desync from the new status.
 *
 * @param {number} reportId
 * @param {string} newStatus one of OVERRIDE_STATUSES
 * @param {number} userId admin performing the action
 * @param {string} [comment]
 * @returns {Promise<object>} updated report row
 */
async function forceSetStatus(reportId, newStatus, userId, comment) {
  if (!OVERRIDE_STATUSES.includes(newStatus)) {
    throw Object.assign(new Error(`Invalid target status: ${newStatus}`), { status: 400 });
  }
  const report = await db('indicator_division_reports').where('id', reportId).first();
  if (!report) throw Object.assign(new Error('Report not found'), { status: 404 });
  const fromStatus = report.status;
  if (fromStatus === newStatus) {
    return report;
  }

  await db('indicator_division_reports').where('id', reportId).update({
    status: newStatus,
    rejection_reason: newStatus === STATUSES.REJECTED ? (comment || 'Admin override') : null,
  });

  // Close any live approval_instance so downstream queries don't still
  // think there's a pending step tied to this report.
  const liveInstances = await db('approval_instances')
    .where({ entity_id: reportId, entity_type: APPROVAL_ENTITIES.INDICATOR_DIVISION_REPORT })
    .whereNotIn('status', TERMINAL_INSTANCE_STATUSES);
  for (const inst of liveInstances) {
    const terminalStatus = newStatus === STATUSES.APPROVED ? STATUSES.APPROVED : STATUSES.REJECTED;
    await db('approval_instances').where('id', inst.id).update({ status: terminalStatus });
    await db('approval_steps')
      .where({ approval_instance_id: inst.id, decision: 'PENDING' })
      .update({
        decision: terminalStatus === STATUSES.APPROVED ? 'APPROVED' : 'REJECTED',
        comments: `Admin override: ${comment || 'status forced'}`,
        approver_id: userId,
        completed_date: db.fn.now(),
      });
  }

  // If the target status is one that implies an active review (SUBMITTED
  // or IN_REVIEW), we need a LIVE approval_instance with a pending step.
  // startWorkflow supersedes any prior non-APPROVED instance and creates
  // a fresh one with the first step set to PENDING — exactly what the
  // M&E reviewer expects to see in their queue.
  if (REVIEW_TARGETS.has(newStatus)) {
    const planNode = await db('plan_nodes').where('id', report.plan_node_id).first('responsible_division_code');
    const mainOrgCode = planNode?.responsible_division_code || null;
    try {
      if (report.role === ROLE_CONTRIB) {
        await startContributorWorkflow({
          entityType: APPROVAL_ENTITIES.INDICATOR_DIVISION_REPORT,
          entityId: reportId,
          submittedById: userId,
          contribOrgCode: report.division_code,
          mainOrgCode,
        });
      } else {
        await workflowEngine.startWorkflow({
          entityType: APPROVAL_ENTITIES.INDICATOR_DIVISION_REPORT,
          entityId: reportId,
          submittedById: userId,
          divisionCode: report.division_code,
        });
      }
      // startWorkflow forces status to IN_REVIEW — mirror that in our row
      // so the two sides agree.
      await db('indicator_division_reports').where('id', reportId).update({ status: STATUSES.IN_REVIEW });
    } catch (err) {
      // If no workflow template matches, fall back to the SUBMITTED flat
      // state (no approval chain, but the report is still open for edit).
      if (err?.code !== 'TEMPLATE_NOT_FOUND') throw err;
    }
  }

  await addHistory(reportId, {
    action: 'ADMIN_OVERRIDE',
    fromStatus,
    toStatus: newStatus,
    performedBy: userId,
    comment: comment || 'Admin override',
  });

  return db('indicator_division_reports').where('id', reportId).first();
}

module.exports = {
  getOrInit,
  saveDraft,
  submit,
  approve,
  reject,
  markNotApplicable,
  forceSetStatus,
  OVERRIDE_STATUSES,
  getAllForIndicator,
  getHistory,
};
