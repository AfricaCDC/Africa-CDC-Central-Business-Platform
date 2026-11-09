// ── disaggregationsRoutes integration tests ──
//
// Covers: GET/POST /api/reporting/disaggregations and /api/reporting/actuals/:id/disaggregations

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

const request = require('supertest');
const app = require('../../src/app');
const chain = sharedDb.__chain;

function resetChain() {
  chain.first.mockReset().mockResolvedValue(undefined);
  chain.insert.mockReset().mockResolvedValue([1]);
  chain.update.mockReset().mockResolvedValue(1);
  chain.del.mockReset().mockResolvedValue(1);
  chain.delete.mockReset().mockResolvedValue(1);
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  ['select', 'where', 'whereIn', 'orderBy', 'leftJoin', 'join'].forEach((m) => {
    if (chain[m]) chain[m].mockClear().mockReturnValue(chain);
  });
}

const ADMIN_USER = { id: 1, email: 'admin@africacdc.org', roles: ['SYSTEM_ADMIN'] };

beforeEach(() => {
  resetChain();
  global.__testUser = ADMIN_USER;
});

afterEach(() => {
  global.__testUser = null;
});

// ── GET /api/reporting/disaggregations ───────────────────────────────────────
describe('GET /api/reporting/disaggregations', () => {
  it('should return items and grouped categories', async () => {
    const rows = [
      { id: 1, category: 'Gender', name: 'Male', sort_order: 1 },
      { id: 2, category: 'Gender', name: 'Female', sort_order: 2 },
      { id: 3, category: 'Age', name: '15-24', sort_order: 1 },
    ];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const res = await request(app).get('/api/reporting/disaggregations');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body).toHaveProperty('grouped');
    expect(res.body.grouped).toHaveProperty('Gender');
    expect(res.body.grouped.Gender).toHaveLength(2);
  });

  it('should return empty items and grouped when no disaggregations', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    const res = await request(app).get('/api/reporting/disaggregations');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.grouped).toEqual({});
  });
});
