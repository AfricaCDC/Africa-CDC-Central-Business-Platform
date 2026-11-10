/**
 * Activity → T3/T4 indicator mapping (D-20261016-04), for /pirs/mapping.
 *
 * Mounted at /api/indicator-mapping (nginx and the Vite proxy route /api/*
 * as a whole). RBAC module `indicator_mapping`: read to list; update at
 * scope `all` (M&E, admins) to change a link.
 */

'use strict';

const router = require('express').Router();
const { z } = require('zod');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticateToken } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/rbacMiddleware');
const { audit } = require('../middleware/auditLog');
const rbacService = require('../services/rbacService');
const { RBAC_MODULES, RBAC_ACTIONS, RBAC_SCOPES } = require('@rbm/lib/rbac');
const { NODE_TYPES } = require('@rbm/lib/enums');
const { ForbiddenError, ValidationError } = require('@rbm/lib/errors');
const { listMapping, setMapping } = require('../services/indicatorMapping');

const MODULE = RBAC_MODULES.INDICATOR_MAPPING;
const listQuery = z.object({
  fiscal_year: z.string().regex(/^\d{4}$/),
  node_type: z.enum([NODE_TYPES.BROAD_ACTIVITY, NODE_TYPES.SPECIFIC_ACTIVITY]),
});
const idParam = z.object({ id: z.coerce.number().int().positive() });
const linksBody = z.object({ indicator_ids: z.array(z.number().int().positive()).max(50) });

const parse = (schema, value) => {
  const r = schema.safeParse(value);
  if (!r.success) throw new ValidationError(r.error.issues[0]?.message || 'Invalid request');
  return r.data;
};

/** Changing links is institution-wide: update must be granted at scope `all`. */
const requireManage = asyncHandler(async (req, _res, next) => {
  const { allowed, scope } = await rbacService.checkPermission(req.user.id, MODULE, RBAC_ACTIONS.UPDATE);
  if (!allowed || scope !== RBAC_SCOPES.ALL) throw new ForbiddenError('Only M&E and administrators can change indicator links');
  next();
});

router.use(authenticateToken);

/**
 * @name GET /api/indicator-mapping?fiscal_year&node_type
 * @returns 200 `{ success, data: activities[] }` each with `indicator_ids` · 400 · 403
 * @example GET /api/indicator-mapping?fiscal_year=2026&node_type=BROAD_ACTIVITY
 */
router.get('/', authorize({ module: MODULE, action: RBAC_ACTIONS.READ }), asyncHandler(async (req, res) => {
  const q = parse(listQuery, req.query);
  res.json({ success: true, data: await listMapping({ fiscalYear: q.fiscal_year, nodeType: q.node_type }) });
}));

/**
 * @name PUT /api/indicator-mapping/:id — body `{ indicator_ids: number[] }` (one at most for a specific activity)
 * @returns 200 `{ success, data: { id, node_type, indicator_ids } }` · 400 · 403 · 404
 * @example PUT /api/indicator-mapping/68 { "indicator_ids": [412, 415] }
 */
router.put('/:id', requireManage, asyncHandler(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const body = parse(linksBody, req.body);
  const { before, ...result } = await setMapping({ nodeId: id, indicatorIds: body.indicator_ids });
  await audit(req, 'INDICATOR_LINKS_UPDATED', 'plan_node', id, { before, after: result.indicator_ids });
  res.json({ success: true, data: result });
}));

module.exports = router;
