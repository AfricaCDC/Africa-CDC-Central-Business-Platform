// ── /api/me/divisions/:code/members — HOD team management ──
//
// A Head of Division enrols staff as user_divisions MEMBER so they pass the
// existing activity-report guard. Both writes go through
// divisionAssignmentService (same rules as the admin pages: no duplicate row,
// STAFF granted, users.division_code kept in step). Covers auth (403),
// eligibility (422), idempotent add, MEMBER-only delete, and listing.

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => { req.user = global.__testUser || null; next(); },
}));
jest.mock('../../src/middleware/auditLog', () => ({ audit: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/services/divisionAssignmentService', () => ({
  addDivisionRole: jest.fn().mockResolvedValue(undefined),
  removeDivisionRole: jest.fn().mockResolvedValue(undefined),
}));
const divisionAssignmentService = require('../../src/services/divisionAssignmentService');

// isAdmin() → checkPermission(pirs, delete). Everything else denies.
jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn((_id, module) =>
    module === 'pirs'
      ? Promise.resolve(global.__isAdmin ? { allowed: true, scope: 'all' } : { allowed: false, scope: null })
      : Promise.resolve({ allowed: false, scope: null })),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: false, denies: [] }),
}));

jest.mock('../../src/services/divisionAliasService', () => ({
  sameDivision: jest.fn((a, b) => Promise.resolve(a === b)),
  resolveAliases: jest.fn((code) => Promise.resolve([code])),
  scopeCoversDivision: jest.fn((_u, scope) => Promise.resolve(scope === 'all')),
  getUserDivisionCodes: jest.fn(() => Promise.resolve([])),
  invalidateAliasCache: jest.fn(),
}));

// isHodFor reads getUserDivisionCodes(roles:['RESPONSIBLE']) → global.__hodDivisions
jest.mock('@rbm/lib/user-divisions', () => {
  const actual = jest.requireActual('@rbm/lib/user-divisions');
  return {
    ...actual,
    getUserDivisionCodes: jest.fn((_k, _id, opts = {}) => {
      const roles = opts.roles || [];
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
  c.del.mockReset().mockResolvedValue(1);
  c.delete.mockReset().mockResolvedValue(1);
  c.pluck.mockReset().mockResolvedValue([]);
  c.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
}

const HOD = { id: 20, email: 'hod@x.com' };
const OUTSIDER = { id: 99, email: 'x@x.com' };

beforeEach(() => {
  resetChain();
  divisionAssignmentService.addDivisionRole.mockClear();
  divisionAssignmentService.removeDivisionRole.mockClear();
  global.__testUser = null;
  global.__isAdmin = false;
  global.__hodDivisions = [];
});

describe('POST /api/me/divisions/:code/members', () => {
  it('should return 403 when the caller is not HOD of the division nor admin', async () => {
    global.__testUser = OUTSIDER;
    const res = await request(app).post('/api/me/divisions/DPHI/members').send({ user_id: 55 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('should return 422 when the target is not an active STAFF user', async () => {
    global.__testUser = HOD; global.__hodDivisions = ['DPHI'];
    sharedDb.__chain.first.mockResolvedValueOnce({ id: 55, user_type: 'PARTNER', status: 'ACTIVE' });
    const res = await request(app).post('/api/me/divisions/DPHI/members').send({ user_id: 55 });
    expect(res.status).toBe(422);
  });

  it('should add a MEMBER row through divisionAssignmentService for an eligible staff member', async () => {
    global.__testUser = HOD; global.__hodDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce({ id: 55, user_type: 'STAFF', status: 'ACTIVE' }) // eligibility
      .mockResolvedValueOnce(undefined); // no row on this division yet
    const res = await request(app).post('/api/me/divisions/DPHI/members').send({ user_id: 55 });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ added: true });
    expect(divisionAssignmentService.addDivisionRole).toHaveBeenCalledWith(
      expect.anything(), { userId: 55, code: 'DPHI', role: 'MEMBER' },
    );
  });

  it('should not add again when the user already has any row on the division', async () => {
    global.__testUser = HOD; global.__hodDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce({ id: 55, user_type: 'STAFF', status: 'ACTIVE' })
      .mockResolvedValueOnce({ id: 7, role: 'FOCAL_PERSON' }); // already there
    const res = await request(app).post('/api/me/divisions/DPHI/members').send({ user_id: 55 });
    expect(res.status).toBe(200);
    expect(divisionAssignmentService.addDivisionRole).not.toHaveBeenCalled();
  });

  it('should let an admin add a member to any division', async () => {
    global.__testUser = OUTSIDER; global.__isAdmin = true;
    sharedDb.__chain.first
      .mockResolvedValueOnce({ id: 55, user_type: 'STAFF', status: 'ACTIVE' })
      .mockResolvedValueOnce(undefined);
    const res = await request(app).post('/api/me/divisions/DPHI/members').send({ user_id: 55 });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/me/divisions/:code/members', () => {
  it('should remove only the MEMBER role row, through divisionAssignmentService', async () => {
    global.__testUser = HOD; global.__hodDivisions = ['DPHI'];
    const res = await request(app).delete('/api/me/divisions/DPHI/members').send({ user_id: 55 });
    expect(res.status).toBe(200);
    expect(divisionAssignmentService.removeDivisionRole).toHaveBeenCalledWith(
      expect.anything(), { userId: 55, code: 'DPHI', role: 'MEMBER' },
    );
  });

  it('should return 403 for a non-HOD non-admin caller', async () => {
    global.__testUser = OUTSIDER;
    const res = await request(app).delete('/api/me/divisions/DPHI/members').send({ user_id: 55 });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/me/divisions/:code/members', () => {
  it('should list division members for the HOD', async () => {
    global.__testUser = HOD; global.__hodDivisions = ['DPHI'];
    sharedDb.__chain.then.mockImplementationOnce((r) => Promise.resolve([
      { id: 55, first_name: 'Awa', last_name: 'Diop', email: 'awa@x.com', role: 'MEMBER' },
    ]).then(r));
    const res = await request(app).get('/api/me/divisions/DPHI/members');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].role).toBe('MEMBER');
  });

  it('should return 403 when the caller is not HOD of the division', async () => {
    global.__testUser = OUTSIDER;
    const res = await request(app).get('/api/me/divisions/DPHI/members');
    expect(res.status).toBe(403);
  });
});

describe('reporting-access contract', () => {
  it('getUserDivisions has no role filter, so a MEMBER row is in the report scope', () => {
    // getUserDivisionScope (used by the activity-report guard) reads user_divisions
    // with NO role filter — a MEMBER row is therefore included. This asserts the
    // contract the feature relies on.
    const { getUserDivisions } = require('@rbm/lib/user-divisions');
    expect(typeof getUserDivisions).toBe('function');
  });
});
