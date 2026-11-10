// ── Admin → API Keys (CRUD) ──
//
// SYSTEM_ADMIN / ME_OFFICER (anyone with RBAC api_keys:manage:all) can
// create / list / revoke personal access tokens used by partners and
// Excel/Power Query consumers.

'use strict';

const router = require('express').Router();
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticateToken } = require('../../middleware/authMiddleware');
const rbacService = require('../../services/rbacService');
const { audit } = require('../../middleware/auditLog');
const { RBAC_MODULES, RBAC_ACTIONS, RBAC_SCOPES } = require('@rbm/lib/rbac');
const { createKey, listKeys, revokeKey, updateKey } = require('../../services/apiKeyService');

router.use(authenticateToken);

// Keys open the public API to partners: managed by user administrators only,
// from the RBAC matrix (users:update at scope « all »), never a role name in
// the code (D-20261108-02). Every change is in the audit log.
router.use(asyncHandler(async (req, res, next) => {
  const { allowed, scope } = await rbacService.checkPermission(req.user.id, RBAC_MODULES.USERS, RBAC_ACTIONS.UPDATE)
    .catch(() => ({ allowed: false, scope: null }));
  if (allowed && scope === RBAC_SCOPES.ALL) return next();
  res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Admin access required' });
}));

/**
 * GET /api/admin/api-keys — list all keys (metadata only, never the raw secret).
 */
router.get('/', asyncHandler(async (req, res) => {
  const data = await listKeys();
  res.json({ success: true, data });
}));

/**
 * POST /api/admin/api-keys — create a new key. The raw secret is
 * returned once, in the response, and must be shown to the operator
 * immediately (it is not recoverable).
 * Body: { name, scopes?: string[], note?: string }
 */
router.post('/', asyncHandler(async (req, res) => {
  const { name, scopes, note } = req.body || {};
  if (!name) {
    res.status(400).json({ success: false, code: 'VALIDATION_FAILED', message: 'name is required' });
    return;
  }
  const key = await createKey({
    name,
    scopes: Array.isArray(scopes) ? scopes : null,
    createdBy: req.user.id,
    note,
  });
  await audit(req, 'API_KEY_CREATED', 'api_key', key.id, { name: key.name, key_prefix: key.key_prefix, scopes: scopes || null });
  res.status(201).json({
    success: true,
    data: {
      id: key.id,
      name: key.name,
      key_prefix: key.key_prefix,
      scopes: scopes || null,
      created_at: key.created_at,
      // Raw secret — client MUST show this once and not store it.
      key: key.raw,
    },
    message: 'Store this key securely — it will not be shown again.',
  });
}));

/**
 * PATCH /api/admin/api-keys/:id — update mutable metadata
 * (name / note / scopes). Body: `{ name?, note?, scopes? }`.
 */
router.patch('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ success: false, code: 'VALIDATION_FAILED', message: 'invalid id' });
    return;
  }
  const updated = await updateKey(id, {
    name: req.body?.name,
    note: req.body?.note,
    scopes: req.body?.scopes,
  });
  await audit(req, 'API_KEY_UPDATED', 'api_key', id, { name: req.body?.name, scopes: req.body?.scopes });
  // The hash never leaves the server.
  const { key_hash: _hash, ...safe } = updated || {};
  res.json({ success: true, data: safe });
}));

/**
 * DELETE /api/admin/api-keys/:id — revoke (soft-delete).
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ success: false, code: 'VALIDATION_FAILED', message: 'invalid id' });
    return;
  }
  await revokeKey(id);
  await audit(req, 'API_KEY_REVOKED', 'api_key', id, null);
  res.json({ success: true, data: { id, revoked: true } });
}));

module.exports = router;
