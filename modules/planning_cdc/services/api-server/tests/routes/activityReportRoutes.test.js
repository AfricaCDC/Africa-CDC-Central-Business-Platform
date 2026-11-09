// ── activityReportRoutes integration tests ──
//
// Covers: GET / POST for /api/activity-reports

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
  checkPermission: jest.fn(() => Promise.resolve(global.__rbacPermission || { allowed: true, scope: 'all' })),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: true, denies: [] }),
}));

jest.mock('../../src/services/reportPermissions', () => ({
  canEditReportByPlanNodeId: jest.fn().mockResolvedValue({ allowed: true, planNode: { id: 1 } }),
}));

// D-20260818-01: the legacy route delegates writes to the shared service.
// POST is create-only (always DRAFT) — the narrative-field upsert is gone.
jest.mock('../../src/services/reporting/activityReportsService', () => ({
  createReport: jest.fn().mockResolvedValue({ id: 10, status: 'DRAFT', actual_spend: '0' }),
}));

const request = require('supertest');
const app = require('../../src/app');
const chain = sharedDb.__chain;
const { canEditReportByPlanNodeId } = require('../../src/services/reportPermissions');
const arService = require('../../src/services/reporting/activityReportsService');

function resetChain() {
  chain.first.mockReset().mockResolvedValue(undefined);
  chain.insert.mockReset().mockResolvedValue([1]);
  chain.update.mockReset().mockResolvedValue(1);
  chain.del.mockReset().mockResolvedValue(1);
  chain.delete.mockReset().mockResolvedValue(1);
  chain.pluck.mockReset().mockResolvedValue([]);
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  ['select', 'where', 'whereIn', 'whereNull', 'orderBy', 'leftJoin', 'join'].forEach((m) => {
    if (chain[m]) chain[m].mockClear().mockReturnValue(chain);
  });
}

const ADMIN_USER = { id: 1, email: 'admin@africacdc.org', roles: ['SYSTEM_ADMIN'] };

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  global.__testUser = ADMIN_USER;
  global.__rbacPermission = { allowed: true, scope: 'all' };
  canEditReportByPlanNodeId.mockResolvedValue({ allowed: true, planNode: { id: 1 } });
  arService.createReport.mockResolvedValue({ id: 10, status: 'DRAFT', actual_spend: '0' });
});

afterEach(() => {
  global.__testUser = null;
  global.__rbacPermission = null;
});

// ── GET /api/activity-reports ─────────────────────────────────────────────────
describe('GET /api/activity-reports', () => {
  it('should return all reports', async () => {
    const row = { id: 1, plan_node_id: 5, quarter: 'Q1', actual_spend: '1000.00' };
    chain.then.mockImplementationOnce((r) => Promise.resolve([row]).then(r));
    const res = await request(app).get('/api/activity-reports');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('should apply plan_node_id filter', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await request(app).get('/api/activity-reports?plan_node_id=5');
    expect(chain.where).toHaveBeenCalledWith('plan_node_id', 5);
  });

  it('should apply quarter filter', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await request(app).get('/api/activity-reports?quarter=Q2');
    expect(chain.where).toHaveBeenCalledWith('quarter', 'Q2');
  });

  it('should apply fiscal_year filter', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await request(app).get('/api/activity-reports?fiscal_year=2026');
    expect(chain.where).toHaveBeenCalledWith('fiscal_year', '2026');
  });
});

// ── GET /api/activity-reports/_meta/current-quarter ─────────────────────────
describe('GET /api/activity-reports/_meta/current-quarter', () => {
  it('should return the current quarter', async () => {
    const res = await request(app).get('/api/activity-reports/_meta/current-quarter');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('quarter');
    expect(['Q1', 'Q2', 'Q3', 'Q4']).toContain(res.body.data.quarter);
  });
});

// ── GET /api/activity-reports/:plan_node_id/:quarter ────────────────────────
describe('GET /api/activity-reports/:plan_node_id/:quarter', () => {
  it('should return null when report not found', async () => {
    chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app).get('/api/activity-reports/5/Q1');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('should return the report when found', async () => {
    const report = { id: 1, plan_node_id: 5, quarter: 'Q1', actual_spend: '1000.00' };
    chain.first.mockResolvedValueOnce(report);
    const res = await request(app).get('/api/activity-reports/5/Q1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(1);
  });

  // D-20260818-01: several reports may share the tuple — this legacy
  // single-row view must deterministically return the newest one.
  it('should order by created_at desc so the newest report wins', async () => {
    chain.first.mockResolvedValueOnce({ id: 7, plan_node_id: 5, quarter: 'Q1', actual_spend: '0' });
    await request(app).get('/api/activity-reports/5/Q1');
    expect(chain.orderBy).toHaveBeenCalledWith('created_at', 'desc');
  });

  // The read-side default must track the write-side default in
  // activityReportsService — a hardcoded year would hide rows created
  // without fiscal_year once the calendar year moves on.
  it('should default fiscal_year to the current year when not supplied', async () => {
    chain.first.mockResolvedValueOnce(undefined);
    await request(app).get('/api/activity-reports/5/Q1');
    expect(chain.where).toHaveBeenCalledWith(
      expect.objectContaining({ fiscal_year: String(new Date().getFullYear()) }),
    );
  });

  // The assertion above cannot fail while the hardcoded year and the current
  // year coincide, so pin the source directly: the default must be DERIVED
  // from the clock, not a literal. This is what breaks in 2027 otherwise.
  it('should derive the fiscal_year default from the clock, not a literal', () => {
    const routeSrc = require('fs').readFileSync(
      require('path').join(__dirname, '../../src/routes/activityReportRoutes.js'),
      'utf8',
    );
    const declaration = routeSrc.match(/const DEFAULT_FISCAL_YEAR = .+;/)[0];
    expect(declaration).toContain('getFullYear()');
    expect(declaration).not.toMatch(/'\d{4}'|"\d{4}"/);
  });
});

// ── POST /api/activity-reports ────────────────────────────────────────────────
describe('POST /api/activity-reports', () => {
  it('should return 400 when plan_node_id is missing', async () => {
    const res = await request(app)
      .post('/api/activity-reports')
      .send({ quarter: 'Q1' });
    expect(res.status).toBe(400);
  });

  it('should return 400 when quarter is missing', async () => {
    const res = await request(app)
      .post('/api/activity-reports')
      .send({ plan_node_id: 5 });
    expect(res.status).toBe(400);
  });

  it('should return 403 when user cannot edit the report', async () => {
    canEditReportByPlanNodeId.mockResolvedValueOnce({ allowed: false, planNode: { id: 5 } });
    const res = await request(app)
      .post('/api/activity-reports')
      .send({ plan_node_id: 5, quarter: 'Q1' });
    expect(res.status).toBe(403);
  });

  it('should return 404 when plan_node not found', async () => {
    canEditReportByPlanNodeId.mockResolvedValueOnce({ allowed: false, planNode: null });
    const res = await request(app)
      .post('/api/activity-reports')
      .send({ plan_node_id: 999, quarter: 'Q1' });
    expect(res.status).toBe(404);
  });

  it('should CREATE a report via the shared service', async () => {
    const res = await request(app)
      .post('/api/activity-reports')
      .send({ plan_node_id: 5, quarter: 'Q1', narrative: 'Progress' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(10);
    expect(arService.createReport).toHaveBeenCalledTimes(1);
    expect(arService.createReport).toHaveBeenCalledWith({
      data: expect.objectContaining({ plan_node_id: 5, quarter: 'Q1', narrative: 'Progress' }),
      userId: ADMIN_USER.id,
    });
  });

  // D-20260818-01: a second POST on the same tuple creates a SECOND report
  // instead of overwriting the first — no upsert, no UPDATE.
  it('should CREATE again for an existing plan_node + quarter, never UPDATE', async () => {
    arService.createReport.mockResolvedValueOnce({ id: 11, status: 'DRAFT', actual_spend: '600' });
    const res = await request(app)
      .post('/api/activity-reports')
      .send({ plan_node_id: 5, quarter: 'Q1', narrative: 'Second report' });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(11);
    expect(arService.createReport).toHaveBeenCalledTimes(1);
    expect(chain.update).not.toHaveBeenCalled();
  });

  // The route must not invent a fiscal_year: the service owns that default,
  // so read and write cannot drift apart.
  it('should not forward a fiscal_year when the body omits it', async () => {
    const res = await request(app)
      .post('/api/activity-reports')
      .send({ plan_node_id: 5, quarter: 'Q1' });
    expect(res.status).toBe(200);
    const { data } = arService.createReport.mock.calls[0][0];
    expect(data).not.toHaveProperty('fiscal_year');
  });

  it('should forward an explicit fiscal_year untouched', async () => {
    const res = await request(app)
      .post('/api/activity-reports')
      .send({ plan_node_id: 5, quarter: 'Q1', fiscal_year: '2027' });
    expect(res.status).toBe(200);
    const { data } = arService.createReport.mock.calls[0][0];
    expect(data.fiscal_year).toBe('2027');
  });

  it('should cast actual_spend to a number in the response', async () => {
    arService.createReport.mockResolvedValueOnce({ id: 12, status: 'DRAFT', actual_spend: '1500.50' });
    const res = await request(app)
      .post('/api/activity-reports')
      .send({ plan_node_id: 5, quarter: 'Q1' });
    expect(res.status).toBe(200);
    expect(res.body.data.actual_spend).toBe(1500.5);
  });

  // The legacy route could stamp SUBMITTED from the body; that capability is
  // removed — submission goes through /api/reporting/activity-reports/:id/submit.
  it('should ignore a status field in the body (create-only, always DRAFT)', async () => {
    const res = await request(app)
      .post('/api/activity-reports')
      .send({ plan_node_id: 5, quarter: 'Q1', status: 'SUBMITTED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DRAFT');
    expect(chain.update).not.toHaveBeenCalled();
  });
});
