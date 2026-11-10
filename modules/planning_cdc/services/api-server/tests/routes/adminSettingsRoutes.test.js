// ── adminSettingsRoutes integration tests ──
//
// Covers: GET /api/admin/settings, PUT /api/admin/settings

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
const settingsService = require('../../src/services/settingsService');
const rbacService = require('../../src/services/rbacService');
const chain = sharedDb.__chain;

const ROWS = [
  { key: 'reminders.deadline.days_before', value: '7,3,1', description: 'CSV days', updated_by: null, updated_at: null },
  { key: 'reminders.deadline.enabled', value: '0', description: 'On/off', updated_by: null, updated_at: null },
];

function resetChain() {
  chain.first.mockReset().mockResolvedValue(undefined);
  chain.update.mockReset().mockResolvedValue(1);
  chain.pluck.mockReset().mockReturnValue(chain);
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  ['select', 'where', 'whereIn', 'orderBy'].forEach((m) => {
    if (chain[m]) chain[m].mockClear().mockReturnValue(chain);
  });
}

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  settingsService.invalidateCache();
  sharedDb.schema.hasTable.mockResolvedValue(true);
  global.__testUser = { id: 1, email: 'admin@africacdc.org', roles: ['SYSTEM_ADMIN'] };
});

afterEach(() => {
  global.__testUser = null;
});

describe('GET /api/admin/settings', () => {
  it('should list settings rows', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve(ROWS).then(r));
    const res = await request(app).get('/api/admin/settings?prefix=reminders.');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].key).toBe('reminders.deadline.days_before');
  });

  it('should return 403 when the user lacks settings:read', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false });
    const res = await request(app).get('/api/admin/settings');
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});

describe('PUT /api/admin/settings', () => {
  it('should 400 on a missing/empty settings object', async () => {
    const res = await request(app).put('/api/admin/settings').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('should update known keys and return the updated list', async () => {
    chain.pluck.mockResolvedValue(['reminders.deadline.enabled']);
    const res = await request(app)
      .put('/api/admin/settings')
      .send({ settings: { 'reminders.deadline.enabled': '1' } });
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toEqual(['reminders.deadline.enabled']);
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ value: '1', updated_by: 1 }));
  });

  it('should 422 on unknown keys without writing anything', async () => {
    chain.pluck.mockResolvedValue([]);
    const res = await request(app)
      .put('/api/admin/settings')
      .send({ settings: { 'made.up.key': 'x' } });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(chain.update).not.toHaveBeenCalled();
  });

  it('should return 403 when the user lacks settings:update', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false });
    const res = await request(app)
      .put('/api/admin/settings')
      .send({ settings: { 'reminders.deadline.enabled': '1' } });
    expect(res.status).toBe(403);
  });
});
