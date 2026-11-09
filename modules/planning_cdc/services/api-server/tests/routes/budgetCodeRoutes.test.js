// ── budgetCodeRoutes integration tests ──
//
// Covers: GET / POST / PUT / DELETE /api/budget-codes

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

const request = require('supertest');
const app = require('../../src/app');
const chain = sharedDb.__chain;

function resetChain() {
  chain.first.mockReset().mockResolvedValue(undefined);
  chain.insert.mockReset().mockResolvedValue([1]);
  chain.update.mockReset().mockResolvedValue(1);
  chain.del.mockReset().mockResolvedValue(1);
  chain.delete.mockReset().mockResolvedValue(1);
  chain.pluck.mockReset().mockResolvedValue([]);
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  ['select', 'where', 'whereIn', 'whereNull', 'whereNotNull', 'orderBy', 'leftJoin', 'join', 'groupBy', 'clone', 'raw'].forEach((m) => {
    if (chain[m]) chain[m].mockClear().mockReturnValue(chain);
  });
}

const ADMIN_USER = { id: 1, email: 'admin@africacdc.org', roles: ['SYSTEM_ADMIN'] };

beforeEach(() => {
  resetChain();
  global.__testUser = ADMIN_USER;
  global.__rbacPermission = { allowed: true, scope: 'all' };
});

afterEach(() => {
  global.__testUser = null;
  global.__rbacPermission = null;
});

// ── GET /api/budget-codes ─────────────────────────────────────────────────────
describe('GET /api/budget-codes', () => {
  it('should return all budget codes', async () => {
    const row = { id: 1, budget_code: 'BC-001', amount: 10000 };
    chain.then.mockImplementationOnce((r) => Promise.resolve([row]).then(r));
    const res = await request(app).get('/api/budget-codes');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('should apply plan_node_id filter', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await request(app).get('/api/budget-codes?plan_node_id=5');
    expect(chain.where).toHaveBeenCalledWith('b.plan_node_id', 5);
  });

  it('should apply fund_code filter', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await request(app).get('/api/budget-codes?fund_code=CDC001');
    expect(chain.where).toHaveBeenCalledWith('b.fund_code', 'CDC001');
  });

  it('should apply fiscal_year filter', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await request(app).get('/api/budget-codes?fiscal_year=2026');
    expect(chain.where).toHaveBeenCalledWith('b.fiscal_year', '2026');
  });

  it('should keep the codes of the given Business Units only', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await request(app).get('/api/budget-codes?division=sdi, epr,');
    expect(chain.whereIn).toHaveBeenCalledWith('p.responsible_division_code', ['SDI', 'EPR']);
  });

  it('should not filter on division when none is given', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await request(app).get('/api/budget-codes');
    expect(chain.whereIn).not.toHaveBeenCalled();
  });
});

// ── GET /api/budget-codes/summary ────────────────────────────────────────────
describe('GET /api/budget-codes/summary', () => {
  it('should return budget summary with totals and by_fund', async () => {
    // The summary route uses .clone() to build two queries from the same base
    const totals = { total_codes: 5, broads_with_budget: 3, total_amount: 50000, total_main: 40000, total_ta: 5000, total_ips: 2000, total_gap: 3000 };
    // first() for totals, then() for byFund
    chain.first.mockResolvedValueOnce(totals);
    chain.then.mockImplementationOnce((r) => Promise.resolve([{ fund_code: 'CDC', total: '30000', count: '2' }]).then(r));

    const res = await request(app).get('/api/budget-codes/summary');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('totals');
    expect(res.body.data).toHaveProperty('by_fund');
  });

  it('should sum the codes of the broads of the given Business Units only', async () => {
    chain.first.mockResolvedValueOnce({ total_codes: 1 });
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    const res = await request(app).get('/api/budget-codes/summary?division=SDI');
    expect(res.status).toBe(200);
    expect(chain.whereIn).toHaveBeenCalledWith('responsible_division_code', ['SDI']);
    expect(chain.whereIn).toHaveBeenCalledWith('budget_codes.plan_node_id', expect.anything());
  });
});

// ── PUT /api/budget-codes/:id ────────────────────────────────────────────────
describe('PUT /api/budget-codes/:id', () => {
  it('should update budget code and return 200 with enriched data', async () => {
    chain.update.mockResolvedValueOnce(1);
    chain.first.mockResolvedValueOnce({ id: 5, budget_code: 'BC-005', amount: 50000, main_budget: 40000, technical_assistance: 5000, total_ips: 2000, gap: 3000 });
    const res = await request(app)
      .put('/api/budget-codes/5')
      .send({ amount: 50000, main_budget: 40000 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(5);
  });

  it('should coerce numeric fields', async () => {
    chain.update.mockResolvedValueOnce(1);
    chain.first.mockResolvedValueOnce({ id: 1, budget_code: 'BC-001', amount: 100, main_budget: null, technical_assistance: null, total_ips: null, gap: null });
    const res = await request(app)
      .put('/api/budget-codes/1')
      .send({ amount: '12345.67' });
    expect(res.status).toBe(200);
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ amount: 12345.67 }));
  });
});

// ── POST /api/budget-codes ────────────────────────────────────────────────────
describe('POST /api/budget-codes', () => {
  it('should return 400 when plan_node_id is missing', async () => {
    const res = await request(app)
      .post('/api/budget-codes')
      .send({ amount: 1000 });
    expect(res.status).toBe(400);
  });

  it('should create budget code and return 200', async () => {
    chain.insert.mockResolvedValueOnce([10]);
    chain.first.mockResolvedValueOnce({ id: 10, plan_node_id: 5, amount: 1000, main_budget: 0, technical_assistance: 0, total_ips: 0, gap: 0 });
    const res = await request(app)
      .post('/api/budget-codes')
      .send({ plan_node_id: 5, amount: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(10);
  });
});

// ── DELETE /api/budget-codes/:id ─────────────────────────────────────────────
describe('DELETE /api/budget-codes/:id', () => {
  it('should delete budget code and return 200', async () => {
    chain.del.mockResolvedValueOnce(1);
    const res = await request(app).delete('/api/budget-codes/5');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ok).toBe(true);
  });
});

// ── RBAC write gates (D-20260818-02) ─────────────────────────────────────────
// Before the fix these three routes were authenticated-only: any logged-in
// account could rewrite or destroy budget codes.
describe('budget-codes write authorization', () => {
  beforeEach(() => {
    global.__rbacPermission = { allowed: false, scope: null };
  });

  it('should return 403 on PUT when the permission matrix denies budget:update', async () => {
    const res = await request(app)
      .put('/api/budget-codes/5')
      .send({ amount: 999 });
    expect(res.status).toBe(403);
    expect(chain.update).not.toHaveBeenCalled();
  });

  it('should return 403 on POST when the permission matrix denies budget:create', async () => {
    const res = await request(app)
      .post('/api/budget-codes')
      .send({ plan_node_id: 5, amount: 1000 });
    expect(res.status).toBe(403);
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('should return 403 on DELETE when the permission matrix denies budget:delete', async () => {
    const res = await request(app).delete('/api/budget-codes/5');
    expect(res.status).toBe(403);
    expect(chain.del).not.toHaveBeenCalled();
  });

  it('should check the budget module with the matching action per verb', async () => {
    const rbacService = require('../../src/services/rbacService');
    rbacService.checkPermission.mockClear();
    await request(app).post('/api/budget-codes').send({ plan_node_id: 1 });
    expect(rbacService.checkPermission).toHaveBeenCalledWith(1, 'budget', 'create');
  });
});
