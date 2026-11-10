/**
 * Decide from the email (automation roadmap, lot 3, D-20261105-10).
 * Mounted at `/api/approvals`. The email buttons open `/decide/:stepId`,
 * which reads the step here and then calls the entity's own approve /
 * reject endpoint, so every rule and notification of that flow applies.
 */
'use strict';

const router = require('express').Router();
const asyncHandler = require('../middleware/asyncHandler');
const { authenticateToken } = require('../middleware/authMiddleware');
const { APPROVAL_STEP_DECISIONS, STATUSES } = require('@rbm/lib/enums');
const { buildSuccess, ForbiddenError, NotFoundError, ValidationError } = require('@rbm/lib/errors');
const { summarize } = require('../services/approvals/stepSummary');
const { isActingApproverOf, approvesEverything, APPROVE_MODULE } = require('../services/approvals/approverIdentity');

router.use(authenticateToken);

/**
 * One approval step: what it is about and whether the caller can decide it.
 *
 * @name GET /api/approvals/steps/:id
 * @param {express.Request} req — path `id`
 * @param {express.Response} res — 200 `{ success, data: { ...summary, can_decide, is_open } }`
 * @returns {Promise<void>}
 * @throws {ValidationError} 400 non-numeric id
 * @throws {NotFoundError} 404 unknown step
 * @throws {ForbiddenError} 403 the caller has nothing to do with this step
 * @example GET /api/approvals/steps/311
 */
router.get('/steps/:id', asyncHandler(async (req, res) => {
  const stepId = parseInt(req.params.id, 10);
  if (!stepId) throw new ValidationError('id must be a number');
  const summary = await summarize(stepId);
  if (!summary) throw new NotFoundError('Approval step not found');

  const mine = await isActingApproverOf(req.user.id, summary);
  const admin = !mine && await approvesEverything(req.user.id, summary.entity_type);
  if (!mine && !admin) throw new ForbiddenError('This approval is not yours');

  const isOpen = summary.decision === APPROVAL_STEP_DECISIONS.PENDING && summary.instance_status === STATUSES.IN_REVIEW;
  res.json(buildSuccess({ ...summary, is_open: isOpen, can_decide: isOpen && Boolean(APPROVE_MODULE[summary.entity_type]) }));
}));

module.exports = router;
