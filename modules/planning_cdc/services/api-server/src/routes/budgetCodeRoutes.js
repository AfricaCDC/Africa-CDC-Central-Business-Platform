/**
 * Budget codes (SAP + internal) linked to plan_nodes (broad activities).
 *
 * Every handler uses `asyncHandler` so thrown errors flow through the canonical
 * error envelope in `@rbm/lib/errors`. Numeric fields are coerced via parseFloat
 * with a 0 default — the underlying columns are NOT NULL DECIMAL.
 */

const express = require('express');
const router = express.Router();
const knex = require('../config/db');
const { authenticateToken } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/rbacMiddleware');
const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');
const { asyncHandler, buildSuccess, ValidationError } = require('@rbm/lib/errors');
const { resolveFiscalYear } = require('../services/fiscalYearService');

router.use(authenticateToken);

// Matrix-driven write gates (D-20260818-02). Reads stay open to any
// authenticated user — only mutations are gated on the `budget` module.
const canCreateBudget = authorize({ module: RBAC_MODULES.BUDGET, action: RBAC_ACTIONS.CREATE });
const canUpdateBudget = authorize({ module: RBAC_MODULES.BUDGET, action: RBAC_ACTIONS.UPDATE });
const canDeleteBudget = authorize({ module: RBAC_MODULES.BUDGET, action: RBAC_ACTIONS.DELETE });

const castNum = (n) => (n === null || n === undefined ? null : parseFloat(n));
const enrich = (rows) => rows.map((r) => ({
  ...r,
  amount: castNum(r.amount),
  main_budget: castNum(r.main_budget),
  technical_assistance: castNum(r.technical_assistance),
  total_ips: castNum(r.total_ips),
  gap: castNum(r.gap),
}));
// `?division=A,B` keeps the codes of the broads of those Business Units (D-20261105-06).
const divisionsOf = (query) => String(query.division || '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);

/**
 * List budget_codes joined with plan_nodes + division + funding source.
 *
 * @name GET /api/budget-codes
 * @param {express.Request} req — query: `plan_node_id`, `fund_code`, `fiscal_year`, `division`
 * @param {express.Response} res — 200 with canonical `{success,data}` envelope.
 * @returns {Promise<void>}
 * @example
 * GET /api/budget-codes?fiscal_year=2026
 */
router.get('/', asyncHandler(async (req, res) => {
  const { plan_node_id, fund_code, fiscal_year } = req.query;
  const divisions = divisionsOf(req.query);
  let q = knex('budget_codes as b')
    .leftJoin('plan_nodes as p', 'b.plan_node_id', 'p.id')
    .leftJoin('division_codes as d', 'p.responsible_division_code', 'd.code')
    .leftJoin('funding_sources as f', 'b.funding_source_id', 'f.id')
    .select(
      'b.*',
      'p.code as broad_code',
      'p.title as broad_title',
      'd.division_name',
      'f.name as funding_source_name',
    )
    .orderBy('p.code')
    .orderBy('b.budget_code');
  if (plan_node_id) q = q.where('b.plan_node_id', parseInt(plan_node_id, 10));
  if (fund_code) q = q.where('b.fund_code', fund_code);
  if (fiscal_year) q = q.where('b.fiscal_year', fiscal_year);
  if (divisions.length) q = q.whereIn('p.responsible_division_code', divisions);
  const rows = await q;
  res.json(buildSuccess(enrich(rows)));
}));

/**
 * Aggregated stats for budget_codes: overall totals + breakdown by fund.
 *
 * @name GET /api/budget-codes/summary
 * @param {express.Request} req — query: `fiscal_year`, `division` (comma-separated codes)
 * @param {express.Response} res — 200 with `{ totals, by_fund }`
 * @returns {Promise<void>}
 * @example
 * GET /api/budget-codes/summary?fiscal_year=2026
 */
router.get('/summary', asyncHandler(async (req, res) => {
  const { fiscal_year } = req.query;
  const divisions = divisionsOf(req.query);
  let q = knex('budget_codes');
  if (fiscal_year) q = q.where('fiscal_year', fiscal_year);
  if (divisions.length) q = q.whereIn('budget_codes.plan_node_id', knex('plan_nodes').whereIn('responsible_division_code', divisions).select('id'));
  const totals = await q.clone()
    .select(
      knex.raw('COUNT(*) as total_codes'),
      knex.raw('COUNT(DISTINCT plan_node_id) as broads_with_budget'),
      knex.raw('SUM(amount) as total_amount'),
      knex.raw('SUM(main_budget) as total_main'),
      knex.raw('SUM(technical_assistance) as total_ta'),
      knex.raw('SUM(total_ips) as total_ips'),
      knex.raw('SUM(gap) as total_gap'),
    )
    .first();

  const byFund = await q.clone()
    .leftJoin('funding_sources', 'budget_codes.funding_source_id', 'funding_sources.id')
    .select('fund_code', 'fund_description', knex.raw('SUM(amount) as total'), knex.raw('COUNT(*) as count'))
    .whereNotNull('fund_code')
    .groupBy('fund_code', 'fund_description')
    .orderBy('total', 'desc');

  res.json(buildSuccess({
    totals: {
      total_codes: Number(totals.total_codes || 0),
      broads_with_budget: Number(totals.broads_with_budget || 0),
      total_amount: Number(totals.total_amount || 0),
      total_main: Number(totals.total_main || 0),
      total_ta: Number(totals.total_ta || 0),
      total_ips: Number(totals.total_ips || 0),
      total_gap: Number(totals.total_gap || 0),
    },
    by_fund: byFund.map((f) => ({ ...f, total: Number(f.total), count: Number(f.count) })),
  }));
}));

/**
 * Update a budget_codes row; numeric fields coerced via parseFloat.
 *
 * @name PUT /api/budget-codes/:id
 * @param {express.Request} req — path param `id`; body allows amount/main_budget/technical_assistance/total_ips/gap/fund_*\/functional_area/description
 * @param {express.Response} res — 200 with the enriched updated row.
 * @returns {Promise<void>}
 * @example
 * PUT /api/budget-codes/42 { main_budget: 50000 }
 */
const NUMERIC_FIELDS = ['amount', 'main_budget', 'technical_assistance', 'total_ips', 'gap'];
const STRING_FIELDS = ['fund_description', 'fund_code', 'functional_area', 'description'];

function buildUpdatePayload(body) {
  const update = {};
  for (const k of NUMERIC_FIELDS) {
    if (body[k] !== undefined) update[k] = parseFloat(body[k]) || 0;
  }
  for (const k of STRING_FIELDS) {
    if (body[k] !== undefined) update[k] = body[k];
  }
  return update;
}

router.put('/:id', canUpdateBudget, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await knex('budget_codes').where('id', id).update(buildUpdatePayload(req.body));
  const updated = await knex('budget_codes').where('id', id).first();
  res.json(buildSuccess(enrich([updated])[0]));
}));

/**
 * Insert a new budget_codes row tied to a plan_node; numeric defaults = 0.
 *
 * @name POST /api/budget-codes
 * @param {express.Request} req — body must include `plan_node_id`.
 * @param {express.Response} res — 200 with the enriched created row.
 * @returns {Promise<void>}
 * @throws {ValidationError} 400 when plan_node_id is missing.
 * @example
 * POST /api/budget-codes { plan_node_id: 12, amount: 10000 }
 */
function buildInsertPayload(data) {
  const row = {
    plan_node_id: parseInt(data.plan_node_id, 10),
    fiscal_year: data.fiscal_year,   // resolved by the caller (D-20260918-01)
  };
  for (const k of NUMERIC_FIELDS) row[k] = parseFloat(data[k]) || 0;
  const nullableStrings = ['budget_code', 'fund_code', 'fund_description', 'functional_area', 'description'];
  for (const k of nullableStrings) row[k] = data[k] || null;
  row.funding_source_id = data.funding_source_id || null;
  return row;
}

router.post('/', canCreateBudget, asyncHandler(async (req, res) => {
  if (!req.body.plan_node_id) throw new ValidationError('plan_node_id required');
  // The year must follow the plan being budgeted, not a literal (D-20260918-01):
  // a budget code created against a 2027 activity used to be stamped '2026'.
  const fiscal_year = await resolveFiscalYear(req.body.fiscal_year);
  const [id] = await knex('budget_codes').insert(buildInsertPayload({ ...req.body, fiscal_year }));
  const created = await knex('budget_codes').where('id', id).first();
  res.json(buildSuccess(enrich([created])[0]));
}));

/**
 * Hard-delete a budget_codes row by id.
 *
 * @name DELETE /api/budget-codes/:id
 * @param {express.Request} req — path param `id`
 * @param {express.Response} res — 200 `{success:true, data:{ok:true}}`
 * @returns {Promise<void>}
 * @example
 * DELETE /api/budget-codes/42
 */
router.delete('/:id', canDeleteBudget, asyncHandler(async (req, res) => {
  await knex('budget_codes').where('id', parseInt(req.params.id, 10)).del();
  res.json(buildSuccess({ ok: true }));
}));

module.exports = router;
