/**
 * Onboarding tour state of the caller (D-20261105-16, D-20261106-03).
 *
 * GET /api/me/tour                      → { seen_version } (null = never toured)
 * PUT /api/me/tour { version, outcome } → records the version and how the
 *   tour ended (FINISHED / SKIPPED, optional)
 */
'use strict';

const router = require('express').Router();
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticateToken } = require('../../middleware/authMiddleware');
const db = require('../../config/db');
const { buildSuccess, ValidationError } = require('@rbm/lib/errors');
const { TOUR_OUTCOMES } = require('@rbm/lib/enums');

const VERSION = /^\d{1,3}\.\d{1,3}$/;
const OUTCOMES = Object.values(TOUR_OUTCOMES);

router.get('/tour', authenticateToken, asyncHandler(async (req, res) => {
  const row = await db('users').where('id', req.user.id).first('tour_version_seen');
  res.json(buildSuccess({ seen_version: (row && row.tour_version_seen) || null }));
}));

router.put('/tour', authenticateToken, asyncHandler(async (req, res) => {
  const version = String((req.body && req.body.version) || '');
  const outcome = (req.body && req.body.outcome) || null;
  if (!VERSION.test(version)) throw new ValidationError('version must look like 1.3');
  if (outcome !== null && !OUTCOMES.includes(outcome)) throw new ValidationError(`outcome must be one of ${OUTCOMES.join(', ')}`);
  await db('users').where('id', req.user.id).update({ tour_version_seen: version, tour_outcome: outcome });
  res.json(buildSuccess({ seen_version: version }));
}));

module.exports = router;
