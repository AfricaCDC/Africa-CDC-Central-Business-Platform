// ── draftReminderRoutes integration tests ──
//
// Covers: POST /api/reporting/admin/remind-drafts

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
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  ['select', 'where', 'whereIn', 'whereNotNull', 'orderBy', 'leftJoin'].forEach((m) => {
    if (chain[m]) chain[m].mockClear().mockReturnValue(chain);
  });
  if (!chain.whereNotNull) chain.whereNotNull = jest.fn().mockReturnValue(chain);
  else chain.whereNotNull.mockReset().mockReturnValue(chain);
}

const ADMIN_USER = { id: 1, email: 'admin@africacdc.org', roles: ['SYSTEM_ADMIN'] };

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  global.__testUser = ADMIN_USER;
});

afterEach(() => {
  global.__testUser = null;
});

// ── POST /api/reporting/admin/remind-drafts ───────────────────────────────────
describe('POST /api/reporting/admin/remind-drafts', () => {
  it('should return dryRun summary when dryRun=true and no drafts', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    const res = await request(app)
      .post('/api/reporting/admin/remind-drafts')
      .send({ dryRun: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.users_targeted).toBe(0);
    expect(res.body.data.total_drafts).toBe(0);
  });

  it('should return dryRun summary with sample when drafts exist', async () => {
    const drafts = [
      {
        user_id: 10, email: 'focal@org.org', first_name: 'Alice', last_name: 'Smith',
        report_id: 1, fiscal_year: '2026', quarter: 'Q1', division_code: 'DCM',
        indicator_code: 'IND001', indicator_title: 'Test Indicator', division_name: 'Disease Control',
      },
      {
        user_id: 11, email: 'focal2@org.org', first_name: 'Bob', last_name: 'Jones',
        report_id: 2, fiscal_year: '2026', quarter: 'Q1', division_code: 'WHC',
        indicator_code: 'IND002', indicator_title: 'Another Indicator', division_name: 'Women Health',
      },
    ];
    chain.then.mockImplementationOnce((r) => Promise.resolve(drafts).then(r));
    const res = await request(app)
      .post('/api/reporting/admin/remind-drafts')
      .send({ dryRun: true });
    expect(res.status).toBe(200);
    expect(res.body.data.users_targeted).toBe(2);
    expect(res.body.data.total_drafts).toBe(2);
    expect(res.body.data.sample).toHaveLength(2);
  });

  it('should enqueue notifications and return count when not dryRun', async () => {
    const drafts = [
      {
        user_id: 10, email: 'focal@org.org', first_name: 'Alice', last_name: 'Smith',
        report_id: 1, fiscal_year: '2026', quarter: 'Q1', division_code: 'DCM',
        indicator_code: 'IND001', indicator_title: 'Test Indicator', division_name: 'Disease Control',
      },
    ];
    chain.then.mockImplementationOnce((r) => Promise.resolve(drafts).then(r));
    chain.insert.mockResolvedValue([1]);
    const res = await request(app)
      .post('/api/reporting/admin/remind-drafts')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.enqueued).toBe(1);
    expect(res.body.data.total_drafts).toBe(1);
    expect(chain.insert).toHaveBeenCalled();
  });

  it('should skip rows with no email', async () => {
    const drafts = [
      { user_id: 10, email: null, first_name: 'Ghost', last_name: 'User',
        report_id: 1, fiscal_year: '2026', quarter: 'Q1', division_code: 'DCM',
        indicator_code: 'IND001', indicator_title: 'Test', division_name: 'DC' },
    ];
    chain.then.mockImplementationOnce((r) => Promise.resolve(drafts).then(r));
    const res = await request(app)
      .post('/api/reporting/admin/remind-drafts')
      .send({ dryRun: true });
    expect(res.status).toBe(200);
    expect(res.body.data.users_targeted).toBe(0);
  });

  it('should apply fiscalYear and quarter filters', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await request(app)
      .post('/api/reporting/admin/remind-drafts')
      .send({ dryRun: true, fiscalYear: '2026', quarter: 'Q2' });
    expect(chain.where).toHaveBeenCalledWith('r.fiscal_year', '2026');
    expect(chain.where).toHaveBeenCalledWith('r.quarter', 'Q2');
  });

  it('should only scan drafts of an open reporting window', async () => {
    chain.whereExists.mockClear();
    await request(app).post('/api/reporting/admin/remind-drafts').send({ dryRun: true });
    expect(chain.whereExists).toHaveBeenCalledTimes(1);
  });

  it('should group multiple drafts per user into one notification', async () => {
    const drafts = [
      { user_id: 10, email: 'focal@org.org', first_name: 'Alice', last_name: 'S',
        report_id: 1, fiscal_year: '2026', quarter: 'Q1', division_code: 'DCM',
        indicator_code: 'IND001', indicator_title: 'Indicator 1', division_name: 'DC' },
      { user_id: 10, email: 'focal@org.org', first_name: 'Alice', last_name: 'S',
        report_id: 2, fiscal_year: '2026', quarter: 'Q1', division_code: 'DCM',
        indicator_code: 'IND002', indicator_title: 'Indicator 2', division_name: 'DC' },
    ];
    chain.then.mockImplementationOnce((r) => Promise.resolve(drafts).then(r));
    chain.insert.mockResolvedValue([1]);
    const res = await request(app)
      .post('/api/reporting/admin/remind-drafts')
      .send({});
    expect(res.status).toBe(200);
    // 2 drafts but only 1 user = 1 notification
    expect(res.body.data.enqueued).toBe(1);
    expect(res.body.data.total_drafts).toBe(2);
  });
});
