// ── plan-nodes write routes integration tests ──
//
// Covers: PATCH /api/plan-nodes/broad-activity/:id
//         PUT /api/plan-nodes/indicator/:id
//         POST /api/plan-nodes/indicator (create indicator)

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = global.__testUser || { id: 1, email: 'admin@africacdc.org', division_code: 'DCM' };
    next();
  },
}));

jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn(() => Promise.resolve({ allowed: true, scope: 'all' })),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: true, denies: [] }),
}));

jest.mock('../../src/services/divisionAliasService', () => ({
  scopeCoversDivision: jest.fn().mockResolvedValue(true),
  sameDivision: jest.fn().mockResolvedValue(false),
  getDirectoratesForUser: jest.fn().mockResolvedValue([]),
}));

jest.mock('@rbm/lib/user-divisions', () => ({
  ...jest.requireActual('@rbm/lib/user-divisions'),
  getUserDivisionCodes: jest.fn().mockResolvedValue([]),
}));

const request = require('supertest');
const app = require('../../src/app');
const rbacService = require('../../src/services/rbacService');
const chain = sharedDb.__chain;

function resetChain() {
  chain.first.mockReset().mockResolvedValue(undefined);
  chain.insert.mockReset().mockResolvedValue([1]);
  chain.update.mockReset().mockResolvedValue(1);
  chain.del.mockReset().mockResolvedValue(1);
  chain.delete.mockReset().mockResolvedValue(1);
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  ['select', 'where', 'whereIn', 'whereNotNull', 'whereNull', 'orderBy',
    'leftJoin', 'join', 'limit', 'pluck'].forEach((m) => {
    if (chain[m]) chain[m].mockClear().mockReturnValue(chain);
    else chain[m] = jest.fn().mockReturnValue(chain);
  });
  sharedDb.raw = jest.fn().mockReturnValue(chain);
  // transaction mock for indicators.js syncActivePeriods
  sharedDb.transaction = jest.fn().mockImplementation(async (cb) => {
    const trx = {
      fn: { now: jest.fn().mockReturnValue(new Date().toISOString()) },
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      del: jest.fn().mockResolvedValue(1),
      insert: jest.fn().mockResolvedValue([1]),
      update: jest.fn().mockResolvedValue(1),
    };
    const trxFn = jest.fn().mockReturnValue(trx);
    Object.assign(trxFn, trx);
    return cb(trxFn);
  });
}

const ADMIN_USER = { id: 1, email: 'admin@africacdc.org', division_code: 'DCM' };

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  global.__testUser = ADMIN_USER;
  rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
});

afterEach(() => {
  global.__testUser = null;
});

// ── PATCH /api/plan-nodes/broad-activity/:id ──────────────────────────────────
describe('PATCH /api/plan-nodes/broad-activity/:id', () => {
  it('should return 400 for invalid id (non-numeric)', async () => {
    const res = await request(app)
      .patch('/api/plan-nodes/broad-activity/abc')
      .send({ responsible_division_code: 'DCM' });
    expect(res.status).toBe(400);
  });

  it('should return 403 when user lacks permission', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    const res = await request(app)
      .patch('/api/plan-nodes/broad-activity/1')
      .send({ title: 'New Title' });
    expect(res.status).toBe(403);
  });

  it('should return 404 when node not found', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app)
      .patch('/api/plan-nodes/broad-activity/999')
      .send({ title: 'New Title' });
    expect(res.status).toBe(404);
  });

  it('should return 404 when node is not BROAD_ACTIVITY type', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    chain.first.mockResolvedValueOnce({ id: 1, node_type: 'OUTCOME_INDICATOR' });
    const res = await request(app)
      .patch('/api/plan-nodes/broad-activity/1')
      .send({ title: 'New Title' });
    expect(res.status).toBe(404);
  });

  it('should return 400 when no fields to update', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    chain.first.mockResolvedValueOnce({ id: 1, node_type: 'BROAD_ACTIVITY' });
    const res = await request(app)
      .patch('/api/plan-nodes/broad-activity/1')
      .send({});
    expect(res.status).toBe(400);
  });

  it('should update and return the enriched node', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    const node = { id: 1, node_type: 'BROAD_ACTIVITY', title: 'Updated', responsible_division_code: 'DCM', unit_of_measure_id: null, strategic_plan_id: null };
    chain.first
      .mockResolvedValueOnce(node)    // initial lookup
      .mockResolvedValueOnce(undefined) // uom
      .mockResolvedValueOnce(undefined) // division
      .mockResolvedValueOnce(node);   // after update
    const res = await request(app)
      .patch('/api/plan-nodes/broad-activity/1')
      .send({ title: 'Updated' });
    expect(res.status).toBe(200);
    expect(chain.update).toHaveBeenCalled();
  });

  it('should handle contributing_divisions as array', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    const node = { id: 2, node_type: 'BROAD_ACTIVITY', unit_of_measure_id: null, strategic_plan_id: null };
    chain.first
      .mockResolvedValueOnce(node)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(node);
    const res = await request(app)
      .patch('/api/plan-nodes/broad-activity/2')
      .send({ contributing_divisions: ['WHC', 'DCM'] });
    expect(res.status).toBe(200);
    const updateArg = chain.update.mock.calls[0][0];
    expect(updateArg.contributing_divisions).toBe(JSON.stringify(['WHC', 'DCM']));
  });
});

// ── PUT /api/plan-nodes/indicator/:id ────────────────────────────────────────
describe('PUT /api/plan-nodes/indicator/:id', () => {
  // Regression (2026-10-07): "Q2" typed in a quarter target reached MySQL as
  // NaN and returned 500.
  it('should return 400 naming the field when a target is not a number', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    chain.first.mockResolvedValueOnce({ id: 6668, node_type: 'OUTCOME_INDICATOR' });
    const res = await request(app)
      .put('/api/plan-nodes/indicator/6668')
      .send({ indicator_name: 'Teams', q1_target: '0', q2_target: 'Q2', target_fy1: '' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/q2_target/);
    expect(res.body.message).not.toMatch(/q1_target|target_fy1/);
    expect(chain.update).not.toHaveBeenCalled();
  });

  it('should return 400 for invalid id', async () => {
    const res = await request(app)
      .put('/api/plan-nodes/indicator/0')
      .send({ indicator_name: 'Test' });
    expect(res.status).toBe(400);
  });

  it('should return 403 when user lacks permission', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    const res = await request(app)
      .put('/api/plan-nodes/indicator/1')
      .send({ indicator_name: 'Test' });
    expect(res.status).toBe(403);
  });

  it('should return 404 when indicator not found', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app)
      .put('/api/plan-nodes/indicator/999')
      .send({ indicator_name: 'Test' });
    expect(res.status).toBe(404);
  });

  it('should return 404 when node is not OUTCOME_INDICATOR', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    chain.first.mockResolvedValueOnce({ id: 1, node_type: 'BROAD_ACTIVITY' });
    const res = await request(app)
      .put('/api/plan-nodes/indicator/1')
      .send({ indicator_name: 'Test' });
    expect(res.status).toBe(404);
  });

  it('should update indicator and return enriched node', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    const node = { id: 3, node_type: 'OUTCOME_INDICATOR', title: 'Old', unit_of_measure_id: null, strategic_plan_id: null, status: 'APPROVED' };
    chain.first
      .mockResolvedValueOnce(node)       // lookup
      .mockResolvedValueOnce(undefined)  // uom
      .mockResolvedValueOnce(undefined)  // division
      .mockResolvedValueOnce(node);      // after update
    chain.then.mockImplementation((r) => Promise.resolve([]).then(r)); // active_periods

    const res = await request(app)
      .put('/api/plan-nodes/indicator/3')
      .send({ indicator_name: 'Updated Name' });
    expect(res.status).toBe(200);
    expect(chain.update).toHaveBeenCalled();
  });

  it('should sync active_periods when provided', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    const node = { id: 4, node_type: 'OUTCOME_INDICATOR', unit_of_measure_id: null, strategic_plan_id: null };
    chain.first
      .mockResolvedValueOnce(node)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(node);
    chain.then.mockImplementation((r) => Promise.resolve([]).then(r));

    const res = await request(app)
      .put('/api/plan-nodes/indicator/4')
      .send({ active_periods: [{ fy: 2026, q: 1 }, { fy: 2026, q: 2 }] });
    expect(res.status).toBe(200);
    // transaction should have been called for syncActivePeriods
    expect(sharedDb.transaction).toHaveBeenCalled();
  });
});
