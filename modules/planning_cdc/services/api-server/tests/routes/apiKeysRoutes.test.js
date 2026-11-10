// ── apiKeysRoutes integration tests ──
//
// Covers: GET / POST / PATCH / DELETE /api/admin/api-keys

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

jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn(() => Promise.resolve(global.__rbacPermission || { allowed: false, scope: null })),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: false, denies: [] }),
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
  ['select', 'where', 'whereNull', 'orderBy', 'leftJoin', 'join'].forEach((m) => {
    if (chain[m]) chain[m].mockClear().mockReturnValue(chain);
  });
}

const ADMIN_USER = { id: 1, email: 'admin@africacdc.org', role: 'SYSTEM_ADMIN' };

beforeEach(() => {
  resetChain();
  global.__testUser = ADMIN_USER;
  global.__rbacPermission = { allowed: true, scope: 'all' };
});

afterEach(() => {
  global.__testUser = null;
  global.__rbacPermission = null;
});

// ── GET /api/admin/api-keys ───────────────────────────────────────────────────
describe('GET /api/admin/api-keys', () => {
  it('should return 403 when user is not a system admin and lacks permission', async () => {
    global.__testUser = { id: 2, email: 'user@x.com', role: 'FOCAL_PERSON' };
    global.__rbacPermission = { allowed: false, scope: null };
    const res = await request(app).get('/api/admin/api-keys');
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('should refuse a SYSTEM_ADMIN role claim without the RBAC right (no hardcoded role, D-20261108-02)', async () => {
    global.__rbacPermission = { allowed: false, scope: null };
    const res = await request(app).get('/api/admin/api-keys');
    expect(res.status).toBe(403);
  });

  it('should check users:update in the RBAC matrix', async () => {
    const rbacService = require('../../src/services/rbacService');
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await request(app).get('/api/admin/api-keys');
    expect(rbacService.checkPermission).toHaveBeenCalledWith(1, 'users', 'update');
  });

  it('should return 200 with all keys for SYSTEM_ADMIN', async () => {
    const row = { id: 1, name: 'CI Key', key_prefix: 'cdc_ci', scopes: null, revoked_at: null };
    chain.then.mockImplementationOnce((r) => Promise.resolve([row]).then(r));
    const res = await request(app).get('/api/admin/api-keys');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('should return 200 for user with api_keys:manage:all RBAC permission', async () => {
    global.__testUser = { id: 3, email: 'mgr@x.com', role: 'PLANNER' };
    global.__rbacPermission = { allowed: true, scope: 'all' };
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    const res = await request(app).get('/api/admin/api-keys');
    expect(res.status).toBe(200);
  });
});

// ── POST /api/admin/api-keys ──────────────────────────────────────────────────
describe('POST /api/admin/api-keys', () => {
  it('should return 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/admin/api-keys')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('should return 201 with the created key data including the raw secret', async () => {
    chain.insert.mockResolvedValueOnce([10]);
    chain.first.mockResolvedValueOnce({
      id: 10, name: 'CI Token', key_prefix: 'cdc_abc',
      created_at: new Date(), scopes: null,
    });
    const res = await request(app)
      .post('/api/admin/api-keys')
      .send({ name: 'CI Token' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('key');
    expect(res.body.data.name).toBe('CI Token');
    const { audit } = require('../../src/middleware/auditLog');
    expect(audit).toHaveBeenCalledWith(expect.anything(), 'API_KEY_CREATED', 'api_key', 10, expect.objectContaining({ name: 'CI Token' }));
  });

  it('should include scopes in the response when provided', async () => {
    chain.insert.mockResolvedValueOnce([11]);
    chain.first.mockResolvedValueOnce({
      id: 11, name: 'Read Token', key_prefix: 'cdc_r',
      created_at: new Date(), scopes: '["read:all"]',
    });
    const res = await request(app)
      .post('/api/admin/api-keys')
      .send({ name: 'Read Token', scopes: ['read:all'] });
    expect(res.status).toBe(201);
    expect(res.body.data.scopes).toEqual(['read:all']);
  });
});

// ── PATCH /api/admin/api-keys/:id ────────────────────────────────────────────
describe('PATCH /api/admin/api-keys/:id', () => {
  it('should return 400 when id is not a valid integer', async () => {
    const res = await request(app)
      .patch('/api/admin/api-keys/notanumber')
      .send({ name: 'New Name' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('should return 200 with the updated key', async () => {
    chain.update.mockResolvedValueOnce(1);
    chain.first.mockResolvedValueOnce({ id: 5, name: 'New Name', scopes: null, key_hash: 'abc123' });
    const res = await request(app)
      .patch('/api/admin/api-keys/5')
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('key_hash');
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('New Name');
  });
});

// ── DELETE /api/admin/api-keys/:id ───────────────────────────────────────────
describe('DELETE /api/admin/api-keys/:id', () => {
  it('should return 400 when id is not a valid integer', async () => {
    const res = await request(app).delete('/api/admin/api-keys/abc');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('should return 200 with revoked=true on success', async () => {
    chain.update.mockResolvedValueOnce(1);
    const res = await request(app).delete('/api/admin/api-keys/5');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.revoked).toBe(true);
    expect(res.body.data.id).toBe(5);
  });
});
