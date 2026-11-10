/**
 * Data health (D-20261105-11).
 *
 * GET /api/admin/data-health?fiscal_year=2027
 *   Every check with a count and up to 200 rows, each row linking to the
 *   page where it is fixed. Scope: data_health:read.
 *
 * @name adminDataHealthRoutes
 */
'use strict';

const express = require('express');
const router = express.Router();
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticateToken } = require('../../middleware/authMiddleware');
const { authorize } = require('../../middleware/rbacMiddleware');
const { buildSuccess, ValidationError } = require('@rbm/lib/errors');
const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');
const { buildReport } = require('../../services/dataHealth/dataHealthReport');

const YEAR = /^\d{4}$/;

router.get('/data-health',
  authenticateToken,
  authorize({ module: RBAC_MODULES.DATA_HEALTH, action: RBAC_ACTIONS.READ }),
  asyncHandler(async (req, res) => {
    const fiscalYear = String(req.query.fiscal_year || new Date().getUTCFullYear());
    if (!YEAR.test(fiscalYear)) throw new ValidationError('fiscal_year must be a year, e.g. 2027');
    res.json(buildSuccess(await buildReport(fiscalYear)));
  }));

module.exports = router;
