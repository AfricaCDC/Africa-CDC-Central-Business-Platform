// ── Quarterly Dashboard Routes ──
//
// Single GET endpoint that returns per-division quarterly reporting status.
// Mounted at `/api/reporting` via the parent aggregator.

const router = require('express').Router();
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticateToken } = require('../../middleware/authMiddleware');
const { buildSuccess } = require('@rbm/lib/errors');
const { getQuarterlyDashboard } = require('../../services/reporting/quarterlyDashboardService');

router.use(authenticateToken);

/**
 * Division-level quarterly reporting dashboard.
 *
 * @name GET /api/reporting/quarterly-dashboard
 * @param {express.Request} req — query `fiscal_year`, `quarter`
 * @param {express.Response} res — 200 JSON `{ success, data: { period, divisions, summary } }`
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/reporting/quarterly-dashboard?fiscal_year=2026&quarter=Q1
 */
router.get('/quarterly-dashboard', asyncHandler(async (req, res) => {
  const data = await getQuarterlyDashboard({
    fiscal_year: req.query.fiscal_year || null,
    quarter: req.query.quarter || null,
  });
  res.json(buildSuccess(data));
}));

module.exports = router;
