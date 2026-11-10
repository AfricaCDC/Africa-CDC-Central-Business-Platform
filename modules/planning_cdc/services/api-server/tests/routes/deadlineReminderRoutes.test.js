// ── deadlineReminderRoutes integration tests ──
//
// Covers: POST /api/reporting/admin/remind-deadline

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

const PERIOD = { id: 3, quarter: 'Q1', fiscal_year: 2026, end_date: '2026-03-31', status: 'OPEN', label: 'FY2026 Q1' };

function resetChain() {
  chain.first.mockReset().mockResolvedValue(PERIOD);
  chain.insert.mockReset().mockResolvedValue([1]);
  chain.update.mockReset().mockResolvedValue(1);
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  // `whereNotExists` is not part of the shared mock's default method set — the
  // review-queue-style query uses it, so define it here.
  chain.whereNotExists = jest.fn().mockReturnValue(chain);
  ['select', 'where', 'whereIn', 'whereNotNull', 'whereNotExists', 'orderBy', 'leftJoin', 'join']
    .forEach((m) => { if (chain[m]) chain[m].mockClear().mockReturnValue(chain); });
}

const ADMIN_USER = { id: 1, email: 'admin@africacdc.org', roles: ['SYSTEM_ADMIN'] };

// One pending-approval row per (report × current step), already joined to the approver.
const pendingRow = (over = {}) => ({
  user_id: 20, email: 'me.officer@org.org', first_name: 'Mary', last_name: 'Eno',
  report_id: 100, division_code: 'DCM', quarter: 'Q1', fiscal_year: '2026',
  step_label: 'M&E Review',
  indicator_code: 'IND001', indicator_title: 'Test Indicator', division_name: 'Disease Control',
  ...over,
});

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  global.__testUser = ADMIN_USER;
});

afterEach(() => {
  global.__testUser = null;
});

describe('POST /api/reporting/admin/remind-deadline', () => {
  it('should 404 when no reporting period resolves', async () => {
    chain.first.mockResolvedValue(undefined);
    const res = await request(app)
      .post('/api/reporting/admin/remind-deadline')
      .send({ dryRun: true });
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('should return dryRun summary with zero targets when no pending approvals', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    const res = await request(app)
      .post('/api/reporting/admin/remind-deadline')
      .send({ dryRun: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.users_targeted).toBe(0);
    expect(res.body.data.total_reports).toBe(0);
    expect(res.body.data.enqueued).toBe(0);
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('should return dryRun summary with sample when pending approvals exist', async () => {
    const rows = [pendingRow(), pendingRow({ user_id: 21, email: 'hod@org.org', report_id: 101, indicator_code: 'IND002' })];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const res = await request(app)
      .post('/api/reporting/admin/remind-deadline')
      .send({ dryRun: true });
    expect(res.status).toBe(200);
    expect(res.body.data.users_targeted).toBe(2);
    expect(res.body.data.total_reports).toBe(2);
    expect(res.body.data.sample).toHaveLength(2);
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('should enqueue one email per approver when not dryRun', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([pendingRow()]).then(r));
    const res = await request(app)
      .post('/api/reporting/admin/remind-deadline')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.enqueued).toBe(1);
    expect(res.body.data.total_reports).toBe(1);
    expect(chain.insert).toHaveBeenCalledTimes(1);
  });

  it('should group multiple reports for the same approver into one email', async () => {
    const rows = [
      pendingRow({ report_id: 100, indicator_code: 'IND001' }),
      pendingRow({ report_id: 101, indicator_code: 'IND002' }),
    ];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const res = await request(app)
      .post('/api/reporting/admin/remind-deadline')
      .send({});
    expect(res.status).toBe(200);
    // 2 reports, 1 approver → 1 email
    expect(res.body.data.users_targeted).toBe(1);
    expect(res.body.data.total_reports).toBe(2);
    expect(res.body.data.enqueued).toBe(1);
    expect(chain.insert).toHaveBeenCalledTimes(1);
  });

  it('should echo the resolved period and days_left', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    const res = await request(app)
      .post('/api/reporting/admin/remind-deadline')
      .send({ dryRun: true, fiscalYear: '2026', quarter: 'Q1' });
    expect(res.status).toBe(200);
    expect(res.body.data.period.quarter).toBe('Q1');
    expect(res.body.data.period.end_date).toBe('2026-03-31');
    expect(typeof res.body.data.days_left).toBe('number');
  });
});
