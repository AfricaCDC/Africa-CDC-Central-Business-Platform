/* eslint-disable no-restricted-syntax --
 * P-31: DB column-enum WIRE values in test fixtures/assertions
 * (plan_nodes.node_type = 'SPECIFIC_ACTIVITY'/'BROAD_ACTIVITY'). Literal wire
 * values are intentional in tests so a column-enum rename is caught by a
 * failing test instead of masked by importing the enum. Mirrors the source
 * plan-nodes route files which carry the same documented P-31 exception.
 */
// ── planNodeRoutes — ACTIVITY FOCAL PERSON ──
//
// Covers the per-activity focal person feature (plan_nodes.focal_user_id):
//   POST  /api/plan-nodes/specific-activity           (focal eligibility 422)
//   PATCH /api/plan-nodes/specific-activity/:id       (eligibility + focal rights + bump)
//   POST  /api/plan-nodes/specific-activity/:id/submit (focal required + focal may submit)
//   POST  /api/plan-nodes/specific-activity/:id/approve (focal must NOT approve)
//   POST  /api/plan-nodes/specific-activity/:id/cancel  (focal may cancel)
//   GET   /api/plan-nodes/division-staff/:code          (picker endpoint)

// Force a single shared knex chain across all `require('knex')(...)` calls.
const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

// Submission requires an answered Decision Complexity Screening (D-20261026-04).
jest.mock('../../src/services/activityPlanning', () => ({
  ...jest.requireActual('../../src/services/activityPlanning'),
  hasScreening: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = global.__testUser || null;
    next();
  },
}));

jest.mock('../../src/middleware/auditLog', () => ({
  audit: jest.fn().mockResolvedValue(undefined),
}));

// global.__rbacPermission controls tasks:* calls
// global.__isAdmin controls whether pirs:delete (isAdmin) is allowed
jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn((_userId, module) => {
    if (module === 'pirs') return Promise.resolve(global.__isAdmin ? { allowed: true, scope: 'all' } : { allowed: false, scope: null });
    return Promise.resolve(global.__rbacPermission || { allowed: true, scope: 'own' });
  }),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: false, denies: [] }),
}));

// Mock divisionAliasService — sameDivision is simple string equality,
// resolveAliases is identity, scopeCoversDivision true only for scope='all'.
jest.mock('../../src/services/divisionAliasService', () => ({
  sameDivision: jest.fn((a, b) => Promise.resolve(a === b)),
  resolveAliases: jest.fn((code) => Promise.resolve([code])),
  scopeCoversDivision: jest.fn((_user, scope) => Promise.resolve(scope === 'all')),
  getUserDivisionCodes: jest.fn(() => Promise.resolve([])),
  invalidateAliasCache: jest.fn(),
}));

// Mock @rbm/lib/user-divisions for isFocalFor / isHodFor
jest.mock('@rbm/lib/user-divisions', () => {
  const actual = jest.requireActual('@rbm/lib/user-divisions');
  return {
    ...actual,
    getUserDivisionCodes: jest.fn((_knex, _userId, opts = {}) => {
      const roles = opts.roles || [];
      if (roles.includes('FOCAL')) return Promise.resolve(global.__focalDivisions || []);
      if (roles.includes('RESPONSIBLE')) return Promise.resolve(global.__hodDivisions || []);
      return Promise.resolve([]);
    }),
  };
});

const request = require('supertest');
const app = require('../../src/app');

function resetChain() {
  const c = sharedDb.__chain;
  c.first.mockReset().mockResolvedValue(undefined);
  c.insert.mockReset().mockResolvedValue([1]);
  c.update.mockReset().mockResolvedValue(1);
  c.del.mockReset().mockResolvedValue(1);
  c.delete.mockReset().mockResolvedValue(1);
  c.pluck.mockReset().mockResolvedValue([]);
  c.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
}

const CREATOR = { id: 10, email: 'focal@x.com', roles: ['FOCAL_PERSON'], bu_id: 1 };
const ACT_FOCAL = { id: 30, email: 'staff@x.com', roles: ['FOCAL_PERSON'], bu_id: 1 };

// H-5 required business fields every happy-path create must carry.
const { ACTIVITY_TYPES: AT } = require('@rbm/lib/enums');
const REQUIRED_FIELDS = {
  activity_type: Object.values(AT)[0],
  implementation_at_rcc: 1,
  budgeting_arrangement: 'Extramural',
  primary_funding_source: 'World Bank',
  grant_name: 'HSPA II',
  budget_main: 50000,
};

const PARENT_BROAD = {
  id: 7,
  node_type: 'BROAD_ACTIVITY',
  code: '1.1.1.01',
  responsible_division_code: 'DPHI',
};

beforeEach(() => {
  resetChain();
  global.__testUser = null;
  global.__rbacPermission = { allowed: true, scope: 'own' };
  global.__isAdmin = false;
  global.__focalDivisions = [];
  global.__hodDivisions = [];
});

// ─────────────────────────────────────────────────────────────────
//   POST /api/plan-nodes/specific-activity — focal eligibility
// ─────────────────────────────────────────────────────────────────
describe('POST /specific-activity — focal_user_id eligibility', () => {
  it('should return 422 when the focal is not a STAFF member of the division', async () => {
    global.__testUser = CREATOR;
    global.__focalDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce(PARENT_BROAD)
      // eligibility user lookup — PARTNER, not STAFF
      .mockResolvedValueOnce({ id: 55, user_type: 'PARTNER', status: 'ACTIVE' });

    const res = await request(app).post('/api/plan-nodes/specific-activity').send({
      title: 'Act', parent_id: 7, responsible_division_code: 'DPHI',
      focal_user_id: 55, ...REQUIRED_FIELDS,
    });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/active staff member of the responsible division/);
  });

  it('should return 422 when the focal is STAFF but assigned to another division', async () => {
    global.__testUser = CREATOR;
    global.__focalDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce(PARENT_BROAD)
      .mockResolvedValueOnce({ id: 55, user_type: 'STAFF', status: 'ACTIVE' });
    // membership lookup — different division only
    sharedDb.__chain.pluck.mockResolvedValueOnce(['OTHERDIV']);

    const res = await request(app).post('/api/plan-nodes/specific-activity').send({
      title: 'Act', parent_id: 7, responsible_division_code: 'DPHI',
      focal_user_id: 55, ...REQUIRED_FIELDS,
    });
    expect(res.status).toBe(422);
  });

  it('should persist focal_user_id when the focal is an eligible division STAFF', async () => {
    global.__testUser = CREATOR;
    global.__focalDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce(PARENT_BROAD)
      .mockResolvedValueOnce({ id: 55, user_type: 'STAFF', status: 'ACTIVE' })
      // created-row read-back (minimal: no enrich lookups)
      .mockResolvedValueOnce({ id: 123, node_type: 'SPECIFIC_ACTIVITY', status: 'DRAFT' });
    sharedDb.__chain.pluck
      .mockResolvedValueOnce(['DPHI']) // eligibility membership
      .mockResolvedValueOnce([]); // sibling codes for nextSpecificActivityCode
    sharedDb.__chain.insert.mockResolvedValueOnce([123]);

    const res = await request(app).post('/api/plan-nodes/specific-activity').send({
      title: 'Act', parent_id: 7, responsible_division_code: 'DPHI',
      focal_user_id: 55, ...REQUIRED_FIELDS,
    });
    expect(res.status).toBe(201);
    const insertArg = sharedDb.__chain.insert.mock.calls[0][0];
    expect(insertArg.focal_user_id).toBe(55);
  });
});

// ─────────────────────────────────────────────────────────────────
//   PATCH /api/plan-nodes/specific-activity/:id
// ─────────────────────────────────────────────────────────────────
describe('PATCH /specific-activity/:id — focal eligibility + focal rights', () => {
  it('should return 422 when the sent focal is not a member of the division', async () => {
    global.__testUser = CREATOR;
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42, node_type: 'SPECIFIC_ACTIVITY', status: 'DRAFT',
        created_by_user_id: CREATOR.id, responsible_division_code: 'DPHI', focal_user_id: null,
      })
      .mockResolvedValueOnce({ id: 55, user_type: 'STAFF', status: 'ACTIVE' });
    sharedDb.__chain.pluck.mockResolvedValueOnce(['OTHERDIV']);

    const res = await request(app).patch('/api/plan-nodes/specific-activity/42').send({ focal_user_id: 55 });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/active staff member of the responsible division/);
  });

  it('should let the activity focal (non-creator) edit and bump an APPROVED row to IN_REVIEW', async () => {
    global.__testUser = ACT_FOCAL;
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42, node_type: 'SPECIFIC_ACTIVITY', status: 'APPROVED',
        created_by_user_id: CREATOR.id, responsible_division_code: 'DPHI',
        focal_user_id: ACT_FOCAL.id,
      })
      .mockResolvedValueOnce({ id: 42, node_type: 'SPECIFIC_ACTIVITY', status: 'IN_REVIEW' });

    const res = await request(app).patch('/api/plan-nodes/specific-activity/42').send({ title: 'Edited' });
    expect(res.status).toBe(200);
    const updateArg = sharedDb.__chain.update.mock.calls[0][0];
    expect(updateArg.status).toBe('IN_REVIEW');
    expect(updateArg.reviewed_by_user_id).toBeNull();
  });

  it('should return 403 for a user who is neither creator, focal, HOD, nor admin', async () => {
    global.__testUser = ACT_FOCAL;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42, node_type: 'SPECIFIC_ACTIVITY', status: 'DRAFT',
      created_by_user_id: CREATOR.id, responsible_division_code: 'DPHI', focal_user_id: null,
    });

    const res = await request(app).patch('/api/plan-nodes/specific-activity/42').send({ title: 'Edited' });
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────
//   POST /api/plan-nodes/specific-activity/:id/submit
// ─────────────────────────────────────────────────────────────────
describe('POST /specific-activity/:id/submit — focal required + focal may submit', () => {
  it('should return 422 when the activity has no focal person', async () => {
    global.__testUser = CREATOR;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42, node_type: 'SPECIFIC_ACTIVITY', status: 'DRAFT',
      created_by_user_id: CREATOR.id, focal_user_id: null,
    });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/submit');
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/focal person is required before submitting/);
  });

  it('should let the activity focal (non-creator) submit', async () => {
    global.__testUser = ACT_FOCAL;
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42, node_type: 'SPECIFIC_ACTIVITY', status: 'DRAFT',
        created_by_user_id: CREATOR.id, focal_user_id: ACT_FOCAL.id,
      })
      .mockResolvedValueOnce(undefined) // no active PLAN_NODE template → degraded direct submit
      .mockResolvedValueOnce({ id: 42, status: 'IN_REVIEW' });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/submit');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_REVIEW');
  });

  it('should still return 403 for an unrelated non-admin user', async () => {
    global.__testUser = ACT_FOCAL;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42, node_type: 'SPECIFIC_ACTIVITY', status: 'DRAFT',
      created_by_user_id: CREATOR.id, focal_user_id: 77,
    });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/submit');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/only the creator or the activity focal person/);
  });
});

// ─────────────────────────────────────────────────────────────────
//   Approve stays HOD-only · cancel opens to the activity focal
// ─────────────────────────────────────────────────────────────────
describe('approve / cancel — activity focal boundaries', () => {
  it('should return 403 when the activity focal tries to approve', async () => {
    global.__testUser = ACT_FOCAL;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42, node_type: 'SPECIFIC_ACTIVITY', status: 'IN_REVIEW',
      created_by_user_id: CREATOR.id, responsible_division_code: 'DPHI',
      focal_user_id: ACT_FOCAL.id,
    });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/approve');
    expect(res.status).toBe(403);
  });

  it('should let the activity focal cancel a non-DRAFT row', async () => {
    global.__testUser = ACT_FOCAL;
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42, node_type: 'SPECIFIC_ACTIVITY', status: 'IN_REVIEW',
        created_by_user_id: CREATOR.id, focal_user_id: ACT_FOCAL.id,
      })
      .mockResolvedValueOnce({ id: 42, status: 'CANCELLED' });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/cancel');
    expect(res.status).toBe(200);
    const updateArg = sharedDb.__chain.update.mock.calls[0][0];
    expect(updateArg.status).toBe('CANCELLED');
  });
});

// ─────────────────────────────────────────────────────────────────
//   GET /api/plan-nodes/division-staff/:code
// ─────────────────────────────────────────────────────────────────
describe('GET /division-staff/:code', () => {
  it('should return 404 for an unknown division', async () => {
    global.__testUser = CREATOR;
    sharedDb.__chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app).get('/api/plan-nodes/division-staff/NOPE');
    expect(res.status).toBe(404);
  });

  it('should list ACTIVE STAFF members of the division', async () => {
    global.__testUser = CREATOR;
    sharedDb.__chain.first.mockResolvedValueOnce({ code: 'DPHI' });
    sharedDb.__chain.then.mockImplementationOnce((r) => Promise.resolve([
      { id: 55, first_name: 'Awa', last_name: 'Diop', email: 'awa@x.com' },
    ]).then(r));

    const res = await request(app).get('/api/plan-nodes/division-staff/DPHI');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([
      { id: 55, first_name: 'Awa', last_name: 'Diop', email: 'awa@x.com' },
    ]);
  });
});
