/**
 * @module contributorApprovalRoutes
 *
 * Runtime endpoints for the contributor approval chain (D-20260415-05).
 *
 * Mounted at `/api/governance/workflows` alongside the legacy `workflowRoutes.js`.
 * All responses use the canonical flat envelope `{ success, message, code }` /
 * `{ success, data }` — never the deprecated `{ error: { code, message } }`.
 *
 *   POST /workflows/steps/:stepId/approve      reports:approve_step{1,2,3}
 *   POST /workflows/steps/:stepId/reject       reports:reject_step{1,2,3}
 *   POST /workflows/:instanceId/admin-bypass   reports:approve_admin_bypass
 *   GET  /workflows/:entityType/:entityId/history  reports:read_history
 *
 * The step_order → action-code mapping is derived from the step itself so
 * the RBAC matrix stays the single source of truth (CLAUDE.md Zero Hardcoded
 * Values rule — action codes live in packages/lib/rbac.js).
 */

const express = require('express');

const db = require('../config/db');
const { authenticateToken } = require('../middleware/authMiddleware');
const asyncHandler = require('../middleware/asyncHandler');
const workflowEngine = require('../services/workflowEngine');
const contributorEngine = require('../services/contributorWorkflowEngine');
const approvalHistoryService = require('../services/approvalHistoryService');
const { buildError, buildSuccess, ERROR_CODES, HTTP_STATUS } = require('@rbm/lib/errors');
const { RBAC_ACTIONS } = require('@rbm/lib/rbac');
const { STATUSES } = require('@rbm/lib/enums');
const {
  approveStepBodySchema,
  rejectStepBodySchema,
  adminBypassBodySchema,
} = require('@rbm/schemas');
const {
  actionForDecision,
  parseBody,
  assertReportsPermission,
  assertCanDecideContributorStep,
  mapEngineError,
  parsePositiveIntParam,
} = require('./_approvalRouteHelpers');

const router = express.Router();

router.use(authenticateToken);

// ── POST /workflows/steps/:stepId/approve ────────────────────────────
router.post('/workflows/steps/:stepId/approve', asyncHandler(async (req, res) => {
  const stepId = parsePositiveIntParam(req.params.stepId, 'stepId', res);
  if (stepId === null) return undefined;

  const body = parseBody(approveStepBodySchema, req, res);
  if (!body) return undefined;

  const step = await db('approval_steps').where('id', stepId).first();
  if (!step) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      buildError(ERROR_CODES.NOT_FOUND, 'Approval step not found')
    );
  }

  const ok = await assertCanDecideContributorStep(
    req.user.id,
    step,
    actionForDecision(step.step_order, STATUSES.APPROVED),
    res
  );
  if (!ok) return undefined;

  try {
    const result = await workflowEngine.decideWorkflowStep(
      stepId, STATUSES.APPROVED, body.comments || null, req.user.id, req
    );
    return res.json(buildSuccess(result));
  } catch (err) {
    return mapEngineError(err, res);
  }
}));

// ── POST /workflows/steps/:stepId/reject ─────────────────────────────
router.post('/workflows/steps/:stepId/reject', asyncHandler(async (req, res) => {
  const stepId = parsePositiveIntParam(req.params.stepId, 'stepId', res);
  if (stepId === null) return undefined;

  const body = parseBody(rejectStepBodySchema, req, res);
  if (!body) return undefined;

  const step = await db('approval_steps').where('id', stepId).first();
  if (!step) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      buildError(ERROR_CODES.NOT_FOUND, 'Approval step not found')
    );
  }

  const ok = await assertCanDecideContributorStep(
    req.user.id,
    step,
    actionForDecision(step.step_order, STATUSES.REJECTED),
    res
  );
  if (!ok) return undefined;

  try {
    const result = await workflowEngine.decideWorkflowStep(
      stepId, STATUSES.REJECTED, body.comments, req.user.id, req
    );
    return res.json(buildSuccess(result));
  } catch (err) {
    return mapEngineError(err, res);
  }
}));

// ── POST /workflows/:instanceId/admin-bypass ─────────────────────────
router.post('/workflows/:instanceId/admin-bypass', asyncHandler(async (req, res) => {
  const instanceId = parsePositiveIntParam(req.params.instanceId, 'instanceId', res);
  if (instanceId === null) return undefined;

  const body = parseBody(adminBypassBodySchema, req, res);
  if (!body) return undefined;

  const ok = await assertReportsPermission(req.user.id, RBAC_ACTIONS.APPROVE_ADMIN_BYPASS, res);
  if (!ok) return undefined;

  try {
    const result = await contributorEngine.adminBypassInstance({
      instanceId,
      adminUserId: req.user.id,
      comments: body.comments,
      bypassAll: !!body.bypassAll,
      req,
    });
    return res.json(buildSuccess(result));
  } catch (err) {
    return mapEngineError(err, res);
  }
}));

// ── GET /workflows/:entityType/:entityId/history ─────────────────────
router.get('/workflows/:entityType/:entityId/history', asyncHandler(async (req, res) => {
  const entityId = parsePositiveIntParam(req.params.entityId, 'entityId', res);
  if (entityId === null) return undefined;

  const ok = await assertReportsPermission(req.user.id, RBAC_ACTIONS.READ_HISTORY, res);
  if (!ok) return undefined;

  const history = await approvalHistoryService.getApprovalHistoryForEntity(
    req.params.entityType,
    entityId
  );
  return res.json(buildSuccess(history));
}));

module.exports = router;
