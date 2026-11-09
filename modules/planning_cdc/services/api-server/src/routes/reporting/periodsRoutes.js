// ── Reporting Periods Routes ──
//
// Extracted from `services/api-server/src/routes/reportingRoutes.js` as the
// first routes-layer commit of the task #27 split. Five routes covering
// reporting-period CRUD. Mounted at `/api/reporting/periods` via the parent
// aggregator. URL paths identical to pre-split behaviour.

const router = require('express').Router();
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticateToken } = require('../../middleware/authMiddleware');
const { authorize } = require('../../middleware/rbacMiddleware');
const svc = require('../../services/reporting/periodsService');
const { audit } = require('../../middleware/auditLog');
const { NotFoundError } = require('@rbm/lib/errors');

router.use(authenticateToken);

// Periods are global state — opening/closing one affects every focal person.
// Gate driven by the dynamic rbac_permissions table (module=activity_report,
// action=update).
const canManagePeriods = authorize({ module: 'activity_report', action: 'update' });

/**
 * List reporting periods filtered by query.
 * @name GET /api/reporting/periods
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON array
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/reporting/periods?fiscal_year=2026
 */
router.get('/periods', asyncHandler(async (req, res) => {
  res.json(await svc.listPeriods(req.query));
}));

/**
 * Return the currently active reporting period (or `null`).
 * @name GET /api/reporting/periods/active
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON row or null
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/reporting/periods/active
 */
router.get('/periods/active', asyncHandler(async (req, res) => {
  const period = await svc.getActivePeriod();
  res.json(period || null);
}));

/**
 * Fetch a reporting period by id.
 * @name GET /api/reporting/periods/:id
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON row
 * @returns {Promise<void>}
 * @throws {NotFoundError} 404 when the period does not exist
 * @throws {Error} 500 on DB failure
 * @example GET /api/reporting/periods/3
 */
router.get('/periods/:id', asyncHandler(async (req, res) => {
  const period = await svc.getPeriodById(req.params.id);
  if (!period) throw new NotFoundError('Period not found');
  res.json(period);
}));

/**
 * Open a new reporting period (ME_OFFICER / RBM_ADMIN / SYSTEM_ADMIN only).
 * @name POST /api/reporting/periods
 * @param {express.Request} req — body with period values
 * @param {express.Response} res — 201 JSON with the created row
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example POST /api/reporting/periods { label: 'Q1 2026', fiscal_year: 2026 }
 */
router.post('/periods', canManagePeriods, asyncHandler(async (req, res) => {
  const period = await svc.createPeriod({ ...req.body, created_by: req.user.id });
  await audit(req, 'OPEN_REPORTING_PERIOD', 'reporting_period', period && period.id, {
    label: period && period.label,
  });
  res.status(201).json(period);
}));

/**
 * Update a reporting period (ME_OFFICER / RBM_ADMIN / SYSTEM_ADMIN only).
 * @name PUT /api/reporting/periods/:id
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON with the updated row
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example PUT /api/reporting/periods/3 { status: STATUSES.CLOSED }
 */
router.put('/periods/:id', canManagePeriods, asyncHandler(async (req, res) => {
  const updated = await svc.updatePeriod(req.params.id, req.body);
  await audit(req, 'UPDATE_REPORTING_PERIOD', 'reporting_period', req.params.id, {
    changes: Object.keys(req.body || {}),
  });
  res.json(updated);
}));

module.exports = router;
