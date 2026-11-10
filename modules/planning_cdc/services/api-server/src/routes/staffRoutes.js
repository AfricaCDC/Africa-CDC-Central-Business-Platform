const express = require('express');
const router = express.Router();
const cbpService = require('../services/cbpService');
const rbacService = require('../services/rbacService');
const { authenticateToken } = require('../middleware/authMiddleware');
const { NotFoundError } = require('@rbm/lib/errors');
const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// All staff endpoints require authentication
router.use(authenticateToken);

// The CBP record is an HR file (date of birth, private contacts, contract,
// signature). Only users:read holders get it whole; everyone else gets the
// directory fields the pickers need (D-20261108-02).
const DIRECTORY_FIELDS = Object.freeze([
  'staffId', 'firstName', 'lastName', 'otherName', 'title', 'workEmail',
  'divisionName', 'divisionId', 'dutyStationName', 'jobName',
]);
const toDirectoryEntry = (s) => Object.fromEntries(DIRECTORY_FIELDS.map((k) => [k, s[k]]));

async function staffView(userId) {
  const { allowed } = await rbacService.checkPermission(userId, RBAC_MODULES.USERS, RBAC_ACTIONS.READ)
    .catch(() => ({ allowed: false }));
  return allowed ? (s) => s : toDirectoryEntry;
}

// GET /api/staff/divisions — unique divisions from staff data
router.get('/divisions', asyncHandler(async (req, res) => {
  const divisions = await cbpService.getStaffDivisions();
  res.json({ data: divisions });
}));

// GET /api/staff/duty-stations — unique duty stations
router.get('/duty-stations', asyncHandler(async (req, res) => {
  const dutyStations = await cbpService.getStaffDutyStations();
  res.json({ data: dutyStations });
}));

// GET /api/staff/cbp-divisions — official CBP divisions endpoint
router.get('/cbp-divisions', asyncHandler(async (req, res) => {
  const divisions = await cbpService.fetchCBPDivisions();
  res.json({ data: divisions });
}));

// GET /api/staff — list all staff (paginated, searchable)
router.get('/', asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 50 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10) || 50));

  let staff;
  if (search && search.trim().length >= 2) {
    staff = await cbpService.searchStaff(search);
  } else {
    staff = await cbpService.fetchAllStaff();
  }

  const total = staff.length;
  const offset = (pageNum - 1) * limitNum;
  const paginated = staff.slice(offset, offset + limitNum).map(await staffView(req.user.id));

  res.json({
    data: paginated,
    meta: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
  });
}));

// GET /api/staff/:staffId — single staff member
router.get('/:staffId', asyncHandler(async (req, res) => {
  const staff = await cbpService.getStaffByStaffId(req.params.staffId);
  if (!staff) throw new NotFoundError(`Staff ${req.params.staffId} not found`);
  res.json({ data: (await staffView(req.user.id))(staff) });
}));

module.exports = router;
