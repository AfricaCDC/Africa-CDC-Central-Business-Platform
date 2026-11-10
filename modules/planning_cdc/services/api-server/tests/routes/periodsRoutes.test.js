// ── periodsRoutes integration tests ──
//
// Covers: GET /api/reporting/periods, GET /api/reporting/periods/active,
//         GET /api/reporting/periods/:id, POST /api/reporting/periods,
//         PUT /api/reporting/periods/:id

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = global.__testUser || { id: 1, email: 'admin@africacdc.org' };
    next();
  },
}));

jest.mock('../../src/middleware/auditLog', () => ({
  audit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn(() => Promise.resolve({ allowed: true, scope: 'all' })),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: true, denies: [] }),
}));

jest.mock('@rbm/lib/user-divisions', () => ({
  ...jest.requireActual('@rbm/lib/user-divisions'),
  getUserDivisionCodes: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../src/services/reporting/periodsService', () => ({
  listPeriods: jest.fn().mockResolvedValue([]),
  getActivePeriod: jest.fn().mockResolvedValue(null),
  getPeriodById: jest.fn().mockResolvedValue(null),
  createPeriod: jest.fn().mockResolvedValue({ id: 1, label: 'Q1 2026', status: 'OPEN' }),
  updatePeriod: jest.fn().mockResolvedValue({ id: 1, label: 'Q1 2026', status: 'CLOSED' }),
}));

const request = require('supertest');
const app = require('../../src/app');
const rbacService = require('../../src/services/rbacService');
const reportingService = require('../../src/services/reporting/periodsService');
const chain = sharedDb.__chain;

function resetChain() {
  chain.first.mockReset().mockResolvedValue(undefined);
  chain.insert.mockReset().mockResolvedValue([1]);
  chain.update.mockReset().mockResolvedValue(1);
  chain.del.mockReset().mockResolvedValue(1);
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  ['select', 'where', 'whereIn', 'orderBy', 'leftJoin'].forEach((m) => {
    if (chain[m]) chain[m].mockClear().mockReturnValue(chain);
  });
}

const ADMIN_USER = { id: 1, email: 'admin@africacdc.org' };

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  global.__testUser = ADMIN_USER;
  rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
  reportingService.listPeriods.mockResolvedValue([]);
  reportingService.getActivePeriod.mockResolvedValue(null);
  reportingService.getPeriodById.mockResolvedValue(null);
  reportingService.createPeriod.mockResolvedValue({ id: 1, label: 'Q1 2026', status: 'OPEN' });
  reportingService.updatePeriod.mockResolvedValue({ id: 1, status: 'CLOSED' });
});

afterEach(() => {
  global.__testUser = null;
});

// ── GET /api/reporting/periods ────────────────────────────────────────────────
describe('GET /api/reporting/periods', () => {
  it('should return list of periods', async () => {
    reportingService.listPeriods.mockResolvedValueOnce([
      { id: 1, label: 'Q1 2026', status: 'OPEN' },
    ]);
    const res = await request(app).get('/api/reporting/periods');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe(1);
  });

  it('should pass query params to listPeriods', async () => {
    const res = await request(app).get('/api/reporting/periods?fiscal_year=2026');
    expect(res.status).toBe(200);
    expect(reportingService.listPeriods).toHaveBeenCalledWith(expect.objectContaining({ fiscal_year: '2026' }));
  });
});

// ── GET /api/reporting/periods/active ─────────────────────────────────────────
describe('GET /api/reporting/periods/active', () => {
  it('should return null when no active period', async () => {
    reportingService.getActivePeriod.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/reporting/periods/active');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('should return the active period', async () => {
    reportingService.getActivePeriod.mockResolvedValueOnce({ id: 2, label: 'Q2 2026', status: 'OPEN' });
    const res = await request(app).get('/api/reporting/periods/active');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(2);
  });
});

// ── GET /api/reporting/periods/:id ────────────────────────────────────────────
describe('GET /api/reporting/periods/:id', () => {
  it('should return 404 when period not found', async () => {
    reportingService.getPeriodById.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/reporting/periods/999');
    expect(res.status).toBe(404);
  });

  it('should return the period by id', async () => {
    reportingService.getPeriodById.mockResolvedValueOnce({ id: 3, label: 'Q3 2026', status: 'CLOSED' });
    const res = await request(app).get('/api/reporting/periods/3');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(3);
  });
});

// ── POST /api/reporting/periods ───────────────────────────────────────────────
describe('POST /api/reporting/periods', () => {
  it('should return 403 when user lacks permission', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    const res = await request(app)
      .post('/api/reporting/periods')
      .send({ label: 'Q1 2026', fiscal_year: '2026' });
    expect(res.status).toBe(403);
  });

  it('should create a period and return 201', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    const res = await request(app)
      .post('/api/reporting/periods')
      .send({ label: 'Q1 2026', fiscal_year: '2026' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
    expect(reportingService.createPeriod).toHaveBeenCalled();
  });
});

// ── PUT /api/reporting/periods/:id ────────────────────────────────────────────
describe('PUT /api/reporting/periods/:id', () => {
  it('should return 403 when user lacks permission', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    const res = await request(app)
      .put('/api/reporting/periods/1')
      .send({ status: 'CLOSED' });
    expect(res.status).toBe(403);
  });

  it('should update a period and return 200', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    const res = await request(app)
      .put('/api/reporting/periods/1')
      .send({ status: 'CLOSED' });
    expect(res.status).toBe(200);
    expect(reportingService.updatePeriod).toHaveBeenCalledWith('1', expect.objectContaining({ status: 'CLOSED' }));
  });
});
