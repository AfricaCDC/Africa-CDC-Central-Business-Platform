/* eslint-disable no-restricted-syntax --
 * P-31: these are DB column-enum WIRE values in test fixtures/assertions
 * (plan_nodes.node_type = 'SPECIFIC_ACTIVITY'/'BROAD_ACTIVITY'/'OUTCOME_INDICATOR', etc.;
 * workplan_items.item_type = 'ACTIVITY'/'TASK'), NOT ENTITY_TYPES identifiers.
 * Literal wire values are intentional in tests so a column-enum rename is caught
 * by a failing test instead of masked by importing the enum. Mirrors the source
 * plan-nodes route files which carry the same documented P-31 exception.
 */
// ── adminRoutes integration tests ──
//
// Covers: GET/POST/PUT/DELETE /api/admin/users, roles, business-units,
//         divisions (org structure), partners, RBAC matrix endpoints

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

jest.mock('../../src/services/adminService', () => ({
  getUsers: jest.fn().mockResolvedValue([]),
  getUserById: jest.fn().mockResolvedValue(undefined),
  createUser: jest.fn().mockResolvedValue({ id: 1, email: 'new@africacdc.org' }),
  updateUser: jest.fn().mockResolvedValue({ id: 1 }),
  getRoles: jest.fn().mockResolvedValue([]),
  getRoleById: jest.fn().mockResolvedValue(undefined),
  getUserRoles: jest.fn().mockResolvedValue([]),
  assignRole: jest.fn().mockResolvedValue(undefined),
  removeRole: jest.fn().mockResolvedValue(1),
  updateRolePermissions: jest.fn().mockResolvedValue(1),
  getBusinessUnits: jest.fn().mockResolvedValue([]),
  getDivisionCodes: jest.fn().mockResolvedValue([]),
  getDivisionTree: jest.fn().mockResolvedValue([]),
  getDivisionDetail: jest.fn().mockResolvedValue(undefined),
  createDivision: jest.fn().mockResolvedValue({ code: 'NEW', division_name: 'New Division' }),
  updateDivision: jest.fn().mockResolvedValue({ code: 'DCM' }),
  deleteDivision: jest.fn().mockResolvedValue(undefined),
  getPartners: jest.fn().mockResolvedValue([]),
  getMemberStates: jest.fn().mockResolvedValue([]),
  getTeams: jest.fn().mockResolvedValue([]),
  createTeam: jest.fn().mockResolvedValue({ id: 1, name: 'Team1' }),
  getCountries: jest.fn().mockResolvedValue([]),
  getNextCode: jest.fn().mockResolvedValue({ code: 'PRJ-001' }),
}));

jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn(() => Promise.resolve({ allowed: true, scope: 'all' })),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: true, denies: [] }),
  getFullMatrix: jest.fn().mockResolvedValue({ roles: [], modules: [], matrix: {} }),
  upsertPermission: jest.fn().mockResolvedValue(undefined),
  deletePermission: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const app = require('../../src/app');
const s = require('../../src/services/adminService');
const rbacService = require('../../src/services/rbacService');
const chain = sharedDb.__chain;

const ADMIN_USER = { id: 1, email: 'admin@africacdc.org', roles: ['SYSTEM_ADMIN'] };

function resetChain() {
  chain.first.mockReset().mockResolvedValue(undefined);
  chain.insert.mockReset().mockResolvedValue([1]);
  chain.update.mockReset().mockResolvedValue(1);
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  ['select', 'where', 'whereIn', 'orderBy'].forEach((m) => {
    if (chain[m]) chain[m].mockClear().mockReturnValue(chain);
  });
}

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  global.__testUser = ADMIN_USER;
  rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
  s.getUsers.mockResolvedValue([]);
  s.getUserById.mockResolvedValue(undefined);
  s.createUser.mockResolvedValue({ id: 1, email: 'new@africacdc.org' });
  s.updateUser.mockResolvedValue({ id: 1 });
  s.getRoles.mockResolvedValue([]);
  s.getRoleById.mockResolvedValue(undefined);
  s.getUserRoles.mockResolvedValue([]);
  s.assignRole.mockResolvedValue(undefined);
  s.removeRole.mockResolvedValue(1);
  s.updateRolePermissions.mockResolvedValue(1);
  s.getBusinessUnits.mockResolvedValue([]);
  s.getDivisionCodes.mockResolvedValue([]);
  s.getDivisionTree.mockResolvedValue([]);
  s.getDivisionDetail.mockResolvedValue(undefined);
  s.createDivision.mockResolvedValue({ code: 'NEW' });
  s.updateDivision.mockResolvedValue({ code: 'DCM' });
  s.deleteDivision.mockResolvedValue(undefined);
  s.getPartners.mockResolvedValue([]);
  s.getMemberStates.mockResolvedValue([]);
  s.getTeams.mockResolvedValue([]);
  s.createTeam.mockResolvedValue({ id: 1, name: 'Team1' });
  s.getCountries.mockResolvedValue([]);
  s.getNextCode.mockResolvedValue({ code: 'PRJ-001' });
  rbacService.getFullMatrix.mockResolvedValue({ roles: [], modules: [], matrix: {} });
  rbacService.upsertPermission.mockResolvedValue(undefined);
  rbacService.deletePermission.mockResolvedValue(undefined);
});

afterEach(() => {
  global.__testUser = null;
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
describe('GET /api/admin/users', () => {
  it('should return list of users', async () => {
    s.getUsers.mockResolvedValueOnce([{ id: 1, email: 'admin@org.org' }]);
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should pass query params to service', async () => {
    s.getUsers.mockResolvedValueOnce([]);
    await request(app).get('/api/admin/users?status=ACTIVE');
    expect(s.getUsers).toHaveBeenCalledWith(expect.objectContaining({ status: 'ACTIVE' }));
  });
});

// ── GET /api/admin/users/:id ──────────────────────────────────────────────────
describe('GET /api/admin/users/:id', () => {
  it('should return 404 when user not found', async () => {
    s.getUserById.mockResolvedValueOnce(undefined);
    const res = await request(app).get('/api/admin/users/999');
    expect(res.status).toBe(404);
  });

  it('should return user when found', async () => {
    s.getUserById.mockResolvedValueOnce({ id: 5, email: 'user@org.org' });
    const res = await request(app).get('/api/admin/users/5');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(5);
  });
});

// ── POST /api/admin/users ─────────────────────────────────────────────────────
describe('POST /api/admin/users', () => {
  it('should create user and return 201', async () => {
    s.createUser.mockResolvedValueOnce({ id: 10, email: 'new@org.org', full_name: 'New User' });
    const res = await request(app)
      .post('/api/admin/users')
      .send({ email: 'new@org.org', full_name: 'New User' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(10);
  });
});

// ── PUT /api/admin/users/:id ──────────────────────────────────────────────────
describe('PUT /api/admin/users/:id', () => {
  it('should update user and return 200', async () => {
    s.updateUser.mockResolvedValueOnce({ id: 5, title: 'Dr' });
    const res = await request(app)
      .put('/api/admin/users/5')
      .send({ title: 'Dr' });
    expect(res.status).toBe(200);
  });
});


// ── GET /api/admin/roles ──────────────────────────────────────────────────────
describe('GET /api/admin/roles', () => {
  it('should return all roles', async () => {
    s.getRoles.mockResolvedValueOnce([{ id: 1, code: 'SYSTEM_ADMIN' }]);
    const res = await request(app).get('/api/admin/roles');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── GET /api/admin/roles/:id ──────────────────────────────────────────────────
describe('GET /api/admin/roles/:id', () => {
  it('should return 404 when role not found', async () => {
    s.getRoleById.mockResolvedValueOnce(undefined);
    const res = await request(app).get('/api/admin/roles/999');
    expect(res.status).toBe(404);
  });

  it('should return role when found', async () => {
    s.getRoleById.mockResolvedValueOnce({ id: 3, code: 'FOCAL_PERSON' });
    const res = await request(app).get('/api/admin/roles/3');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(3);
  });
});

// ── GET /api/admin/users/:id/roles ────────────────────────────────────────────
describe('GET /api/admin/users/:id/roles', () => {
  it('should return user roles', async () => {
    s.getUserRoles.mockResolvedValueOnce([{ id: 2, code: 'FOCAL_PERSON' }]);
    const res = await request(app).get('/api/admin/users/5/roles');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── POST /api/admin/users/:id/roles ──────────────────────────────────────────
describe('POST /api/admin/users/:id/roles', () => {
  it('should assign role and return 200', async () => {
    s.assignRole.mockResolvedValueOnce(undefined);
    const res = await request(app)
      .post('/api/admin/users/5/roles')
      .send({ role_id: 3 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(s.assignRole).toHaveBeenCalledWith('5', 3);
  });
});

// ── DELETE /api/admin/users/:userId/roles/:roleId ─────────────────────────────
describe('DELETE /api/admin/users/:userId/roles/:roleId', () => {
  it('should remove role and return 200', async () => {
    s.removeRole.mockResolvedValueOnce(1);
    const res = await request(app).delete('/api/admin/users/5/roles/3');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── PUT /api/admin/roles/:id/permissions ──────────────────────────────────────
describe('PUT /api/admin/roles/:id/permissions', () => {
  it('should update role permissions and return 200', async () => {
    s.updateRolePermissions.mockResolvedValueOnce(1);
    const res = await request(app)
      .put('/api/admin/roles/3/permissions')
      .send({ permissions: ['workplans.read', 'workplans.write'] });
    expect(res.status).toBe(200);
    expect(s.updateRolePermissions).toHaveBeenCalledWith('3', ['workplans.read', 'workplans.write']);
  });
});

// ── GET /api/admin/business-units ─────────────────────────────────────────────
describe('GET /api/admin/business-units', () => {
  it('should return business units', async () => {
    s.getBusinessUnits.mockResolvedValueOnce([{ code: 'BU01' }]);
    const res = await request(app).get('/api/admin/business-units');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── GET /api/admin/divisions/tree ─────────────────────────────────────────────
describe('GET /api/admin/divisions/tree', () => {
  it('should return division tree', async () => {
    s.getDivisionTree.mockResolvedValueOnce([{ code: 'ROOT', children: [] }]);
    const res = await request(app).get('/api/admin/divisions/tree');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── GET /api/admin/divisions/:code ────────────────────────────────────────────
describe('GET /api/admin/divisions/:code', () => {
  it('should return 404 when division not found', async () => {
    s.getDivisionDetail.mockResolvedValueOnce(undefined);
    const res = await request(app).get('/api/admin/divisions/NOPE');
    expect(res.status).toBe(404);
  });

  it('should return division when found', async () => {
    s.getDivisionDetail.mockResolvedValueOnce({ code: 'DCM', division_name: 'Disease Control' });
    const res = await request(app).get('/api/admin/divisions/DCM');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('DCM');
  });
});

// ── POST /api/admin/divisions ─────────────────────────────────────────────────
describe('POST /api/admin/divisions', () => {
  it('should create division and return 201', async () => {
    s.createDivision.mockResolvedValueOnce({ code: 'NEW', division_name: 'New Division' });
    const res = await request(app)
      .post('/api/admin/divisions')
      .send({ code: 'NEW', division_name: 'New Division' });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('NEW');
  });
});

// ── PATCH /api/admin/divisions/:code ─────────────────────────────────────────
describe('PATCH /api/admin/divisions/:code', () => {
  it('should update division and return 200', async () => {
    s.updateDivision.mockResolvedValueOnce({ code: 'DCM', division_name: 'Updated' });
    const res = await request(app)
      .patch('/api/admin/divisions/DCM')
      .send({ division_name: 'Updated' });
    expect(res.status).toBe(200);
  });
});

// ── DELETE /api/admin/divisions/:code ─────────────────────────────────────────
describe('DELETE /api/admin/divisions/:code', () => {
  it('should delete division and return 200', async () => {
    s.deleteDivision.mockResolvedValueOnce(undefined);
    const res = await request(app).delete('/api/admin/divisions/DCM');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── GET /api/admin/partners ───────────────────────────────────────────────────
describe('GET /api/admin/partners', () => {
  it('should return partners', async () => {
    s.getPartners.mockResolvedValueOnce([{ id: 1, name: 'WHO' }]);
    const res = await request(app).get('/api/admin/partners');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── GET /api/admin/member-states ──────────────────────────────────────────────
describe('GET /api/admin/member-states', () => {
  it('should return member states', async () => {
    s.getMemberStates.mockResolvedValueOnce([{ id: 1, name: 'Ethiopia' }]);
    const res = await request(app).get('/api/admin/member-states');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── GET /api/admin/teams ──────────────────────────────────────────────────────

// ── GET /api/admin/countries ──────────────────────────────────────────────────

// ── GET /api/admin/next-code/:type ────────────────────────────────────────────

// ── GET /api/admin/rbac/matrix ────────────────────────────────────────────────
describe('GET /api/admin/rbac/matrix', () => {
  it('should return RBAC matrix', async () => {
    rbacService.getFullMatrix.mockResolvedValueOnce({ roles: [{ id: 1, code: 'SYSTEM_ADMIN' }], modules: [], matrix: {} });
    const res = await request(app).get('/api/admin/rbac/matrix');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── PUT /api/admin/rbac/permission ───────────────────────────────────────────
describe('PUT /api/admin/rbac/permission', () => {
  it('should return 400 when required fields missing', async () => {
    const res = await request(app)
      .put('/api/admin/rbac/permission')
      .send({ role_id: 1 }); // missing module_code, action_code, scope
    expect(res.status).toBe(400);
  });

  it('should return 404 when module or action not found', async () => {
    chain.first.mockResolvedValueOnce(undefined); // rbac_modules not found
    const res = await request(app)
      .put('/api/admin/rbac/permission')
      .send({ role_id: 1, module_code: 'workplan', action_code: 'read', scope: 'all' });
    expect(res.status).toBe(404);
  });

  it('should upsert permission and return 200', async () => {
    chain.first
      .mockResolvedValueOnce({ id: 1, code: 'workplan' }) // rbac_modules
      .mockResolvedValueOnce({ id: 2, code: 'read' });    // rbac_actions
    rbacService.upsertPermission.mockResolvedValueOnce(undefined);
    const res = await request(app)
      .put('/api/admin/rbac/permission')
      .send({ role_id: 1, module_code: 'workplan', action_code: 'read', scope: 'all' });
    expect(res.status).toBe(200);
    expect(rbacService.upsertPermission).toHaveBeenCalledWith(1, 1, 2, 'all');
  });
});

// ── DELETE /api/admin/rbac/permission ────────────────────────────────────────
describe('DELETE /api/admin/rbac/permission', () => {
  it('should return 404 when module or action not found', async () => {
    chain.first.mockResolvedValueOnce(undefined); // rbac_modules not found
    const res = await request(app)
      .delete('/api/admin/rbac/permission')
      .send({ role_id: 1, module_code: 'workplan', action_code: 'read' });
    expect(res.status).toBe(404);
  });

  it('should delete permission and return 200', async () => {
    chain.first
      .mockResolvedValueOnce({ id: 1, code: 'workplan' }) // rbac_modules
      .mockResolvedValueOnce({ id: 2, code: 'read' })     // rbac_actions
      .mockResolvedValueOnce({ id: 10, role_id: 1 });     // existing permission
    rbacService.deletePermission.mockResolvedValueOnce(undefined);
    const res = await request(app)
      .delete('/api/admin/rbac/permission')
      .send({ role_id: 1, module_code: 'workplan', action_code: 'read' });
    expect(res.status).toBe(200);
    expect(rbacService.deletePermission).toHaveBeenCalledWith(10);
  });
});