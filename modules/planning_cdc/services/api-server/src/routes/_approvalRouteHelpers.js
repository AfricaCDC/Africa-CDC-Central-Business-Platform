/**
 * @module _approvalRouteHelpers
 *
 * Internal helpers shared by `contributorApprovalRoutes.js`. Keeps that
 * route file under the 200-line routes cap without duplicating the flat-
 * envelope plumbing elsewhere. Not mounted as a router itself.
 */

const { createLogger } = require('@rbm/lib/logger');
const { buildError, ERROR_CODES, HTTP_STATUS } = require('@rbm/lib/errors');
const rbacService = require('../services/rbacService');
const { isActingApproverOf } = require('../services/approvals/approverIdentity');
const { RBAC_MODULES, RBAC_ACTIONS, RBAC_SCOPES } = require('@rbm/lib/rbac');
const { STATUSES } = require('@rbm/lib/enums');

const logger = createLogger('approval-route-helpers');

/**
 * Map step_order ∈ {1,2,3} + decision → RBAC action code on the `reports` module.
 * @param {number} stepOrder
 * @param {string} decision - STATUSES.APPROVED | STATUSES.REJECTED
 * @returns {string|null}
 */
function actionForDecision(stepOrder, decision) {
  const prefix = decision === STATUSES.APPROVED ? 'APPROVE_STEP' : 'REJECT_STEP';
  return RBAC_ACTIONS[`${prefix}${stepOrder}`] || null;
}

/**
 * Zod body-parse helper. Emits a flat-envelope 422 when invalid, returns
 * parsed data when valid, returns null when invalid (caller should early-return).
 */
function parseBody(schema, req, res) {
  const result = schema.safeParse(req.body || {});
  if (!result.success) {
    const first = result.error.issues[0];
    res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY || 422).json(
      buildError(ERROR_CODES.VALIDATION_FAILED, first?.message || 'Invalid request body')
    );
    return null;
  }
  return result.data;
}

/**
 * Guard: writes 403 to `res` and returns false when the user lacks
 * reports:<actionCode>. Returns true on success.
 */
async function assertReportsPermission(userId, actionCode, res) {
  if (!actionCode) {
    res.status(HTTP_STATUS.BAD_REQUEST).json(
      buildError(ERROR_CODES.VALIDATION_FAILED, 'Unknown step order — cannot resolve permission')
    );
    return false;
  }
  const { allowed } = await rbacService.checkPermission(userId, RBAC_MODULES.REPORTS, actionCode);
  if (!allowed) {
    res.status(HTTP_STATUS.FORBIDDEN).json(
      buildError(ERROR_CODES.FORBIDDEN, `Insufficient permissions: reports:${actionCode}`)
    );
    return false;
  }
  return true;
}

/**
 * Guard for a step decision: the caller needs reports:<actionCode> AND must
 * be the step's acting approver (approver, delegate, escalation target),
 * unless that permission is at scope « all » (D-20261108-02). Writes 403 to
 * `res` and returns false otherwise.
 *
 * @param {number} userId
 * @param {{ approver_id?: number|null, escalated_to_id?: number|null }} step
 * @param {string|null} actionCode - from actionForDecision
 * @param {import('express').Response} res
 * @returns {Promise<boolean>}
 * @example if (!(await assertCanDecideContributorStep(req.user.id, step, code, res))) return undefined;
 */
async function assertCanDecideContributorStep(userId, step, actionCode, res) {
  if (!(await assertReportsPermission(userId, actionCode, res))) return false;
  const { scope } = await rbacService.checkPermission(userId, RBAC_MODULES.REPORTS, actionCode);
  if (scope === RBAC_SCOPES.ALL || await isActingApproverOf(userId, step)) return true;
  res.status(HTTP_STATUS.FORBIDDEN).json(buildError(ERROR_CODES.FORBIDDEN, 'This approval step is not yours'));
  return false;
}

const ENGINE_ERROR_STATUS = Object.freeze({
  STEP_NOT_FOUND: HTTP_STATUS.NOT_FOUND,
  INSTANCE_NOT_FOUND: HTTP_STATUS.NOT_FOUND,
  ENTITY_NOT_FOUND: HTTP_STATUS.NOT_FOUND,
  ALREADY_DECIDED: HTTP_STATUS.CONFLICT || 409,
  INVALID_STATE: HTTP_STATUS.CONFLICT || 409,
  NO_BYPASSABLE_STEP: HTTP_STATUS.CONFLICT || 409,
  UNAUTHORIZED: HTTP_STATUS.FORBIDDEN,
  UNKNOWN_ENTITY_TYPE: HTTP_STATUS.BAD_REQUEST,
  TEMPLATE_NOT_FOUND: HTTP_STATUS.NOT_FOUND,
});

/**
 * Translate a workflow-engine error into a flat-envelope HTTP response.
 * Unmapped codes are logged and bubble up as 500 INTERNAL_ERROR.
 */
function mapEngineError(err, res) {
  const status = ENGINE_ERROR_STATUS[err.code];
  if (!status) {
    logger.error({ err }, 'Unmapped workflow engine error');
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError(ERROR_CODES.INTERNAL_ERROR, 'Unexpected workflow error')
    );
  }
  const code = err.code === 'UNAUTHORIZED' ? ERROR_CODES.FORBIDDEN : err.code;
  return res.status(status).json(buildError(code, err.message));
}

/**
 * Parse + validate a URL param that must be a positive integer. On failure
 * writes a flat-envelope 400 to `res` and returns null.
 */
function parsePositiveIntParam(raw, name, res) {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) {
    res.status(HTTP_STATUS.BAD_REQUEST).json(
      buildError(ERROR_CODES.VALIDATION_FAILED, `${name} must be a positive integer`)
    );
    return null;
  }
  return n;
}

module.exports = {
  actionForDecision,
  parseBody,
  assertReportsPermission,
  assertCanDecideContributorStep,
  mapEngineError,
  parsePositiveIntParam,
};
