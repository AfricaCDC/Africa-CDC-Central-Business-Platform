/**
 * Activity reports — narrative + actuals for a plan_node per (fiscal_year, quarter).
 *
 * All handlers use `asyncHandler` + canonical envelope from `@rbm/lib/errors`.
 * `actual_spend` is stored as DECIMAL; we parseFloat on the way out so JS numbers
 * don't carry the string representation into the client.
 */

const express = require('express');
const router = express.Router();
const knex = require('../config/db');
const { authenticateToken } = require('../middleware/authMiddleware');
const { asyncHandler, buildSuccess, ValidationError, ForbiddenError, NotFoundError } = require('@rbm/lib/errors');
const { canEditReportByPlanNodeId } = require('../services/reportPermissions');
const activityReportsService = require('../services/reporting/activityReportsService');

router.use(authenticateToken);

/**
 * Read-side fiscal year default. MUST stay aligned with the write-side default
 * in `activityReportsService.buildReportRow` (`String(new Date().getFullYear())`):
 * a hardcoded year would make rows created without `fiscal_year` invisible to
 * the read-back endpoint below as soon as the calendar year moved on.
 */
const DEFAULT_FISCAL_YEAR = String(new Date().getFullYear());

/**
 * Return the current calendar quarter tag (e.g. `'Q2'`).
 *
 * @returns {string}
 * @example
 * currentQuarter(); // 'Q2'
 */
const currentQuarter = () => {
  const m = new Date().getMonth();
  return 'Q' + (Math.floor(m / 3) + 1);
};

const castSpend = (r) => ({ ...r, actual_spend: parseFloat(r.actual_spend) });

/**
 * List activity reports ordered by most recent, with optional filters.
 *
 * @name GET /api/activity-reports
 * @param {express.Request} req — query `plan_node_id`, `quarter`, `fiscal_year`
 * @param {express.Response} res — 200 canonical envelope with enriched rows
 * @returns {Promise<void>}
 * @example
 * GET /api/activity-reports?plan_node_id=42&quarter=Q1&fiscal_year=2026
 */
router.get('/', asyncHandler(async (req, res) => {
  const { plan_node_id, quarter, fiscal_year } = req.query;
  let q = knex('activity_reports').orderBy('updated_at', 'desc');
  if (plan_node_id) q = q.where('plan_node_id', parseInt(plan_node_id, 10));
  if (quarter) q = q.where('quarter', quarter);
  if (fiscal_year) q = q.where('fiscal_year', fiscal_year);
  const rows = await q;
  res.json(buildSuccess(rows.map(castSpend)));
}));

/**
 * Return the server-side current calendar quarter (for UI defaults).
 *
 * @name GET /api/activity-reports/_meta/current-quarter
 * @param {express.Request} req
 * @param {express.Response} res — 200 with `{ quarter: 'Q1' }`
 * @returns {void}
 * @example
 * GET /api/activity-reports/_meta/current-quarter
 */
router.get('/_meta/current-quarter', (req, res) => res.json(buildSuccess({ quarter: currentQuarter() })));

/**
 * Legacy single-row view — returns the NEWEST report for the
 * (plan_node, quarter, fiscal_year) tuple. Since D-20260818-01 an activity
 * can carry several independent reports per quarter, so this endpoint is no
 * longer exhaustive: use `/api/reporting/activity-reports/by-activity/:id`
 * for the full list.
 *
 * @name GET /api/activity-reports/:plan_node_id/:quarter
 * @param {express.Request} req — query `fiscal_year`
 * @param {express.Response} res — 200 with the newest row or null under `data`.
 * @returns {Promise<void>}
 * @example
 * GET /api/activity-reports/42/Q1?fiscal_year=2026
 */
router.get('/:plan_node_id/:quarter', asyncHandler(async (req, res) => {
  const { plan_node_id, quarter } = req.params;
  const fiscal_year = req.query.fiscal_year || DEFAULT_FISCAL_YEAR;
  const row = await knex('activity_reports')
    .where({ plan_node_id: parseInt(plan_node_id, 10), quarter, fiscal_year })
    .orderBy('created_at', 'desc')
    .first();
  res.json(buildSuccess(row || null));
}));

/**
 * D-20260415-11 — edit permission = UNION of user focal divisions.
 * Never gate on req.user.division_code (the switcher is LIST-only).
 */
async function assertCanEditActivityReport(userId, planNodeId) {
  const gate = await canEditReportByPlanNodeId({ userId, planNodeId });
  if (!gate.planNode) throw new NotFoundError('Activity plan_node not found');
  if (!gate.allowed) {
    throw new ForbiddenError('You are not focal for this activity or any of its contributing divisions');
  }
}

/**
 * Create an activity report for a plan_node + quarter.
 *
 * Multi-report model (D-20260818-01): create-only, through the shared
 * `activityReportsService` — the legacy narrative-field upsert is gone, so a
 * second POST on the same tuple yields a SECOND report instead of overwriting
 * the first. The row is always DRAFT: submission goes through
 * `POST /api/reporting/activity-reports/:id/submit`, and a `status` sent in
 * the body is ignored.
 *
 * @name POST /api/activity-reports
 * @param {express.Request} req — body with report fields (plan_node_id + quarter required).
 * @param {express.Response} res — 200 with the created row.
 * @returns {Promise<void>}
 * @throws {ValidationError} 400 when plan_node_id or quarter is missing.
 * @throws {NotFoundError} 404 when the plan_node does not exist.
 * @throws {ForbiddenError} 403 when the user is not focal for the activity.
 * @example
 * POST /api/activity-reports { plan_node_id: 42, quarter: 'Q1', narrative: '...' }
 */
router.post('/', asyncHandler(async (req, res) => {
  const data = req.body;
  if (!data.plan_node_id || !data.quarter) {
    throw new ValidationError('plan_node_id and quarter required');
  }
  await assertCanEditActivityReport(req.user?.id, data.plan_node_id);
  const row = await activityReportsService.createReport({ data, userId: req.user?.id || null });
  res.json(buildSuccess(castSpend(row)));
}));

module.exports = router;
