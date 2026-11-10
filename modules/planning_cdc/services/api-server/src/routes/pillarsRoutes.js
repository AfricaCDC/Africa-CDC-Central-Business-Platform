/**
 * AHSS Pillars reference list (D-20260714-03).
 *
 * GET /api/pillars — id/name/sort_order, for the frontend chips and the
 * indicator form selector. Pillars are seeded by migration (not UI-editable),
 * so the 5-minute reference cache applies (see D-20260707-02 rule: only
 * admin-EDITABLE data must revalidate).
 *
 * @name pillarsRoutes
 */
'use strict';

const router = require('express').Router();
const asyncHandler = require('../middleware/asyncHandler');
const { authenticateToken } = require('../middleware/authMiddleware');
const { buildSuccess } = require('@rbm/lib/errors');
const db = require('../config/db');

router.use(authenticateToken);

router.get('/', asyncHandler(async (_req, res) => {
  const rows = await db('pillars').orderBy('sort_order').select('id', 'name', 'sort_order');
  res.json(buildSuccess(rows));
}));

module.exports = router;
