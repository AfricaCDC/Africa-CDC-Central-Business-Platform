/**
 * Adoption of the platform (D-20261106-03).
 *
 * GET /api/admin/adoption?filter=&q=&unit=&page=
 *   Summary over every active user, then one page (15) of users with their
 *   last sign-in, onboarding tour and submissions. Scope: users:read.
 *
 * @name adminAdoptionRoutes
 */
'use strict';

const express = require('express');
const router = express.Router();
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticateToken } = require('../../middleware/authMiddleware');
const { authorize } = require('../../middleware/rbacMiddleware');
const { buildSuccess, ValidationError } = require('@rbm/lib/errors');
const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');
const { ADOPTION_FILTERS } = require('@rbm/lib/enums');
const { adoptionReport } = require('../../services/adoption/adoptionReport');

const FILTERS = Object.values(ADOPTION_FILTERS);
const UNIT = /^[A-Za-z0-9&._-]{1,20}$/;

/** Value of an optional query parameter, refused when `isValid` says no. */
function optional(value, isValid, message) {
  if (!value) return null;
  const text = String(value);
  if (!isValid(text)) throw new ValidationError(message);
  return text;
}

function parseQuery(query) {
  const page = parseInt(query.page || '1', 10);
  if (!Number.isInteger(page) || page < 1) throw new ValidationError('page must be 1 or more');
  return {
    filter: optional(query.filter, (v) => FILTERS.includes(v), `filter must be one of ${FILTERS.join(', ')}`),
    unit: optional(query.unit, (v) => UNIT.test(v), 'unit must be a Business Unit code') || '',
    search: String(query.q || '').trim().slice(0, 100),
    page,
  };
}

router.get('/adoption',
  authenticateToken,
  authorize({ module: RBAC_MODULES.USERS, action: RBAC_ACTIONS.READ }),
  asyncHandler(async (req, res) => {
    res.json(buildSuccess(await adoptionReport(parseQuery(req.query))));
  }));

module.exports = router;
