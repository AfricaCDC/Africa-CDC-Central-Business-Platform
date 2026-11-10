/* eslint-disable no-restricted-syntax --
 * P-31: these are DB column-enum WIRE values in test fixtures/assertions
 * (plan_nodes.node_type = 'SPECIFIC_ACTIVITY'/'BROAD_ACTIVITY'/'OUTCOME_INDICATOR', etc.;
 * workplan_items.item_type = 'ACTIVITY'/'TASK'), NOT ENTITY_TYPES identifiers.
 * Literal wire values are intentional in tests so a column-enum rename is caught
 * by a failing test instead of masked by importing the enum. Mirrors the source
 * plan-nodes route files which carry the same documented P-31 exception.
 */
// ── userDivisionRoutes integration tests ──
//
// Covers: GET/POST/PUT/DELETE /admin/users/:userId/divisions

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
  ensureRbacRoleForDivisionAssignment: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const app = require('../../src/app');
const rbacService = require('../../src/services/rbacService');
const chain = sharedDb.__chain;

function resetChain() {
  chain.first.mockReset().mockResolvedValue(undefined);
  chain.insert.mockReset().mockResolvedValue([1]);
  chain.update.mockReset().mockResolvedValue(1);
  chain.delete.mockReset().mockResolvedValue(1);
  chain.del.mockReset().mockResolvedValue(1);
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  ['select', 'where', 'whereIn', 'orderBy', 'leftJoin'].forEach((m) => {
    if (chain[m]) chain[m].mockClear().mockReturnValue(chain);
  });
  // transaction mock
  sharedDb.transaction = jest.fn().mockImplementation(async (cb) => {
    const trx = {
      ...chain,
      insert: jest.fn().mockResolvedValue([99]),
      update: jest.fn().mockResolvedValue(1),
    };
    // Make trx callable as a function (for trx('table_name'))
    const trxFn = jest.fn().mockReturnValue(trx);
    Object.assign(trxFn, trx);
    return cb(trxFn);
  });
}

const ADMIN_USER = { id: 1, email: 'admin@africacdc.org', roles: ['SYSTEM_ADMIN'] };

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  global.__testUser = ADMIN_USER;
  rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
  rbacService.ensureRbacRoleForDivisionAssignment.mockResolvedValue(undefined);
});

afterEach(() => {
  global.__testUser = null;
});

// ── GET /api/admin/users/:userId/divisions ────────────────────────────────────
describe('GET /api/admin/users/:userId/divisions', () => {
  it('should return 400 for invalid userId', async () => {
    const res = await request(app).get('/api/admin/users/abc/divisions');
    expect(res.status).toBe(400);
  });

  it('should return list of division assignments', async () => {
    const rows = [
      { id: 1, division_code: 'DCM', division_name: 'Disease Control', level_type: 'division', role: 'FOCAL_PERSON', is_primary: true, assigned_at: null },
    ];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const res = await request(app).get('/api/admin/users/5/divisions');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ── POST /api/admin/users/:userId/divisions ───────────────────────────────────
describe('POST /api/admin/users/:userId/divisions', () => {
  it('should return 400 for invalid userId', async () => {
    const res = await request(app)
      .post('/api/admin/users/invalid/divisions')
      .send({ division_code: 'DCM', role: 'FOCAL_PERSON' });
    expect(res.status).toBe(400);
  });

  it('should return 400 when schema validation fails (missing division_code)', async () => {
    const res = await request(app)
      .post('/api/admin/users/5/divisions')
      .send({ role: 'FOCAL_PERSON' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 when role is invalid', async () => {
    const res = await request(app)
      .post('/api/admin/users/5/divisions')
      .send({ division_code: 'DCM', role: 'INVALID_ROLE' });
    expect(res.status).toBe(400);
  });

  it('should return 404 when user not found', async () => {
    chain.first
      .mockResolvedValueOnce(undefined); // user not found
    const res = await request(app)
      .post('/api/admin/users/999/divisions')
      .send({ division_code: 'DCM', role: 'FOCAL_PERSON' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('should return 404 when division not found', async () => {
    chain.first
      .mockResolvedValueOnce({ id: 5 })      // user found
      .mockResolvedValueOnce(undefined);     // division not found
    const res = await request(app)
      .post('/api/admin/users/5/divisions')
      .send({ division_code: 'NOPE', role: 'FOCAL_PERSON' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('should return 409 when assignment already exists', async () => {
    chain.first
      .mockResolvedValueOnce({ id: 5 })           // user found
      .mockResolvedValueOnce({ code: 'DCM' })     // division found
      .mockResolvedValueOnce({ id: 10 });          // existing assignment found
    const res = await request(app)
      .post('/api/admin/users/5/divisions')
      .send({ division_code: 'DCM', role: 'FOCAL_PERSON' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_ENTRY');
  });

  it('should create assignment and return 201', async () => {
    chain.first
      .mockResolvedValueOnce({ id: 5 })       // user
      .mockResolvedValueOnce({ code: 'DCM' }) // division (route check)
      .mockResolvedValueOnce(undefined)       // no existing
      .mockResolvedValueOnce({ code: 'DCM', level_type: 'division', focal_user_id: 9 }); // division read by the service
    const res = await request(app)
      .post('/api/admin/users/5/divisions')
      .send({ division_code: 'DCM', role: 'FOCAL_PERSON' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

// ── PUT /api/admin/users/:userId/divisions/:id ────────────────────────────────
describe('PUT /api/admin/users/:userId/divisions/:id', () => {
  it('should return 400 when both userId and id are invalid', async () => {
    const res = await request(app)
      .put('/api/admin/users/bad/divisions/nope')
      .send({ role: 'FOCAL_PERSON' });
    expect(res.status).toBe(400);
  });

  it('should return 400 when schema validation fails (no fields)', async () => {
    const res = await request(app)
      .put('/api/admin/users/5/divisions/3')
      .send({});
    expect(res.status).toBe(400);
  });

  it('should return 404 when assignment not found', async () => {
    chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app)
      .put('/api/admin/users/5/divisions/999')
      .send({ role: 'HEAD_OF_DIVISION' });
    expect(res.status).toBe(404);
  });

  it('should update assignment and return 200', async () => {
    chain.first
      .mockResolvedValueOnce({ id: 3, user_id: 5, division_code: 'DCM', role: 'FOCAL_PERSON', is_primary: false }) // row
      .mockResolvedValueOnce(undefined)                                                                              // no clash
      .mockResolvedValueOnce({ code: 'DCM', level_type: 'division', responsible_user_id: null });                   // service: add (runs first)
    const res = await request(app)
      .put('/api/admin/users/5/divisions/3')
      .send({ role: 'HEAD_OF_DIVISION' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should update is_primary and return 200', async () => {
    chain.first.mockResolvedValueOnce({ id: 3, user_id: 5 });
    const res = await request(app)
      .put('/api/admin/users/5/divisions/3')
      .send({ is_primary: true });
    expect(res.status).toBe(200);
  });
});

// ── DELETE /api/admin/users/:userId/divisions/:id ─────────────────────────────
describe('DELETE /api/admin/users/:userId/divisions/:id', () => {
  it('should return 400 when IDs are invalid', async () => {
    const res = await request(app).delete('/api/admin/users/abc/divisions/xyz');
    expect(res.status).toBe(400);
  });

  it('should return 404 when assignment not found', async () => {
    chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app).delete('/api/admin/users/5/divisions/999');
    expect(res.status).toBe(404);
  });

  it('should delete assignment and return 200', async () => {
    chain.first
      .mockResolvedValueOnce({ id: 3, user_id: 5, division_code: 'DCM', role: 'MEMBER' }) // row
      .mockResolvedValueOnce(undefined);                                                    // service division read (MEMBER has no pointer)
    chain.delete.mockResolvedValueOnce(1);
    const res = await request(app).delete('/api/admin/users/5/divisions/3');
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
  });

  it('should read the division through the shared service when removing a holder row', async () => {
    chain.first
      .mockResolvedValueOnce({ id: 3, user_id: 5, division_code: 'DCM', role: 'HEAD_OF_DIVISION' }) // row
      .mockResolvedValueOnce(undefined)                                                              // service: users.division_code read
      .mockResolvedValueOnce({ code: 'DCM', level_type: 'division', responsible_user_id: 5 });       // service read
    const res = await request(app).delete('/api/admin/users/5/divisions/3');
    expect(res.status).toBe(200);
    // row lookup + legacy users.division_code read + the division read that clears the responsible pointer
    expect(chain.first).toHaveBeenCalledTimes(3);
  });
});