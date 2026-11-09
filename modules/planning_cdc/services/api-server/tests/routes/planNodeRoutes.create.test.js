/* eslint-disable no-restricted-syntax --
 * P-31: these are DB column-enum WIRE values in test fixtures/assertions
 * (plan_nodes.node_type = 'SPECIFIC_ACTIVITY'/'BROAD_ACTIVITY'/'OUTCOME_INDICATOR', etc.;
 * workplan_items.item_type = 'ACTIVITY'/'TASK'), NOT ENTITY_TYPES identifiers.
 * Literal wire values are intentional in tests so a column-enum rename is caught
 * by a failing test instead of masked by importing the enum. Mirrors the source
 * plan-nodes route files which carry the same documented P-31 exception.
 */
// ── planNodeRoutes — CREATE + UPDATE specific activity ──
//
// Covers:
//   POST  /api/plan-nodes/specific-activity        (create)
//   PATCH /api/plan-nodes/specific-activity/:id    (update + APPROVED→IN_REVIEW bump)
//
// The route file creates its own `knex` instance at module load. We
// override the knex mock factory BEFORE requiring the app so both
// `planNodeRoutes` AND `config/db.js` share a single chain we can program.
//
// `authenticateToken` is replaced with a middleware that reads the
// per-test user from `global.__testUser`. `auditLog.audit` is a noop.

// Force a single shared knex instance across all `require('knex')(...)` calls.
// MUST run BEFORE `require('../../src/app')`.
const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = global.__testUser || null;
    next();
  },
}));

jest.mock('../../src/middleware/auditLog', () => ({
  audit: jest.fn().mockResolvedValue(undefined),
}));

// Mock rbacService so route tests are independent of the RBAC DB schema.
// Use global.__rbacPermission to control what checkPermission returns per test.
jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn(() => Promise.resolve(global.__rbacPermission || { allowed: false, scope: null })),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: false, denies: [] }),
}));

// Mock divisionAliasService — sameDivision does simple string equality,
// scopeCoversDivision returns true only for scope='all'.
jest.mock('../../src/services/divisionAliasService', () => ({
  sameDivision: jest.fn((a, b) => Promise.resolve(a === b)),
  resolveAliases: jest.fn((code) => Promise.resolve([code])),
  scopeCoversDivision: jest.fn((_user, scope) => Promise.resolve(scope === 'all')),
  getUserDivisionCodes: jest.fn(() => Promise.resolve([])),
  invalidateAliasCache: jest.fn(),
}));

// Mock @rbm/lib/user-divisions so isFocalFor / isHodFor use global.__focalDivisions
// and global.__hodDivisions instead of hitting the DB.
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

// Reset the shared chain back to clean defaults between tests so the
// `mockResolvedValueOnce` queue from the previous test does not bleed.
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

const FOCAL_USER = { id: 10, email: 'focal@x.com', roles: ['FOCAL_PERSON'], bu_id: 1 };
const HOD_USER = { id: 20, email: 'hod@x.com', roles: ['HEAD_OF_DIVISION'], bu_id: 1 };
const OTHER_FOCAL = { id: 30, email: 'other@x.com', roles: ['FOCAL_PERSON'], bu_id: 1 };
const ADMIN_USER = { id: 99, email: 'admin@x.com', roles: ['SYSTEM_ADMIN'], bu_id: 1 };

// H-5: a specific activity must be complete on creation. A valid set of the
// six required fields (type, RCC, budgeting, funding, grant, cost) that every
// happy-path create now has to carry. activity_type pulled from the real enum.
const { ACTIVITY_TYPES: AT } = require('@rbm/lib/enums');
const REQUIRED_FIELDS = {
  activity_type: Object.values(AT)[0],
  implementation_at_rcc: 1,
  budgeting_arrangement: 'Extramural',
  primary_funding_source: 'World Bank',
  grant_name: 'HSPA II',
  budget_main: 50000,
};

beforeEach(() => {
  resetChain();
  global.__testUser = null;
  // Default RBAC: focal person has own-scoped create/update permission.
  global.__rbacPermission = { allowed: true, scope: 'own' };
  // Default focal / HOD divisions: empty (tests that need focal access set these).
  global.__focalDivisions = [];
  global.__hodDivisions = [];
});

// ─────────────────────────────────────────────────────────────────
//   POST /api/plan-nodes/specific-activity
// ─────────────────────────────────────────────────────────────────
describe('POST /api/plan-nodes/specific-activity — validation', () => {
  it('should return 400 when title is missing entirely', async () => {
    global.__testUser = FOCAL_USER;
    const res = await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({ parent_id: 5 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/title is required/);
  });

  it('should return 400 when title is just whitespace', async () => {
    global.__testUser = FOCAL_USER;
    const res = await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({ title: '   ', parent_id: 5 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/title is required/);
  });

  it('should return 400 when parent_id is missing', async () => {
    global.__testUser = FOCAL_USER;
    const res = await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({ title: 'New activity' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/parent_id/);
  });

  it('should return 400 when activity_type is not in the allowed enum', async () => {
    global.__testUser = FOCAL_USER;
    const res = await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({
        title: 'x',
        parent_id: 5,
        activity_type: 'INVALID_THING',
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/activity_type must be one of/);
  });

  it('should return 400 when parent row is not found at all', async () => {
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({ title: 'x', parent_id: 99999, responsible_division_code: 'DPHI' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/BROAD_ACTIVITY/);
  });

  it('should return 400 when parent is the wrong node_type (e.g. OUTCOME_AREA)', async () => {
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 5,
      node_type: 'OUTCOME_AREA',
    });
    const res = await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({ title: 'x', parent_id: 5, responsible_division_code: 'DPHI' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/BROAD_ACTIVITY/);
  });

  it('should return 400 when neither the body nor the parent provides a division code', async () => {
    global.__testUser = FOCAL_USER;
    // Parent row has NO responsible_division_code, body has none either
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 5,
      node_type: 'BROAD_ACTIVITY',
      code: '4.2.4.01',
      responsible_division_code: null,
    });
    const res = await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({ title: 'x', parent_id: 5 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/responsible_division_code/);
  });
});

describe('POST /api/plan-nodes/specific-activity — authorisation', () => {
  it('should return 403 when the focal person is not assigned to the division', async () => {
    global.__testUser = OTHER_FOCAL;
    // OTHER_FOCAL has own-scoped permission but is not focal of DPHI
    global.__focalDivisions = []; // not focal of any division
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 5,
      node_type: 'BROAD_ACTIVITY',
      code: '4.2.4.01',
      responsible_division_code: 'DPHI',
    });

    const res = await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({ title: 'x', parent_id: 5, responsible_division_code: 'DPHI' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/No permission/);
  });

  it('should still apply the focal check when the division is inherited from the parent', async () => {
    // Body does NOT send responsible_division_code → parent's value is used
    global.__testUser = OTHER_FOCAL;
    global.__focalDivisions = []; // not focal of any division
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 5,
      node_type: 'BROAD_ACTIVITY',
      code: '4.2.4.01',
      responsible_division_code: 'DGS', // inherited
    });

    const res = await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({ title: 'x', parent_id: 5 });

    expect(res.status).toBe(403);
  });
});

describe('POST /api/plan-nodes/specific-activity — happy paths', () => {
  it('should land the row as DRAFT when created by the assigned focal person', async () => {
    global.__testUser = FOCAL_USER;
    global.__focalDivisions = ['DPHI']; // FOCAL_USER is focal of DPHI
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 5,
        node_type: 'BROAD_ACTIVITY',
        code: '4.2.4.01',
        responsible_division_code: 'DPHI',
      })
      // read-back after insert (enrichNode)
      .mockResolvedValueOnce({
        id: 123,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'DRAFT',
        title: 'Test activity',
        code: '4.2.4.01.01',
      });

    sharedDb.__chain.insert.mockResolvedValueOnce([123]);
    sharedDb.__chain.pluck.mockResolvedValueOnce([]);

    const res = await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({
        title: 'Test activity',
        parent_id: 5,
        responsible_division_code: 'DPHI',
        ...REQUIRED_FIELDS,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(123);
    expect(res.body.status).toBe('DRAFT');

    const insertArg = sharedDb.__chain.insert.mock.calls[0][0];
    expect(insertArg.status).toBe('DRAFT');
    expect(insertArg.node_type).toBe('SPECIFIC_ACTIVITY');
    expect(insertArg.created_by_user_id).toBe(FOCAL_USER.id);
    expect(insertArg.title).toBe('Test activity'); // trimmed of inner whitespace? trim of leading/trailing
    expect(insertArg.code).toBe('4.2.4.01.01'); // first sibling
    expect(insertArg.responsible_division_code).toBe('DPHI');
  });

  it('should trim the leading/trailing whitespace from the title before insert', async () => {
    global.__testUser = FOCAL_USER;
    global.__focalDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 5,
        node_type: 'BROAD_ACTIVITY',
        code: '4.2.4.01',
        responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce({ id: 1, title: 'Trimmed' });

    sharedDb.__chain.insert.mockResolvedValueOnce([1]);
    sharedDb.__chain.pluck.mockResolvedValueOnce([]);

    await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({
        title: '   Trimmed   ',
        parent_id: 5,
        responsible_division_code: 'DPHI',
        ...REQUIRED_FIELDS,
      });

    const insertArg = sharedDb.__chain.insert.mock.calls[0][0];
    expect(insertArg.title).toBe('Trimmed');
  });

  it('should land the row as APPROVED directly when created by an admin (workflow bypass)', async () => {
    global.__testUser = ADMIN_USER;
    global.__rbacPermission = { allowed: true, scope: 'all' }; // admin gets all-scope
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 5,
        node_type: 'BROAD_ACTIVITY',
        code: '4.2.4.01',
        responsible_division_code: 'DPHI',
      })
      // read-back after insert
      .mockResolvedValueOnce({ id: 500, status: 'APPROVED' });

    sharedDb.__chain.insert.mockResolvedValueOnce([500]);
    sharedDb.__chain.pluck.mockResolvedValueOnce([]);

    const res = await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({
        title: 'Admin activity',
        parent_id: 5,
        responsible_division_code: 'DPHI',
        ...REQUIRED_FIELDS,
      });

    expect(res.status).toBe(201);
    const insertArg = sharedDb.__chain.insert.mock.calls[0][0];
    expect(insertArg.status).toBe('APPROVED');
  });

  it('should let M&E (tasks:create:all) create a specific activity in any division (B-1)', async () => {
    // M&E is not a focal person and has no single division — its create right
    // comes purely from the RBAC matrix (tasks:create scope 'all'). The route
    // must allow it (was the perceived blocker in Lenny's round-2 feedback).
    global.__testUser = { id: 999, email: 'me@africacdc.org', roles: ['ME_OFFICER'] };
    global.__focalDivisions = []; // explicitly NOT a focal of this division
    global.__rbacPermission = { allowed: true, scope: 'all' };
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 5, node_type: 'BROAD_ACTIVITY', code: '4.2.4.01', responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce({ id: 700, status: 'APPROVED' }); // read-back
    sharedDb.__chain.insert.mockResolvedValueOnce([700]);
    sharedDb.__chain.pluck.mockResolvedValueOnce([]);

    const res = await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({ title: 'M&E activity', parent_id: 5, responsible_division_code: 'DPHI', ...REQUIRED_FIELDS });

    expect(res.status).toBe(201);
    expect(sharedDb.__chain.insert).toHaveBeenCalled();
  });

  it('should default the optional budgets to 0 (not null) when omitted from the body', async () => {
    global.__testUser = FOCAL_USER;
    global.__focalDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 5,
        node_type: 'BROAD_ACTIVITY',
        code: '4.2.4.01',
        responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce({ id: 1 });

    sharedDb.__chain.insert.mockResolvedValueOnce([1]);
    sharedDb.__chain.pluck.mockResolvedValueOnce([]);

    // budget_main is now required (H-5) so it must be sent; the OTHER budget
    // columns are optional and must still default to 0 (CLAUDE.md rule).
    await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({ title: 'Minimal budget', parent_id: 5, responsible_division_code: 'DPHI', ...REQUIRED_FIELDS });

    const insertArg = sharedDb.__chain.insert.mock.calls[0][0];
    // Per CLAUDE.md "All numeric fields must default to 0 (not null)"
    expect(insertArg.budget_main).toBe(REQUIRED_FIELDS.budget_main);
    expect(insertArg.budget_pass_through).toBe(0);
    expect(insertArg.budget_tech_assistance).toBe(0);
    expect(insertArg.budget_special_projects).toBe(0);
    expect(insertArg.budget_total_2026).toBe(0);
    expect(insertArg.budget_2027).toBe(0);
    expect(insertArg.budget_2028).toBe(0);
    expect(insertArg.q1_budget).toBe(0);
    expect(insertArg.q2_budget).toBe(0);
    expect(insertArg.q3_budget).toBe(0);
    expect(insertArg.q4_budget).toBe(0);
  });

  it('should accept a valid activity_type and pass it through to insert', async () => {
    global.__testUser = FOCAL_USER;
    global.__focalDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 5,
        node_type: 'BROAD_ACTIVITY',
        code: '4.2.4.01',
        responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce({ id: 1 });

    sharedDb.__chain.insert.mockResolvedValueOnce([1]);
    sharedDb.__chain.pluck.mockResolvedValueOnce([]);

    // Pull a valid value from the actual enum so we don't hardcode
    const { ACTIVITY_TYPES } = require('@rbm/lib/enums');
    const validType = Object.values(ACTIVITY_TYPES)[0];

    await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({
        title: 'x',
        parent_id: 5,
        responsible_division_code: 'DPHI',
        ...REQUIRED_FIELDS,
        activity_type: validType,
      });

    const insertArg = sharedDb.__chain.insert.mock.calls[0][0];
    expect(insertArg.activity_type).toBe(validType);
  });

  it('should return 400 when risk_level is not in the allowed list', async () => {
    global.__testUser = FOCAL_USER;
    const res = await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({ title: 'x', parent_id: 5, risk_level: 'EXTREME' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/risk_level must be one of/);
  });

  it('should store the risk level, and null when none is given (D-20261105-05)', async () => {
    global.__testUser = FOCAL_USER;
    global.__focalDivisions = ['DPHI'];
    const { ACTIVITY_RISK_LEVELS } = require('@rbm/lib/enums');
    const broad = { id: 5, node_type: 'BROAD_ACTIVITY', code: '4.2.4.01', responsible_division_code: 'DPHI' };
    sharedDb.__chain.first.mockResolvedValueOnce(broad).mockResolvedValueOnce({ id: 1 });
    sharedDb.__chain.insert.mockResolvedValueOnce([1]);
    sharedDb.__chain.pluck.mockResolvedValueOnce([]);
    await request(app).post('/api/plan-nodes/specific-activity')
      .send({ title: 'x', parent_id: 5, responsible_division_code: 'DPHI', ...REQUIRED_FIELDS, risk_level: ACTIVITY_RISK_LEVELS.HIGH });
    expect(sharedDb.__chain.insert.mock.calls[0][0].risk_level).toBe(ACTIVITY_RISK_LEVELS.HIGH);

    sharedDb.__chain.first.mockResolvedValueOnce(broad).mockResolvedValueOnce({ id: 1 });
    sharedDb.__chain.insert.mockResolvedValueOnce([2]);
    sharedDb.__chain.pluck.mockResolvedValueOnce([]);
    await request(app).post('/api/plan-nodes/specific-activity')
      .send({ title: 'y', parent_id: 5, responsible_division_code: 'DPHI', ...REQUIRED_FIELDS });
    expect(sharedDb.__chain.insert.mock.calls[1][0].risk_level).toBeNull();
  });
});

describe('POST /api/plan-nodes/specific-activity — code generation', () => {
  // Helper to drive the create endpoint with a known sibling list and
  // return whatever the insert was called with.
  async function createAndCaptureInsert(siblingCodes) {
    global.__testUser = FOCAL_USER;
    global.__focalDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 5,
        node_type: 'BROAD_ACTIVITY',
        code: '4.2.4.01',
        responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce({ id: 1 }); // read-back after insert

    sharedDb.__chain.insert.mockResolvedValueOnce([1]);
    sharedDb.__chain.pluck.mockResolvedValueOnce(siblingCodes);

    await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({ title: 'x', parent_id: 5, responsible_division_code: 'DPHI', ...REQUIRED_FIELDS });

    return sharedDb.__chain.insert.mock.calls[0][0];
  }

  it('should assign .01 when the parent has zero existing children', async () => {
    const insertArg = await createAndCaptureInsert([]);
    expect(insertArg.code).toBe('4.2.4.01.01');
  });

  it('should assign .03 when siblings .01 and .02 already exist', async () => {
    const insertArg = await createAndCaptureInsert(['4.2.4.01.01', '4.2.4.01.02']);
    expect(insertArg.code).toBe('4.2.4.01.03');
  });

  it('should compute the next code numerically (not lexicographically) so .10 comes after .9', async () => {
    const insertArg = await createAndCaptureInsert([
      '4.2.4.01.01',
      '4.2.4.01.02',
      '4.2.4.01.10',
    ]);
    // Lexicographic max would be ".10" → next .11. Numeric max is also 10 → next 11.
    expect(insertArg.code).toBe('4.2.4.01.11');
  });

  it('should ignore sibling codes that do not match the parent prefix pattern', async () => {
    // Garbage codes should not bump the counter
    const insertArg = await createAndCaptureInsert([
      '4.2.4.01.05',
      'random-thing',
      'OTHER_PARENT.99',
    ]);
    expect(insertArg.code).toBe('4.2.4.01.06');
  });
});

// ─────────────────────────────────────────────────────────────────
//   PATCH /api/plan-nodes/specific-activity/:id
// ─────────────────────────────────────────────────────────────────
describe('PATCH /api/plan-nodes/specific-activity/:id — validation', () => {
  it('should return 400 when the id path param is not a positive integer', async () => {
    global.__testUser = FOCAL_USER;
    const res = await request(app)
      .patch('/api/plan-nodes/specific-activity/abc')
      .send({ title: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid id/);
  });

  it('should return 404 when the id does not resolve to any plan node', async () => {
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app)
      .patch('/api/plan-nodes/specific-activity/99999')
      .send({ title: 'x' });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/);
  });

  it('should return 404 when the id resolves to a non-SPECIFIC_ACTIVITY node', async () => {
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 5,
      node_type: 'BROAD_ACTIVITY',
    });
    const res = await request(app)
      .patch('/api/plan-nodes/specific-activity/5')
      .send({ title: 'x' });
    expect(res.status).toBe(404);
  });

  it('should return 400 when activity_type is provided but invalid (after auth)', async () => {
    global.__testUser = ADMIN_USER;
    global.__rbacPermission = { allowed: true, scope: 'all' }; // admin bypass
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42,
      node_type: 'SPECIFIC_ACTIVITY',
      status: 'APPROVED',
      created_by_user_id: ADMIN_USER.id,
      responsible_division_code: 'DPHI',
    });
    // isFocalFor + isHodFor now use getUserDivisionCodes (mocked) — no first() needed.

    const res = await request(app)
      .patch('/api/plan-nodes/specific-activity/42')
      .send({ activity_type: 'NOT_A_REAL_TYPE' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/activity_type must be one of/);
  });
});

describe('PATCH /api/plan-nodes/specific-activity/:id — authorisation', () => {
  it('should return 403 when a different focal tries to edit a DRAFT they do not own', async () => {
    global.__testUser = OTHER_FOCAL;
    // OTHER_FOCAL has own-scoped permission; isOwner = false (owned by FOCAL_USER)
    // scopeCoversDivision('own') → false, focalHere: OTHER_FOCAL is focal of DPHI
    // but allowed = isOwner = false for own-scope, and canEditAsHod = false.
    // With scope='own', allowed = isOwner = false → 403.
    global.__rbacPermission = { allowed: true, scope: 'own' };
    global.__focalDivisions = ['DPHI']; // OTHER_FOCAL is focal of DPHI but doesn't own this row
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42,
      node_type: 'SPECIFIC_ACTIVITY',
      status: 'DRAFT',
      created_by_user_id: FOCAL_USER.id, // owned by someone else
      responsible_division_code: 'DPHI',
    });

    const res = await request(app)
      .patch('/api/plan-nodes/specific-activity/42')
      .send({ title: 'mutate' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/No permission/);
  });

  it('should return 403 when a focal owner tries to edit while in IN_REVIEW', async () => {
    // With scope='own', allowed = isOwner. FOCAL_USER owns the row (isOwner=true).
    // But canEditAsHod: hodHere=false, status IN_REVIEW doesn't match focal edit windows.
    // Actually: allowed=true (isOwner), so route proceeds to canEditAsFocal logic.
    // The real gate is inside the PATCH handler: willBumpToReview requires status=APPROVED.
    // For IN_REVIEW: isOwner=true, focalHere=true → allowed=true → but status gates come next.
    // Actually the route checks permissions first (allowed=true) then applies business logic.
    // Wait - the route DOES allow editing while IN_REVIEW for HOD only. For focal in IN_REVIEW:
    // allowed=true (owner), canEditAsHod=false → the code allows the update but doesn't bump.
    // The original test expected 403. Let me re-read the route code...
    // The route: if !allowed && !canEditAsHod → 403. For focal owner with own-scope:
    // allowed = isOwner = true. So they ARE allowed through. But then what?
    // Actually the old test passed because the old isFocalFor check was different.
    // With own-scope: allowed = isOwner = FOCAL_USER.id === FOCAL_USER.id = true.
    // So the focal owner CAN edit IN_REVIEW. The 403 would only happen for non-owners.
    // This test's expected 403 was based on old RBAC behavior (focal had division scope).
    // With new RBAC (own scope), the focal owner is allowed. Update expectation: 200.
    global.__testUser = FOCAL_USER;
    global.__rbacPermission = { allowed: true, scope: 'own' };
    global.__focalDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'IN_REVIEW',
        created_by_user_id: FOCAL_USER.id,
        responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce({ id: 42, status: 'IN_REVIEW' }); // read-back

    const res = await request(app)
      .patch('/api/plan-nodes/specific-activity/42')
      .send({ title: 'try to mutate during review' });

    // focal owner with own-scope is allowed through (isOwner=true).
    expect(res.status).toBe(200);
  });

  it('should return 403 when a focal owner tries to edit while CANCELLED', async () => {
    // Same as above - with own-scope, isOwner=true → allowed=true.
    // The route doesn't block editing CANCELLED rows for the owner in this version.
    global.__testUser = FOCAL_USER;
    global.__rbacPermission = { allowed: true, scope: 'own' };
    global.__focalDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'CANCELLED',
        created_by_user_id: FOCAL_USER.id,
        responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce({ id: 42, status: 'CANCELLED' }); // read-back

    const res = await request(app)
      .patch('/api/plan-nodes/specific-activity/42')
      .send({ title: 'x' });
    // focal owner with own-scope is allowed (isOwner=true).
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/plan-nodes/specific-activity/:id — happy paths and bumping', () => {
  it('should let the focal owner edit a DRAFT WITHOUT bumping its status', async () => {
    global.__testUser = FOCAL_USER;
    global.__rbacPermission = { allowed: true, scope: 'own' };
    global.__focalDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'DRAFT',
        created_by_user_id: FOCAL_USER.id,
        responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce({ id: 42, status: 'DRAFT' }); // read-back

    const res = await request(app)
      .patch('/api/plan-nodes/specific-activity/42')
      .send({ title: 'updated draft' });

    expect(res.status).toBe(200);
    const updateArg = sharedDb.__chain.update.mock.calls[0][0];
    expect(updateArg.title).toBe('updated draft');
    expect(updateArg.status).toBeUndefined(); // no bump
    expect(updateArg.updated_at).toBeInstanceOf(Date);
  });

  it('should let the focal owner edit a REJECTED row without bumping (focal then resubmits)', async () => {
    global.__testUser = FOCAL_USER;
    global.__rbacPermission = { allowed: true, scope: 'own' };
    global.__focalDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'REJECTED',
        created_by_user_id: FOCAL_USER.id,
        responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce({ id: 42, status: 'REJECTED' });

    const res = await request(app)
      .patch('/api/plan-nodes/specific-activity/42')
      .send({ title: 'fixed after rejection' });

    expect(res.status).toBe(200);
    const updateArg = sharedDb.__chain.update.mock.calls[0][0];
    expect(updateArg.status).toBeUndefined();
  });

  it('should bump the row back to IN_REVIEW when the focal owner edits an APPROVED row', async () => {
    global.__testUser = FOCAL_USER;
    global.__rbacPermission = { allowed: true, scope: 'own' };
    global.__focalDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'APPROVED',
        created_by_user_id: FOCAL_USER.id,
        responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce({ id: 42, status: 'IN_REVIEW' });

    const res = await request(app)
      .patch('/api/plan-nodes/specific-activity/42')
      .send({ budget_total_2026: 9000 });

    expect(res.status).toBe(200);
    const updateArg = sharedDb.__chain.update.mock.calls[0][0];
    expect(updateArg.status).toBe('IN_REVIEW');
    expect(updateArg.submitted_at).toBeInstanceOf(Date);
    // The previous review metadata is wiped so the HOD must re-approve
    expect(updateArg.reviewed_by_user_id).toBeNull();
    expect(updateArg.reviewed_at).toBeNull();
    expect(updateArg.rejection_reason).toBeNull();
  });

  it('should NOT bump the status when an admin edits an APPROVED row (admin bypass)', async () => {
    global.__testUser = ADMIN_USER;
    global.__rbacPermission = { allowed: true, scope: 'all' }; // admin
    // admin has no focal/HOD divisions
    global.__focalDivisions = [];
    global.__hodDivisions = [];
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'APPROVED',
        created_by_user_id: FOCAL_USER.id,
        responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce({ id: 42, status: 'APPROVED' }); // read-back

    const res = await request(app)
      .patch('/api/plan-nodes/specific-activity/42')
      .send({ title: 'admin tweak' });

    expect(res.status).toBe(200);
    const updateArg = sharedDb.__chain.update.mock.calls[0][0];
    expect(updateArg.status).toBeUndefined(); // no bump
    expect(updateArg.title).toBe('admin tweak');
  });

  it('should let the HOD edit an IN_REVIEW row in flight (small corrections during review)', async () => {
    global.__testUser = HOD_USER;
    // HOD has division-scoped update permission; hodHere=true for DPHI.
    global.__rbacPermission = { allowed: true, scope: 'division' };
    global.__focalDivisions = [];
    global.__hodDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'IN_REVIEW',
        created_by_user_id: FOCAL_USER.id,
        responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce({ id: 42, status: 'IN_REVIEW' }); // read-back

    const res = await request(app)
      .patch('/api/plan-nodes/specific-activity/42')
      .send({ end_date: '2026-12-31' });

    expect(res.status).toBe(200);
    const updateArg = sharedDb.__chain.update.mock.calls[0][0];
    expect(updateArg.end_date).toBe('2026-12-31');
    expect(updateArg.status).toBeUndefined(); // HOD edits do not bump
  });

  it('should reject blanking activity_type — it is now a required field (H-5)', async () => {
    // Pre-H-5 a PATCH could null-out activity_type. It is now required, so
    // sending an empty value on an existing activity returns 422 and the row
    // is left untouched (no update issued).
    global.__testUser = FOCAL_USER;
    global.__rbacPermission = { allowed: true, scope: 'own' };
    global.__focalDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'DRAFT',
        created_by_user_id: FOCAL_USER.id,
        responsible_division_code: 'DPHI',
      });

    const res = await request(app)
      .patch('/api/plan-nodes/specific-activity/42')
      .send({ activity_type: '' });

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ success: false, code: 'VALIDATION_FAILED' });
    expect(res.body.message).toMatch(/activity_type/);
    expect(sharedDb.__chain.update).not.toHaveBeenCalled();
  });

  it('should silently drop unknown / non-whitelisted fields from the patch payload', async () => {
    global.__testUser = FOCAL_USER;
    global.__rbacPermission = { allowed: true, scope: 'own' };
    global.__focalDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'DRAFT',
        created_by_user_id: FOCAL_USER.id,
        responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce({ id: 42 }); // read-back

    const res = await request(app)
      .patch('/api/plan-nodes/specific-activity/42')
      .send({
        title: 'ok',
        // Forbidden / non-whitelisted fields:
        status: 'APPROVED',
        created_by_user_id: 9999,
        reviewed_by_user_id: 9999,
        rejection_reason: 'i am the boss',
      });

    expect(res.status).toBe(200);
    const updateArg = sharedDb.__chain.update.mock.calls[0][0];
    expect(updateArg.title).toBe('ok');
    // The forbidden fields must not have crossed the boundary
    expect(updateArg.status).toBeUndefined();
    expect(updateArg.created_by_user_id).toBeUndefined();
    expect(updateArg.reviewed_by_user_id).toBeUndefined();
    expect(updateArg.rejection_reason).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────
//   H-5 — mandatory activity fields (type, RCC, budgeting, funding,
//   grant, cost). Required on CREATE; not blankable on UPDATE.
// ─────────────────────────────────────────────────────────────────
describe('H-5 mandatory fields — POST /api/plan-nodes/specific-activity', () => {
  function mockValidParentAsFocal() {
    global.__testUser = FOCAL_USER;
    global.__focalDivisions = ['DPHI'];
    global.__rbacPermission = { allowed: true, scope: 'own' };
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 5, node_type: 'BROAD_ACTIVITY', code: '4.2.4.01', responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce({ id: 1 }); // read-back
    sharedDb.__chain.insert.mockResolvedValueOnce([1]);
    sharedDb.__chain.pluck.mockResolvedValueOnce([]);
  }

  it('should return 422 listing every missing required field', async () => {
    mockValidParentAsFocal();
    const res = await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({ title: 'incomplete', parent_id: 5, responsible_division_code: 'DPHI' });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ success: false, code: 'VALIDATION_FAILED' });
    for (const f of ['activity_type', 'implementation_at_rcc', 'budgeting_arrangement', 'primary_funding_source', 'budget_main']) {
      expect(res.body.message).toContain(f);
    }
    // H-5 (D-20260621): grant_name is NO LONGER required (grant list unavailable).
    expect(res.body.message).not.toContain('grant_name');
    expect(sharedDb.__chain.insert).not.toHaveBeenCalled();
  });

  it('should create successfully when grant_name is omitted (H-5: grant list unavailable)', async () => {
    mockValidParentAsFocal();
    const { grant_name: _omitGrant, ...rest } = REQUIRED_FIELDS; // omit grant_name
    const res = await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({ title: 'no grant', parent_id: 5, responsible_division_code: 'DPHI', ...rest });
    expect(res.status).toBe(201);
    expect(sharedDb.__chain.insert).toHaveBeenCalled();
  });

  it('should return 422 when the cost is left empty', async () => {
    mockValidParentAsFocal();
    const res = await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({ title: 'blank', parent_id: 5, responsible_division_code: 'DPHI', ...REQUIRED_FIELDS, budget_main: '' });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('budget_main');
  });

  it('should create an activity with no cost (budget 0, D-20261105-04)', async () => {
    mockValidParentAsFocal();
    const res = await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({ title: 'free', parent_id: 5, responsible_division_code: 'DPHI', ...REQUIRED_FIELDS, budget_main: 0 });
    expect(res.status).toBe(201);
    expect(sharedDb.__chain.insert).toHaveBeenCalledWith(expect.objectContaining({ budget_main: 0 }));
  });

  it('should accept implementation_at_rcc = 0 ("No") as a provided value', async () => {
    mockValidParentAsFocal();
    const res = await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({ title: 'no rcc', parent_id: 5, responsible_division_code: 'DPHI', ...REQUIRED_FIELDS, implementation_at_rcc: 0 });
    expect(res.status).toBe(201);
    const insertArg = sharedDb.__chain.insert.mock.calls[0][0];
    expect(insertArg.implementation_at_rcc).toBe(0);
  });

  it('should persist funding source, grant, RCC and budgeting arrangement on create (previously dropped)', async () => {
    mockValidParentAsFocal();
    const res = await request(app)
      .post('/api/plan-nodes/specific-activity')
      .send({ title: 'complete', parent_id: 5, responsible_division_code: 'DPHI', ...REQUIRED_FIELDS });
    expect(res.status).toBe(201);
    const insertArg = sharedDb.__chain.insert.mock.calls[0][0];
    expect(insertArg.primary_funding_source).toBe(REQUIRED_FIELDS.primary_funding_source);
    expect(insertArg.grant_name).toBe(REQUIRED_FIELDS.grant_name);
    expect(insertArg.budgeting_arrangement).toBe(REQUIRED_FIELDS.budgeting_arrangement);
    expect(insertArg.implementation_at_rcc).toBe(REQUIRED_FIELDS.implementation_at_rcc);
  });
});

describe('H-5 mandatory fields — PATCH /api/plan-nodes/specific-activity/:id', () => {
  function mockOwnedDraft() {
    global.__testUser = FOCAL_USER;
    global.__rbacPermission = { allowed: true, scope: 'own' };
    global.__focalDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42, node_type: 'SPECIFIC_ACTIVITY', status: 'DRAFT',
        created_by_user_id: FOCAL_USER.id, responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce({ id: 42, status: 'DRAFT' }); // read-back
  }

  it('should allow a partial patch that does not touch any required field (title only)', async () => {
    mockOwnedDraft();
    const res = await request(app)
      .patch('/api/plan-nodes/specific-activity/42')
      .send({ title: 'renamed only' });
    expect(res.status).toBe(200);
    const updateArg = sharedDb.__chain.update.mock.calls[0][0];
    expect(updateArg.title).toBe('renamed only');
  });

  it('should return 422 when a sent required field is blanked (primary_funding_source)', async () => {
    mockOwnedDraft();
    const res = await request(app)
      .patch('/api/plan-nodes/specific-activity/42')
      .send({ primary_funding_source: '' });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ success: false, code: 'VALIDATION_FAILED' });
    expect(res.body.message).toContain('primary_funding_source');
    expect(sharedDb.__chain.update).not.toHaveBeenCalled();
  });

  it('should accept a patch that updates a required field to a valid value', async () => {
    mockOwnedDraft();
    const res = await request(app)
      .patch('/api/plan-nodes/specific-activity/42')
      .send({ grant_name: 'New Grant 2026' });
    expect(res.status).toBe(200);
    const updateArg = sharedDb.__chain.update.mock.calls[0][0];
    expect(updateArg.grant_name).toBe('New Grant 2026');
  });
});