/**
 * Global search of the top bar (D-20261106-05).
 *
 * GET /api/search?q=&fiscal_year=&limit=
 *   Plan items of the year (specific and broad activities, indicators,
 *   outcomes and impacts) by code or title, Business Units, AU member states.
 *   Any signed-in user; plan items follow the visibility of the plan lists.
 *
 * @name searchRoutes
 */
'use strict';

const router = require('express').Router();
const asyncHandler = require('../middleware/asyncHandler');
const { authenticateToken } = require('../middleware/authMiddleware');
const { buildSuccess, ValidationError } = require('@rbm/lib/errors');
const { isAdmin } = require('./plan-nodes/_helpers');
const { globalSearch } = require('../services/search/globalSearch');

const YEAR = /^\d{4}$/;
const MAX_LIMIT = 50;

function parseLimit(raw) {
  const limit = parseInt(raw || '6', 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new ValidationError(`limit must be 1 to ${MAX_LIMIT}`);
  return limit;
}

function parseQuery(query) {
  const q = String(query.q || '').trim();
  if (q.length < 2 || q.length > 100) throw new ValidationError('q must have 2 to 100 characters');
  const fiscalYear = query.fiscal_year ? String(query.fiscal_year) : null;
  if (fiscalYear && !YEAR.test(fiscalYear)) throw new ValidationError('fiscal_year must be a year, e.g. 2026');
  return { q, fiscalYear, limit: parseLimit(query.limit) };
}

router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const opts = parseQuery(req.query);
  const canSeeAll = await isAdmin(req.user);
  res.json(buildSuccess(await globalSearch({ ...opts, userId: req.user.id, canSeeAll })));
}));

module.exports = router;
