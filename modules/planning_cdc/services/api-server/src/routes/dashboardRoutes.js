const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { authenticateToken } = require('../middleware/authMiddleware');
const { ValidationError } = require('@rbm/lib/errors');
const { activityProgress } = require('../services/dashboard/activityProgress');

router.use(authenticateToken);

/**
 * @name GET /api/dashboard/activity-progress?fiscal_year&division
 * Specific activities by activity-report state (D-20261015-04). The plan is
 * readable by every signed-in user, so are these counts.
 * @returns 200 `{ success, data: { total, approved, in_review, draft, not_reported, reported_pct } }` · 400
 */
router.get('/activity-progress', asyncHandler(async (req, res) => {
  const fiscalYear = String(req.query.fiscal_year || new Date().getUTCFullYear());
  const division = req.query.division ? String(req.query.division).trim() : '';
  if (!/^\d{4}$/.test(fiscalYear) || division.length > 20) throw new ValidationError('Invalid fiscal year or business unit');
  res.json({ success: true, data: await activityProgress({ fiscalYear, division: division || undefined }) });
}));

module.exports = router;
