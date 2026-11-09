/* eslint-disable max-lines, complexity, no-restricted-syntax --
 * Extracted from planNodeRoutes.js (task #29). Pre-existing legacy debt
 * carried verbatim — 7 routes with heavy validation + RBAC + workflow:
 *   · max-lines: ~520 L (create + update + submit + approve + reject +
 *     delete + cancel — approval workflow breadth, not depth).
 *   · complexity: update (PATCH) = 22, create (POST) = 14 — validation
 *     branches + RBAC scope checks + state transitions.
 *   · max-depth: nested try/catch inside submit (workflow engine fallback).
 *   · no-restricted-syntax: P-31 for 'SPECIFIC_ACTIVITY' / 'BROAD_ACTIVITY'
 *     (plan_nodes.node_type column enum, NOT ENTITY_TYPES).
 * Pragma is a ceiling — do NOT grow the file or add new violations.
 */

// ── Plan-Nodes · Specific Activity Approval Workflow Routes ──
//
// Extracted from `services/api-server/src/routes/planNodeRoutes.js` as
// part of the task #29 split. Seven endpoints covering the full
// SPECIFIC_ACTIVITY CRUD + approval lifecycle:
//   POST   /specific-activity           — create
//   PATCH  /specific-activity/:id       — update
//   POST   /specific-activity/:id/submit  — focal submits for review
//   POST   /specific-activity/:id/approve — HOD approves
//   POST   /specific-activity/:id/reject  — HOD rejects
//   DELETE /specific-activity/:id       — hard-delete (DRAFT or admin)
//   POST   /specific-activity/:id/cancel  — cancel (soft or hard)
//
// Mounted at `/api/plan-nodes` via the parent aggregator — URL paths
// identical to pre-split.

const router = require('express').Router();
const { authenticateToken } = require('../../middleware/authMiddleware');
const { emitEvent } = require('../../services/eventBusService');
const { audit } = require('../../middleware/auditLog');
const {
  knex,
  log,
  STATUSES,
  invalidChoice,
  enrichNode,
  isAdmin,
  isFocalFor,
  isHodFor,
  pickEditableFields,
  missingRequiredActivityFields,
  invalidProvidedActivityFields,
  nextSpecificActivityCode,
  envelopeError,
} = require('./_helpers');
const { isActivityFocal, isEligibleFocal } = require('./activityFocal');
const { canEditSpecificActivity } = require('./specificActivityAccess');
const { hasScreening } = require('../../services/activityPlanning');
const { canActOnPendingStep } = require('../../services/approvals/approverIdentity');

router.use(authenticateToken);

// POST /plan-nodes/specific-activity — create a new specific activity.
/**
 * Create a SPECIFIC_ACTIVITY under a BROAD_ACTIVITY parent. Focal persons create DRAFT rows; admins create APPROVED rows directly.
 *
 * @name POST /api/plan-nodes/specific-activity
 * @param {express.Request} req — body accepts whitelisted `EDITABLE_FIELDS` (title + parent_id required)
 * @param {express.Response} res — 201 JSON with the created enriched node, 400 on validation, 403 when not focal for the division
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example
 * POST /api/plan-nodes/specific-activity { title, parent_id, responsible_division_code }
 */
router.post('/specific-activity', async (req, res) => {
  try {
    const fields = pickEditableFields(req.body || {});
    if (!fields.title || !fields.title.trim()) {
      return envelopeError(res, 400, 'title is required');
    }
    if (!fields.parent_id) {
      return envelopeError(res, 400, 'parent_id (broad activity) is required');
    }
    const badChoice = invalidChoice(fields);
    if (badChoice) return envelopeError(res, 400, badChoice);

    const parent = await knex('plan_nodes').where('id', fields.parent_id).first();
    if (!parent || parent.node_type !== 'BROAD_ACTIVITY') {
      return envelopeError(res, 400, 'parent_id must reference a BROAD_ACTIVITY');
    }

    const divCode = fields.responsible_division_code || parent.responsible_division_code;
    if (!divCode) {
      return envelopeError(res, 400, 'responsible_division_code is required');
    }

    const rbacService = require('../../services/rbacService');
    const { scopeCoversDivision } = require('../../services/divisionAliasService');
    const permCheck = await rbacService.checkPermission(req.user.id, 'tasks', 'create');
    let allowed = false;
    if (permCheck.allowed) {
      if (permCheck.scope === 'own') {
        allowed = await isFocalFor(req.user.id, divCode);
      } else {
        allowed = await scopeCoversDivision(req.user, permCheck.scope, divCode);
      }
    }
    if (!allowed) {
      return envelopeError(res, 403, 'No permission to create a specific activity in this division (tasks:create)');
    }

    // H-5: a specific activity must be complete on creation — type, RCC,
    // budgeting arrangement, funding source, grant name and a real cost.
    const missing = missingRequiredActivityFields(fields);
    if (missing.length) {
      return envelopeError(res, 422, `Missing required field(s): ${missing.join(', ')}`);
    }

    if (fields.focal_user_id != null) {
      const eligible = await isEligibleFocal(Number(fields.focal_user_id), divCode);
      if (!eligible) {
        return envelopeError(res, 422, 'focal person must be an active staff member of the responsible division');
      }
    }

    const code = await nextSpecificActivityCode(parent);

    const now = new Date();
    const [newId] = await knex('plan_nodes').insert({
      node_type: 'SPECIFIC_ACTIVITY',
      code,
      title: fields.title.trim(),
      parent_id: fields.parent_id,
      responsible_division_code: divCode,
      // Already JSON-serialised (or null) by pickEditableFields.
      contributing_divisions: fields.contributing_divisions || null,
      linked_indicator_id: fields.linked_indicator_id || null,
      indicator_code: fields.indicator_code || null,
      activity_type: fields.activity_type || null,
      risk_level: fields.risk_level || null,
      implementation_at_rcc: fields.implementation_at_rcc ?? null,
      secondary_division_codes: fields.secondary_division_codes || null,
      description: fields.description || null,
      budgeting_arrangement: fields.budgeting_arrangement || null,
      primary_funding_source: fields.primary_funding_source || null,
      other_funding_source: fields.other_funding_source || null,
      grant_name: fields.grant_name || null,
      location: fields.location || null,
      is_operational: fields.is_operational ?? null,
      start_date: fields.start_date || null,
      end_date: fields.end_date || null,
      budget_main: fields.budget_main || 0,
      budget_pass_through: fields.budget_pass_through || 0,
      budget_tech_assistance: fields.budget_tech_assistance || 0,
      budget_special_projects: fields.budget_special_projects || 0,
      budget_total_2026: fields.budget_total_2026 || 0,
      budget_2027: fields.budget_2027 || 0,
      budget_2028: fields.budget_2028 || 0,
      q1_budget: fields.q1_budget || 0,
      q2_budget: fields.q2_budget || 0,
      q3_budget: fields.q3_budget || 0,
      q4_budget: fields.q4_budget || 0,
      fiscal_year: fields.fiscal_year || String(new Date().getFullYear()),
      sort_order: fields.sort_order || 0,
      is_active: 1,
      status: permCheck.scope === 'all' ? STATUSES.APPROVED : STATUSES.DRAFT,
      focal_user_id: fields.focal_user_id != null ? Number(fields.focal_user_id) : null,
      created_by_user_id: req.user.id,
      created_at: now,
      updated_at: now,
    });

    await audit(req, 'SPECIFIC_ACTIVITY_CREATE', 'plan_node', newId, { admin_bypass: permCheck.scope === 'all' });

    const created = await enrichNode(await knex('plan_nodes').where('id', newId).first());
    res.status(201).json(created);
  } catch (err) {
    log.error('plan_nodes.specific_activity_create_failed', { err: err.message });
    envelopeError(res, 500, err.message);
  }
});

// PATCH /plan-nodes/specific-activity/:id — update a specific activity.
/**
 * Update a SPECIFIC_ACTIVITY. Focal editing an APPROVED row bumps it back to IN_REVIEW; HOD can edit in-flight IN_REVIEW rows; admin bypasses all checks.
 *
 * @name PATCH /api/plan-nodes/specific-activity/:id
 * @param {express.Request} req — path param `id`; body accepts whitelisted `EDITABLE_FIELDS`
 * @param {express.Response} res — 200 JSON with the updated enriched node, 403 when not allowed in current status, 404 when not found
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example
 * PATCH /api/plan-nodes/specific-activity/42 { title: 'Updated' }
 */
router.patch('/specific-activity/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return envelopeError(res, 400, 'invalid id');

    const row = await knex('plan_nodes').where('id', id).first();
    if (!row || row.node_type !== 'SPECIFIC_ACTIVITY') {
      return envelopeError(res, 404, 'specific activity not found');
    }

    const { allowed, admin } = await canEditSpecificActivity(req.user, row);
    if (!allowed) {
      return envelopeError(res, 403, 'No permission to edit this specific activity (tasks:update)');
    }
    const isOwner = row.created_by_user_id === req.user.id;
    const actFocal = isActivityFocal(req.user.id, row);
    const focalHere = await isFocalFor(req.user.id, row.responsible_division_code);

    const fields = pickEditableFields(req.body || {});
    const badChoice = invalidChoice(fields);
    if (badChoice) return envelopeError(res, 400, badChoice);

    // H-5: PATCH is partial, but a required field that IS sent may not be
    // blanked out on an existing activity (mirror of the create-time rule).
    const invalid = invalidProvidedActivityFields(fields);
    if (invalid.length) {
      return envelopeError(res, 422, `Required field(s) cannot be empty: ${invalid.join(', ')}`);
    }

    // Activity focal eligibility — covers both a newly sent focal_user_id and
    // a division change that would leave the current focal outside the new
    // main division (server-side backstop; the form clears the picker).
    const targetDiv = fields.responsible_division_code !== undefined
      ? fields.responsible_division_code
      : row.responsible_division_code;
    const targetFocal = fields.focal_user_id !== undefined
      ? (fields.focal_user_id != null ? Number(fields.focal_user_id) : null)
      : row.focal_user_id;
    const divisionWillChange = fields.responsible_division_code !== undefined
      && fields.responsible_division_code !== row.responsible_division_code;
    if (targetFocal != null && (fields.focal_user_id !== undefined || divisionWillChange)) {
      const eligible = await isEligibleFocal(targetFocal, targetDiv);
      if (!eligible) {
        return envelopeError(res, 422, 'focal person must be an active staff member of the responsible division');
      }
    }
    if (fields.focal_user_id !== undefined) {
      fields.focal_user_id = fields.focal_user_id != null ? Number(fields.focal_user_id) : null;
    }

    const update = { ...fields, updated_at: new Date() };

    const willBumpToReview = !admin && ((isOwner && focalHere) || actFocal) &&
      row.status === STATUSES.APPROVED;
    if (willBumpToReview) {
      update.status = STATUSES.IN_REVIEW;
      update.submitted_at = new Date();
      update.reviewed_by_user_id = null;
      update.reviewed_at = null;
      update.rejection_reason = null;
    }

    await knex('plan_nodes').where('id', id).update(update);

    // Auto-bump restarts the approval chain: startWorkflow supersedes any
    // prior non-approved instance itself (engine step 0), so the review
    // queue and timeline stay truthful. Degraded (template off) keeps the
    // direct bump already applied above (D-20260817-02).
    if (willBumpToReview) {
      try {
        const { startWorkflow } = require('../../services/workflowEngine');
        await startWorkflow({
          entityType: 'PLAN_NODE', entityId: id, submittedById: req.user.id,
          divisionCode: fields.responsible_division_code || row.responsible_division_code,
          req,
        });
      } catch (wfErr) {
        if (wfErr.code !== 'TEMPLATE_NOT_FOUND' && wfErr.code !== 'APPROVER_NOT_RESOLVED') throw wfErr;
        log.warn('plan_nodes.bump_degraded', { id, code: wfErr.code });
      }
    }

    // Division reassignment voids prior Not-Applicable verdicts: "N/A" means
    // "not applicable to OUR division" and dies with the ownership change —
    // otherwise the NEW division finds the Report button blocked by the old
    // division's verdict (D-20260710-02).
    const divisionChanged = fields.responsible_division_code !== undefined
      && fields.responsible_division_code !== row.responsible_division_code;
    if (divisionChanged) {
      await knex('activity_reports')
        .where({ plan_node_id: id, status: STATUSES.NOT_APPLICABLE })
        .del();
    }

    await audit(req, 'SPECIFIC_ACTIVITY_UPDATE', 'plan_node', id, {
      bumped_to_review: !!willBumpToReview,
      na_reports_voided: !!divisionChanged,
    });

    const updated = await enrichNode(await knex('plan_nodes').where('id', id).first());
    res.json(updated);

    if (admin && row.responsible_division_code) {
      const adminName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || req.user.email;
      await emitEvent({
        eventKey: 'plan_node.edited',
        entity: { ...row, ...updated },
        actor: req.user,
        metadata: {
          template_key: 'activity-updated',
          subject: `Specific Activity Modified — ${row.code}`,
          activityName: row.title,
          activityCode: row.code,
          previousStatus: row.status,
          newStatus: updated.status || row.status,
          updatedBy: adminName,
          projectName: 'RBM Platform',
        },
        knex,
      });
    }
  } catch (err) {
    log.error('plan_nodes.specific_activity_update_failed', { err: err.message, id: req.params.id });
    envelopeError(res, 500, err.message);
  }
});

// POST /plan-nodes/specific-activity/:id/submit — focal submits for review.
/**
 * Focal creator transitions a SPECIFIC_ACTIVITY from DRAFT/REJECTED to IN_REVIEW and clears previous review metadata.
 *
 * @name POST /api/plan-nodes/specific-activity/:id/submit
 * @param {express.Request} req — path param `id` is the numeric plan_node id
 * @param {express.Response} res — 200 JSON with the updated enriched node, 403 when not creator/admin, 400 on invalid status transition
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example
 * POST /api/plan-nodes/specific-activity/42/submit
 */
router.post('/specific-activity/:id/submit', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return envelopeError(res, 400, 'invalid id');

    const row = await knex('plan_nodes').where('id', id).first();
    if (!row || row.node_type !== 'SPECIFIC_ACTIVITY') {
      return envelopeError(res, 404, 'specific activity not found');
    }
    if (row.created_by_user_id !== req.user.id
        && !isActivityFocal(req.user.id, row)
        && !await isAdmin(req.user)) {
      return envelopeError(res, 403, 'only the creator or the activity focal person can submit this activity');
    }
    if (![STATUSES.DRAFT, STATUSES.REJECTED].includes(row.status)) {
      return envelopeError(res, 400, `cannot submit from status ${row.status}`);
    }
    if (!row.focal_user_id) {
      return envelopeError(res, 422, 'a focal person is required before submitting');
    }
    if (!await hasScreening(id)) {
      return envelopeError(res, 422, 'answer the Decision Complexity Screening question before submitting');
    }

    // Template-driven submit (D-20260817-02, supersedes D-20260530-02):
    // the engine materialises the approval chain from the active PLAN_NODE
    // template. When the template is toggled off we degrade to the direct
    // IN_REVIEW transition so submission never breaks.
    const { startWorkflow } = require('../../services/workflowEngine');
    let engineStarted = false;
    try {
      await startWorkflow({
        entityType: 'PLAN_NODE',
        entityId: id,
        submittedById: req.user.id,
        divisionCode: row.responsible_division_code,
        req,
      });
      engineStarted = true;
    } catch (wfErr) {
      if (wfErr.code === 'APPROVER_NOT_RESOLVED') {
        return envelopeError(res, 422, wfErr.message);
      }
      if (wfErr.code !== 'TEMPLATE_NOT_FOUND') throw wfErr;
      log.warn('plan_nodes.submit_degraded_no_template', { id });
    }
    // The engine only stamps status+updated_at for PLAN_NODE — complete the
    // plan_nodes-specific submit columns (or perform the whole transition
    // in degraded mode).
    await knex('plan_nodes').where('id', id).update({
      ...(engineStarted ? {} : { status: STATUSES.IN_REVIEW }),
      submitted_at: new Date(),
      updated_at: new Date(),
      reviewed_by_user_id: null,
      reviewed_at: null,
      rejection_reason: null,
    });
    await audit(req, 'SPECIFIC_ACTIVITY_SUBMIT', 'plan_node', id, { engine: engineStarted });

    const updated = await enrichNode(await knex('plan_nodes').where('id', id).first());
    res.json(updated);
  } catch (err) {
    log.error('plan_nodes.specific_activity_submit_failed', { err: err.message, id: req.params.id });
    envelopeError(res, 500, err.message);
  }
});

// POST /plan-nodes/specific-activity/:id/approve — HOD approves.
/**
 * HOD (or admin) approves an IN_REVIEW SPECIFIC_ACTIVITY, moving it to APPROVED.
 *
 * @name POST /api/plan-nodes/specific-activity/:id/approve
 * @param {express.Request} req — path param `id` is the numeric plan_node id
 * @param {express.Response} res — 200 JSON with the updated enriched node, 403 when not HOD/admin, 400 on invalid status transition
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example
 * POST /api/plan-nodes/specific-activity/42/approve
 */
router.post('/specific-activity/:id/approve', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return envelopeError(res, 400, 'invalid id');

    const row = await knex('plan_nodes').where('id', id).first();
    if (!row || row.node_type !== 'SPECIFIC_ACTIVITY') {
      return envelopeError(res, 404, 'specific activity not found');
    }

    const rbacService = require('../../services/rbacService');
    const { scopeCoversDivision } = require('../../services/divisionAliasService');
    const permCheck = await rbacService.checkPermission(req.user.id, 'tasks', 'approve');
    const hodHere = await isHodFor(req.user.id, row.responsible_division_code);
    let allowed = false;
    if (permCheck.allowed) {
      allowed = await scopeCoversDivision(req.user, permCheck.scope, row.responsible_division_code);
    }
    if (!allowed && hodHere) allowed = true;
    // Delegate of the approver, or Responsible Person the step was escalated to (D-20261105-09).
    if (!allowed) allowed = await canActOnPendingStep(req.user.id, 'PLAN_NODE', id);
    if (!allowed) {
      return envelopeError(res, 403, 'No permission to approve this specific activity (tasks:approve)');
    }
    if (row.status !== STATUSES.IN_REVIEW) {
      return envelopeError(res, 400, `cannot approve from status ${row.status}`);
    }

    // Engine-first (D-20260817-02): decide the pending template step. The
    // route gate above already proved HOD-of-division or admin scope, so
    // allowUnassigned lets them act on any pending step. Fallback to the
    // direct transition when no instance exists (template toggled off).
    const { decideEntityStep } = require('../../services/workflowDecisions');
    const { handled } = await decideEntityStep({
      entityType: 'PLAN_NODE', entityId: id, decision: STATUSES.APPROVED,
      userId: req.user.id, comment: null, allowUnassigned: true, req,
    });
    if (!handled) {
      await knex('plan_nodes').where('id', id).update({
        status: STATUSES.APPROVED,
        reviewed_by_user_id: req.user.id,
        reviewed_at: new Date(),
        rejection_reason: null,
        updated_at: new Date(),
      });
    }
    await audit(req, 'SPECIFIC_ACTIVITY_APPROVE', 'plan_node', id, { engine: handled });

    const updated = await enrichNode(await knex('plan_nodes').where('id', id).first());
    res.json(updated);
  } catch (err) {
    log.error('plan_nodes.specific_activity_approve_failed', { err: err.message, id: req.params.id });
    envelopeError(res, 500, err.message);
  }
});

// POST /plan-nodes/specific-activity/:id/reject — HOD rejects with reason.
/**
 * HOD (or admin) rejects an IN_REVIEW SPECIFIC_ACTIVITY with a required `rejection_reason`, moving it to REJECTED.
 *
 * @name POST /api/plan-nodes/specific-activity/:id/reject
 * @param {express.Request} req — path param `id`; body must include `rejection_reason`
 * @param {express.Response} res — 200 JSON with the updated enriched node, 403 when not HOD/admin, 400 on missing reason or invalid status
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example
 * POST /api/plan-nodes/specific-activity/42/reject { rejection_reason: 'budget too high' }
 */
router.post('/specific-activity/:id/reject', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return envelopeError(res, 400, 'invalid id');

    const reason = (req.body && req.body.rejection_reason ? String(req.body.rejection_reason) : '').trim();
    if (!reason) {
      return envelopeError(res, 400, 'rejection_reason is required');
    }

    const row = await knex('plan_nodes').where('id', id).first();
    if (!row || row.node_type !== 'SPECIFIC_ACTIVITY') {
      return envelopeError(res, 404, 'specific activity not found');
    }

    const rbacService = require('../../services/rbacService');
    const { scopeCoversDivision } = require('../../services/divisionAliasService');
    const permCheck = await rbacService.checkPermission(req.user.id, 'tasks', 'reject');
    const hodHere = await isHodFor(req.user.id, row.responsible_division_code);
    let allowed = false;
    if (permCheck.allowed) {
      allowed = await scopeCoversDivision(req.user, permCheck.scope, row.responsible_division_code);
    }
    if (!allowed && hodHere) allowed = true;
    // Delegate of the approver, or Responsible Person the step was escalated to (D-20261105-09).
    if (!allowed) allowed = await canActOnPendingStep(req.user.id, 'PLAN_NODE', id);
    if (!allowed) {
      return envelopeError(res, 403, 'No permission to reject this specific activity (tasks:reject)');
    }
    if (row.status !== STATUSES.IN_REVIEW) {
      return envelopeError(res, 400, `cannot reject from status ${row.status}`);
    }

    // Engine-first (D-20260817-02) — mirror of the approve path; the engine
    // stamps rejection_reason/reviewed_by via its plan_nodes decision spread.
    const { decideEntityStep } = require('../../services/workflowDecisions');
    const { handled } = await decideEntityStep({
      entityType: 'PLAN_NODE', entityId: id, decision: STATUSES.REJECTED,
      userId: req.user.id, comment: reason, allowUnassigned: true, req,
    });
    if (!handled) {
      await knex('plan_nodes').where('id', id).update({
        status: STATUSES.REJECTED,
        reviewed_by_user_id: req.user.id,
        reviewed_at: new Date(),
        rejection_reason: reason,
        updated_at: new Date(),
      });
    }
    await audit(req, 'SPECIFIC_ACTIVITY_REJECT', 'plan_node', id, { reason, engine: handled });

    const updated = await enrichNode(await knex('plan_nodes').where('id', id).first());
    res.json(updated);
  } catch (err) {
    log.error('plan_nodes.specific_activity_reject_failed', { err: err.message, id: req.params.id });
    envelopeError(res, 500, err.message);
  }
});

// DELETE /plan-nodes/specific-activity/:id
/**
 * Hard-delete a SPECIFIC_ACTIVITY. Restricted to the creator while status is DRAFT, or admin in any state.
 *
 * @name DELETE /api/plan-nodes/specific-activity/:id
 * @param {express.Request} req — path param `id` is the numeric plan_node id
 * @param {express.Response} res — 200 `{ success: true }`, 403 when not creator/admin, 400 when not DRAFT for focal, 404 when not found
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example
 * DELETE /api/plan-nodes/specific-activity/42
 */
router.delete('/specific-activity/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return envelopeError(res, 400, 'invalid id');

    const row = await knex('plan_nodes').where('id', id).first();
    if (!row || row.node_type !== 'SPECIFIC_ACTIVITY') {
      return envelopeError(res, 404, 'specific activity not found');
    }

    const rbacService = require('../../services/rbacService');
    const { scopeCoversDivision } = require('../../services/divisionAliasService');
    const permCheck = await rbacService.checkPermission(req.user.id, 'tasks', 'delete');
    const isOwner = row.created_by_user_id === req.user.id;

    let allowed = false;
    if (permCheck.allowed) {
      if (permCheck.scope === 'own') {
        allowed = (isOwner || isActivityFocal(req.user.id, row)) && row.status === STATUSES.DRAFT;
      } else {
        allowed = await scopeCoversDivision(req.user, permCheck.scope, row.responsible_division_code);
      }
    }

    if (!allowed) {
      return envelopeError(res, 403, `No permission to delete this specific activity (tasks:delete)`);
    }

    const admin = permCheck.scope === 'all';

    if (row.responsible_division_code && admin) {
      const adminName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || req.user.email;
      await emitEvent({
        eventKey: 'plan_node.deleted',
        entity: row,
        actor: req.user,
        metadata: {
          template_key: 'activity-updated',
          subject: `Specific Activity Deleted — ${row.code}`,
          activityName: row.title,
          activityCode: row.code,
          previousStatus: row.status,
          newStatus: 'DELETED',
          updatedBy: adminName,
          projectName: 'RBM Platform',
        },
        knex,
      });
    }

    // Close any open approval chain before the row disappears (D-20260817-02).
    await require('../../services/workflowDecisions').closeOpenInstance('PLAN_NODE', id);
    await knex('plan_nodes').where('id', id).delete();
    await audit(req, 'SPECIFIC_ACTIVITY_DELETE', 'plan_node', id, { admin_bypass: admin });
    res.json({ success: true });
  } catch (err) {
    log.error('plan_nodes.specific_activity_delete_failed', { err: err.message, id: req.params.id });
    envelopeError(res, 500, err.message);
  }
});

// POST /plan-nodes/specific-activity/:id/cancel
/**
 * Cancel a SPECIFIC_ACTIVITY. DRAFT rows are hard-deleted; any other status is flipped to CANCELLED so the row stays in place for audit but disappears from public lists.
 *
 * @name POST /api/plan-nodes/specific-activity/:id/cancel
 * @param {express.Request} req — path param `id` is the numeric plan_node id
 * @param {express.Response} res — 200 JSON (deleted flag or updated enriched node), 403 when not creator/admin, 400 when already CANCELLED
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example
 * POST /api/plan-nodes/specific-activity/42/cancel
 */
router.post('/specific-activity/:id/cancel', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return envelopeError(res, 400, 'invalid id');

    const row = await knex('plan_nodes').where('id', id).first();
    if (!row || row.node_type !== 'SPECIFIC_ACTIVITY') {
      return envelopeError(res, 404, 'specific activity not found');
    }

    const admin = await isAdmin(req.user);
    if (!admin && row.created_by_user_id !== req.user.id && !isActivityFocal(req.user.id, row)) {
      return envelopeError(res, 403, 'only the creator or the activity focal person can cancel this activity');
    }
    if (row.status === STATUSES.CANCELLED) {
      return envelopeError(res, 400, 'activity is already cancelled');
    }

    // Close any open approval chain so no orphan lingers in reviewer
    // inboxes (D-20260817-02).
    await require('../../services/workflowDecisions').closeOpenInstance('PLAN_NODE', id);

    if (row.status === STATUSES.DRAFT) {
      await knex('plan_nodes').where('id', id).delete();
      await audit(req, 'SPECIFIC_ACTIVITY_CANCEL', 'plan_node', id, { from: STATUSES.DRAFT, deleted: true });
      return res.json({ success: true, deleted: true });
    }

    await knex('plan_nodes').where('id', id).update({
      status: STATUSES.CANCELLED,
      updated_at: new Date(),
    });
    await audit(req, 'SPECIFIC_ACTIVITY_CANCEL', 'plan_node', id, { from: row.status });
    const updated = await enrichNode(await knex('plan_nodes').where('id', id).first());
    res.json(updated);
  } catch (err) {
    log.error('plan_nodes.specific_activity_cancel_failed', { err: err.message, id: req.params.id });
    envelopeError(res, 500, err.message);
  }
});

module.exports = router;
