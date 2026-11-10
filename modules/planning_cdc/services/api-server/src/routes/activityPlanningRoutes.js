/**
 * Specific activity planning (D-20261026-01): expense categories, cost
 * lines, Decision Complexity Screening; approval trail (D-20261103-02).
 *
 * Mounted at /api/activity-planning (nginx and the Vite proxy route /api/*
 * as a whole). Reading needs a signed-in user; writing needs the right to
 * edit the specific activity (`tasks:update`, as PATCH /plan-nodes/specific-activity/:id).
 */

'use strict';

const router = require('express').Router();
const { z } = require('zod');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticateToken } = require('../middleware/authMiddleware');
const { audit } = require('../middleware/auditLog');
const db = require('../config/db');
const { NODE_TYPES, ENTITY_TYPES } = require('@rbm/lib/enums');
const { COMPLEXITY_CRITERIA } = require('@rbm/lib/complexity');
const { ForbiddenError, NotFoundError, ValidationError } = require('@rbm/lib/errors');
const { canEditSpecificActivity } = require('./plan-nodes/specificActivityAccess');
const planning = require('../services/activityPlanning');
const { getTrail } = require('../services/activityTrail');

const idParam = z.object({ id: z.coerce.number().int().positive() });
const costLinesBody = z.object({
  lines: z.array(z.object({
    expense_category_id: z.number().int().positive(),
    description: z.string().trim().min(1, 'Describe every cost line').max(255),
    amount: z.coerce.number().min(0, 'Amounts cannot be negative').max(1e12),
  })).max(200),
});
const rating = z.number().int().min(1).max(3).nullable().optional();
const screeningBody = z.object({
  requires_complex_decision: z.boolean(),
  ...Object.fromEntries(COMPLEXITY_CRITERIA.map((c) => [c.key, rating])),
});

const parse = (schema, value) => {
  const r = schema.safeParse(value);
  if (!r.success) throw new ValidationError(r.error.issues[0]?.message || 'Invalid request');
  return r.data;
};

/** The specific activity of the URL, when the user may edit it. */
async function editableActivity(req) {
  const { id } = parse(idParam, req.params);
  const row = await db('plan_nodes').where('id', id).first();
  if (!row || row.node_type !== NODE_TYPES.SPECIFIC_ACTIVITY) throw new NotFoundError('Specific activity not found');
  if (!(await canEditSpecificActivity(req.user, row)).allowed) throw new ForbiddenError('You cannot edit this specific activity');
  return row;
}

router.use(authenticateToken);

/**
 * @name GET /api/activity-planning/expense-categories
 * @returns 200 `{ success, data: [{ id, name }] }`
 */
router.get('/expense-categories', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await planning.listExpenseCategories() });
}));

/**
 * @name GET /api/activity-planning/:id
 * @returns 200 `{ success, data: { cost_lines, total, screening } }` · 404
 * @example GET /api/activity-planning/4102
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const row = await db('plan_nodes').where('id', id).first('id', 'node_type');
  if (!row || row.node_type !== NODE_TYPES.SPECIFIC_ACTIVITY) throw new NotFoundError('Specific activity not found');
  res.json({ success: true, data: await planning.getPlanning(id) });
}));

/**
 * Approval trail (D-20261103-02): same readers as the activity page.
 *
 * @name GET /api/activity-planning/:id/trail
 * @returns 200 `{ success, data: { events: [{ at, actor, label, decision, comment }], waiting_for } }` · 400 · 404
 * @example GET /api/activity-planning/4102/trail
 */
router.get('/:id/trail', asyncHandler(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const row = await db('plan_nodes').where('id', id).first('id', 'node_type', 'status', 'responsible_division_code');
  if (!row || row.node_type !== NODE_TYPES.SPECIFIC_ACTIVITY) throw new NotFoundError('Specific activity not found');
  res.json({ success: true, data: await getTrail(row) });
}));

/**
 * @name PUT /api/activity-planning/:id/cost-lines — body `{ lines: [...] }` (replaces all lines)
 * @returns 200 `{ success, data: { cost_lines, total, screening } }` · 400 · 403 · 404
 */
router.put('/:id/cost-lines', asyncHandler(async (req, res) => {
  const row = await editableActivity(req);
  const { lines } = parse(costLinesBody, req.body);
  const data = await planning.saveCostLines(row.id, lines);
  await audit(req, 'ACTIVITY_COST_LINES_UPDATED', ENTITY_TYPES.PLAN_NODE, row.id, { lines: lines.length, total: data.total });
  res.json({ success: true, data });
}));

/**
 * @name PUT /api/activity-planning/:id/screening — body `{ requires_complex_decision, <criterion>: 1|2|3 }`
 * @returns 200 `{ success, data: screening }` · 400 · 403 · 404
 */
router.put('/:id/screening', asyncHandler(async (req, res) => {
  const row = await editableActivity(req);
  const body = parse(screeningBody, req.body);
  const data = await planning.saveScreening(row.id, body, req.user.id);
  await audit(req, 'ACTIVITY_COMPLEXITY_SCREENED', ENTITY_TYPES.PLAN_NODE, row.id,
    { requires_complex_decision: data.requires_complex_decision, total_score: data.total_score, band: data.complexity_band });
  res.json({ success: true, data });
}));

module.exports = router;
