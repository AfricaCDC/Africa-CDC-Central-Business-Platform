/**
 * Activity reports behind a quarterly indicator report (D-20261105-12).
 *
 * GET /api/reporting/indicator-division-reports/:planNodeId/activity-evidence
 *   ?quarter=Q4&fiscal_year=2026&division_code=EPR
 *   The approved activity reports of the quarter that feed the indicator
 *   for that unit. Scope: quarterly_report:read covering the unit.
 */
'use strict';

const router = require('express').Router();
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticateToken } = require('../../middleware/authMiddleware');
const rbacService = require('../../services/rbacService');
const { scopeCoversDivision } = require('../../services/divisionAliasService');
const { activityEvidence } = require('../../services/reporting/indicatorActivityEvidence');
const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');
const { buildSuccess, ForbiddenError, ValidationError } = require('@rbm/lib/errors');

const QUARTER = /^Q[1-4]$/;
const YEAR = /^\d{4}$/;

function parseQuery(req) {
  const indicatorId = parseInt(req.params.planNodeId, 10);
  const quarter = String(req.query.quarter || '');
  const fiscalYear = String(req.query.fiscal_year || '');
  const divisionCode = String(req.query.division_code || '').trim().toUpperCase();
  if (!indicatorId || !QUARTER.test(quarter) || !YEAR.test(fiscalYear) || !divisionCode) {
    throw new ValidationError('An indicator, a quarter (Q1-Q4), a year and a unit are required');
  }
  return { indicatorId, quarter, fiscalYear, divisionCode };
}

router.get('/indicator-division-reports/:planNodeId/activity-evidence', authenticateToken, asyncHandler(async (req, res) => {
  const q = parseQuery(req);
  const { allowed, scope } = await rbacService.checkPermission(req.user.id, RBAC_MODULES.QUARTERLY_REPORT, RBAC_ACTIONS.READ);
  if (!allowed || !(await scopeCoversDivision(req.user, scope, q.divisionCode))) {
    throw new ForbiddenError('You cannot read the reports of this unit');
  }
  res.json(buildSuccess(await activityEvidence(q)));
}));

module.exports = router;
