/**
 * /api/governance/workflow-templates — CRUD for admin-managed workflow templates
 * /api/governance/workflows         — runtime: start, decide, cancel
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/rbacMiddleware');
const asyncHandler = require('../middleware/asyncHandler');
const { STATUSES } = require('@rbm/lib/enums');
const { NotFoundError, ValidationError, ForbiddenError, ApiError } = require('@rbm/lib/errors');
const templateService = require('../services/workflowTemplateService');
const engine = require('../services/workflowEngine');
const { canDecideStep } = require('../services/approvals/approverIdentity');

router.use(authenticateToken);

// Gates driven by the dynamic rbac_permissions table (module=workflows).
const canReadWorkflows = authorize({ module: 'workflows', action: 'read' });
const canWriteWorkflows = authorize({ module: 'workflows', action: 'update' });

// ── Template CRUD (admin only) ────────────────────────────────

router.get('/workflow-templates', canReadWorkflows, asyncHandler(async (req, res) => {
  const templates = await templateService.listTemplates(req.query);
  res.json({ success: true, data: templates });
}));

router.get('/workflow-templates/:id', canReadWorkflows, asyncHandler(async (req, res) => {
  const template = await templateService.getTemplateById(parseInt(req.params.id));
  if (!template) throw new NotFoundError('Template not found');
  res.json({ success: true, data: template });
}));

router.post('/workflow-templates', canWriteWorkflows, asyncHandler(async (req, res) => {
  const { name, entity_type, steps, template_variant } = req.body || {};
  if (!name || !entity_type) {
    throw new ValidationError('name and entity_type are required');
  }
  if (template_variant !== undefined
      && !['DEFAULT', 'CONTRIBUTOR_CHAIN'].includes(template_variant)) {
    throw new ValidationError('template_variant must be DEFAULT or CONTRIBUTOR_CHAIN');
  }
  const template = await templateService.createTemplate({ ...req.body, created_by_id: req.user.id });
  if (steps && Array.isArray(steps) && steps.length) {
    await templateService.replaceSteps(template.id, steps);
  }
  const result = await templateService.getTemplateById(template.id);
  res.status(201).json({ success: true, data: result });
}));

router.put('/workflow-templates/:id', canWriteWorkflows, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const existing = await templateService.getTemplateById(id);
  if (!existing) throw new NotFoundError('Template not found');
  const updated = await templateService.updateTemplate(id, req.body);
  res.json({ success: true, data: updated });
}));

router.delete('/workflow-templates/:id', canWriteWorkflows, asyncHandler(async (req, res) => {
  await templateService.deleteTemplate(parseInt(req.params.id));
  res.json({ success: true });
}));

router.put('/workflow-templates/:id/steps', canWriteWorkflows, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const existing = await templateService.getTemplateById(id);
  if (!existing) throw new NotFoundError('Template not found');
  const { steps } = req.body || {};
  if (!Array.isArray(steps)) {
    throw new ValidationError('steps must be an array');
  }
  await templateService.replaceSteps(id, steps);
  const result = await templateService.getTemplateById(id);
  res.json({ success: true, data: result });
}));

// ── Runtime: start / decide / cancel ──────────────────────────

// Start and cancel are admin tools (D-20261108-02): the submit endpoints of
// each entity start their workflow themselves, after their own checks.
router.post('/workflows/start', canWriteWorkflows, asyncHandler(async (req, res) => {
  const { entityType, entityId, divisionCode } = req.body || {};
  if (!entityType || !entityId) {
    throw new ValidationError('entityType and entityId are required');
  }
  try {
    const result = await engine.startWorkflow({
      entityType,
      entityId: parseInt(entityId),
      submittedById: req.user.id,
      divisionCode: divisionCode || null,
      req,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    if (err.code === 'TEMPLATE_NOT_FOUND') throw new NotFoundError(err.message);
    if (err.code === 'APPROVER_NOT_RESOLVED') throw new ApiError(err.message, 422, 'APPROVER_NOT_RESOLVED');
    if (err.code === 'ENTITY_NOT_FOUND') throw new NotFoundError(err.message);
    throw err;
  }
}));

/**
 * Authorise a workflow-step decision (cleaning bug WF-2). The engine does NOT
 * re-check the approver, so every decision surface must gate here
 * (`canDecideStep`, shared with governanceRoutes PUT /steps/:id/decide).
 *
 * @param {number} stepId — approval_steps.id
 * @param {{id:number}} user — req.user
 * @returns {Promise<void>}
 * @throws {ForbiddenError} when the caller may not act on the step
 */
async function assertCanDecideStep(stepId, user) {
  if (!(await canDecideStep(user.id, stepId))) throw new ForbiddenError('You cannot act on this step');
}

router.put('/workflows/steps/:id/decide', asyncHandler(async (req, res) => {
  const stepId = parseInt(req.params.id);
  const { decision, comments } = req.body || {};
  if (!decision || ![STATUSES.APPROVED, STATUSES.REJECTED].includes(decision)) {
    throw new ValidationError('decision must be APPROVED or REJECTED');
  }
  if (decision === STATUSES.REJECTED && !comments) {
    throw new ValidationError('comments are required when rejecting');
  }
  await assertCanDecideStep(stepId, req.user);
  try {
    const result = await engine.decideWorkflowStep(stepId, decision, comments, req.user.id, req);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.code === 'STEP_NOT_FOUND') throw new NotFoundError(err.message);
    if (err.code === 'ALREADY_DECIDED') throw new ValidationError(err.message);
    if (err.code === 'UNAUTHORIZED') throw new ForbiddenError(err.message);
    throw err;
  }
}));

router.get('/workflows/:entityType/:entityId', asyncHandler(async (req, res) => {
  const result = await engine.getWorkflowForEntity(req.params.entityType, parseInt(req.params.entityId));
  if (!result) throw new NotFoundError('No workflow found for this entity');
  res.json({ success: true, data: result });
}));

router.post('/workflows/:id/cancel', canWriteWorkflows, asyncHandler(async (req, res) => {
  try {
    const result = await engine.cancelWorkflow(parseInt(req.params.id), req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.code === 'INSTANCE_NOT_FOUND') throw new NotFoundError(err.message);
    if (err.code === 'INVALID_STATE') throw new ValidationError(err.message);
    throw err;
  }
}));

module.exports = router;
