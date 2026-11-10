/**
 * /api/reference — read-only suggestion lists for free-text comboboxes (H-3).
 *
 * GET /api/reference/values?type=FUNDING_SOURCE  → { success, data: string[] }
 * GET /api/reference/values?type=GRANT           → { success, data: string[] }
 *
 * Authenticated (any signed-in user). The list is curated reference rows unioned
 * with values already used on plan_nodes — see referenceService. Free text is
 * always accepted by the form, so no write endpoint is needed here.
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const asyncHandler = require('../middleware/asyncHandler');
const { ValidationError } = require('@rbm/lib/errors');
const referenceService = require('../services/referenceService');

router.use(authenticateToken);

/**
 * @name GET /api/reference/values
 * @param {express.Request} req — query: `type` ∈ REFERENCE_TYPES
 * @param {express.Response} res — 200 { success, data: string[] }
 * @throws {ValidationError} 400 when `type` is missing or unknown
 */
router.get('/values', asyncHandler(async (req, res) => {
  const { type } = req.query;
  if (!type || !referenceService.isValidType(type)) {
    throw new ValidationError('Unknown or missing reference type');
  }
  const data = await referenceService.getValues(type);
  res.json({ success: true, data });
}));

module.exports = router;
