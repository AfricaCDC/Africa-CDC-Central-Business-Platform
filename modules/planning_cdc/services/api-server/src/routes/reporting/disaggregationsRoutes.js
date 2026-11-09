// ── Disaggregations Routes ──
//
// The catalog of indicator disaggregations (`GET /disaggregations`), read by
// the indicator form. Mounted at `/api/reporting` via the parent aggregator.
// The actual-scoped endpoints went with the legacy actuals (D-20261106-14).

const router = require('express').Router();
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticateToken } = require('../../middleware/authMiddleware');
const db = require('../../config/db');

router.use(authenticateToken);

/**
 * Catalog of indicator disaggregations grouped by category.
 * @name GET /api/reporting/disaggregations
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON `{ items, grouped }`
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/reporting/disaggregations
 */
router.get('/disaggregations', asyncHandler(async (req, res) => {
  const rows = await db('indicator_disaggregations').orderBy('category').orderBy('sort_order');
  const grouped = {};
  rows.forEach(r => {
    if (!grouped[r.category]) grouped[r.category] = [];
    grouped[r.category].push(r);
  });
  res.json({ items: rows, grouped });
}));

module.exports = router;
