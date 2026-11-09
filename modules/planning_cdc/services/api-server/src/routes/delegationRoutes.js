/**
 * Out-of-office delegation (automation roadmap, lot 1, D-20261105-09).
 * Mounted at `/api/delegations`. A user manages their own delegation; an
 * administrator (users:update at scope all) may set one for anybody.
 */
'use strict';

const router = require('express').Router();
const asyncHandler = require('../middleware/asyncHandler');
const { authenticateToken } = require('../middleware/authMiddleware');
const rbacService = require('../services/rbacService');
const { RBAC_MODULES, RBAC_ACTIONS, RBAC_SCOPES } = require('@rbm/lib/rbac');
const { buildSuccess, ForbiddenError, ValidationError } = require('@rbm/lib/errors');
const { audit } = require('../middleware/auditLog');
const delegations = require('../services/approvals/delegationService');

router.use(authenticateToken);

async function isUserAdmin(userId) {
  const { allowed, scope } = await rbacService.checkPermission(userId, RBAC_MODULES.USERS, RBAC_ACTIONS.UPDATE)
    .catch(() => ({ allowed: false, scope: null }));
  return allowed && scope === RBAC_SCOPES.ALL;
}

// The caller, or the user an administrator acts for (`?delegator_id=` / body).
async function targetUser(req, raw) {
  const id = raw ? parseInt(raw, 10) : req.user.id;
  if (!id) throw new ValidationError('delegator_id must be a user id');
  if (id !== req.user.id && !await isUserAdmin(req.user.id)) {
    throw new ForbiddenError('Only an administrator can manage the delegation of another user');
  }
  return id;
}

/**
 * Delegations given and received that are not over yet.
 *
 * @name GET /api/delegations
 * @param {express.Request} req — query `delegator_id` (administrators)
 * @param {express.Response} res — 200 `{ success, data: { given, received } }`
 * @returns {Promise<void>}
 * @throws {ForbiddenError} 403 for another user without admin rights
 * @example GET /api/delegations
 */
router.get('/', asyncHandler(async (req, res) => {
  const userId = await targetUser(req, req.query.delegator_id);
  res.json(buildSuccess(await delegations.listFor(userId)));
}));

/**
 * Active users matching `q`, for the delegate picker.
 *
 * @name GET /api/delegations/candidates
 * @param {express.Request} req — query `q` (2 characters at least)
 * @param {express.Response} res — 200 `{ success, data: [{ id, name, email }] }`
 * @returns {Promise<void>}
 * @example GET /api/delegations/candidates?q=ama
 */
router.get('/candidates', asyncHandler(async (req, res) => {
  res.json(buildSuccess(await delegations.candidates(req.query.q)));
}));

/**
 * Create a delegation.
 *
 * @name POST /api/delegations
 * @param {express.Request} req — body `{ delegate_id, starts_on, ends_on, reason?, delegator_id? }`
 * @param {express.Response} res — 201 `{ success, data: { id } }`
 * @returns {Promise<void>}
 * @throws {ValidationError} 400 bad dates, self, inactive delegate, too long
 * @throws {ApiError} 409 DELEGATION_OVERLAP
 * @example POST /api/delegations { "delegate_id": 12, "starts_on": "2026-11-10", "ends_on": "2026-11-20" }
 */
router.post('/', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const delegatorId = await targetUser(req, body.delegator_id);
  const id = await delegations.create({
    delegatorId,
    delegateId: body.delegate_id,
    startsOn: body.starts_on,
    endsOn: body.ends_on,
    reason: body.reason,
    createdBy: req.user.id,
  });
  await audit(req, 'DELEGATION_CREATE', 'approval_delegation', id, {
    delegator_id: delegatorId, delegate_id: Number(body.delegate_id), starts_on: body.starts_on, ends_on: body.ends_on,
  });
  res.status(201).json(buildSuccess({ id }));
}));

/**
 * End a delegation.
 *
 * @name DELETE /api/delegations/:id
 * @param {express.Request} req — path `id`
 * @param {express.Response} res — 200 `{ success, data: { id } }`
 * @returns {Promise<void>}
 * @throws {NotFoundError} 404 unknown or already ended
 * @throws {ForbiddenError} 403 somebody else's delegation
 * @example DELETE /api/delegations/3
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) throw new ValidationError('id must be a number');
  await delegations.revoke(id, req.user.id, await isUserAdmin(req.user.id));
  await audit(req, 'DELEGATION_REVOKE', 'approval_delegation', id, {});
  res.json(buildSuccess({ id }));
}));

module.exports = router;
