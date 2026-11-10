/**
 * Monthly digest for directors (D-20261105-15).
 *
 * GET /api/digest/directorates — the directorates the caller may read.
 * GET /api/digest?directorate=DSI — the digest of one directorate.
 *
 * Readers: the directorate's Responsible Person (or their out-of-office
 * delegate), or dashboard:read at scope all.
 */
'use strict';

const router = require('express').Router();
const asyncHandler = require('../middleware/asyncHandler');
const { authenticateToken } = require('../middleware/authMiddleware');
const rbacService = require('../services/rbacService');
const { actingFor } = require('../services/approvals/approverIdentity');
const { directorates, buildDigest } = require('../services/digest/directorDigest');
const { RBAC_MODULES, RBAC_ACTIONS, RBAC_SCOPES } = require('@rbm/lib/rbac');
const { buildSuccess, ForbiddenError, NotFoundError, ValidationError } = require('@rbm/lib/errors');

router.use(authenticateToken);

/** The directorates the caller may read. */
async function readable(userId) {
  const { allowed, scope } = await rbacService.checkPermission(userId, RBAC_MODULES.DASHBOARD, RBAC_ACTIONS.READ);
  const all = await directorates();
  if (allowed && scope === RBAC_SCOPES.ALL) return all;
  const ids = new Set((await actingFor(userId)).map(Number));
  return all.filter((d) => ids.has(Number(d.responsible_user_id)));
}

const publicRow = ({ code, name }) => ({ code, name });

router.get('/directorates', asyncHandler(async (req, res) => {
  res.json(buildSuccess((await readable(req.user.id)).map(publicRow)));
}));

router.get('/', asyncHandler(async (req, res) => {
  const code = String(req.query.directorate || '').trim().toUpperCase();
  if (!code) throw new ValidationError('Choose a directorate');
  const [dir] = await directorates([code]);
  if (!dir) throw new NotFoundError('No directorate with a Responsible Person has this code');
  if (!(await readable(req.user.id)).some((d) => d.code === dir.code)) throw new ForbiddenError('This digest is for the directorate and the administrators');
  res.json(buildSuccess(await buildDigest(dir)));
}));

module.exports = router;
