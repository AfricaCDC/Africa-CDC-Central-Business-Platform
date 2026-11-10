// ── Cache-Control headers on admin endpoints ──
//
// Regression for the org-chart "save not effective" bug: /api/admin/divisions*
// and /api/admin/division-codes are EDITED from the admin UI, so they must
// use `no-cache` (revalidate every request; ETag still yields 0-byte 304s).
// A `max-age` there makes the browser answer the post-save refetch from its
// HTTP cache and the page shows pre-edit data for the whole max-age window.
// True reference data (tiers…) keeps its time-based cache.

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 1, email: 'admin@africacdc.org', roles: ['SYSTEM_ADMIN'] };
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

describe('Cache-Control on admin endpoints', () => {
  it('should send no-cache on /api/admin/divisions/tree (admin-editable — must revalidate)', async () => {
    const res = await request(app).get('/api/admin/divisions/tree');
    expect(res.headers['cache-control']).toBe('private, no-cache');
    expect(res.headers['cache-control']).not.toMatch(/max-age/);
  });

  it('should send no-cache on /api/admin/divisions/:code detail', async () => {
    const res = await request(app).get('/api/admin/divisions/DPHI');
    expect(res.headers['cache-control']).toBe('private, no-cache');
  });

  it('should send no-cache on /api/admin/division-codes (renamed via org chart)', async () => {
    const res = await request(app).get('/api/admin/division-codes');
    expect(res.headers['cache-control']).toBe('private, no-cache');
  });

  it('should send no-cache on /api/admin/roles (permissions edited on /admin/settings)', async () => {
    const res = await request(app).get('/api/admin/roles');
    expect(res.headers['cache-control']).toBe('private, no-cache');
  });

  it('should send no-cache on /api/plan-nodes (activities created and submitted from the UI)', async () => {
    const res = await request(app).get('/api/plan-nodes');
    expect(res.headers['cache-control']).toBe('private, no-cache');
  });

  it('should keep max-age on true reference data (/api/admin/tiers)', async () => {
    const res = await request(app).get('/api/admin/tiers');
    expect(res.headers['cache-control']).toBe('private, max-age=300, must-revalidate');
  });
});
