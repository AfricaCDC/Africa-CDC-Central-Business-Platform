// ── GET /api/search (D-20261106-05) ──

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ success: false, message: 'Sign in', code: 'UNAUTHORIZED' });
    req.user = { id: 5, roles: [] };
    return next();
  },
}));
jest.mock('../../src/services/rbacService', () => ({ checkPermission: jest.fn() }));
jest.mock('../../src/services/search/globalSearch', () => ({ globalSearch: jest.fn() }));

const request = require('supertest');
const app = require('../../src/app');
const rbac = require('../../src/services/rbacService');
const { globalSearch } = require('../../src/services/search/globalSearch');

const AUTH = { authorization: 'Bearer t' };
const RESULT = { q: 'SDI', fiscal_year: '2026', groups: [] };

beforeEach(() => {
  jest.clearAllMocks();
  rbac.checkPermission.mockResolvedValue({ allowed: false, scope: null });
  globalSearch.mockResolvedValue(RESULT);
});

describe('GET /api/search', () => {
  it('should answer 401 without a session', async () => {
    expect((await request(app).get('/api/search?q=SDI')).status).toBe(401);
    expect(globalSearch).not.toHaveBeenCalled();
  });

  it.each([
    ['q=S', 'q must have 2 to 100 characters'],
    ['q=%20%20', 'q must have 2 to 100 characters'],
    [`q=${'a'.repeat(101)}`, 'q must have 2 to 100 characters'],
    ['q=SDI&fiscal_year=26', 'fiscal_year must be a year'],
    ['q=SDI&limit=0', 'limit must be 1 to 50'],
    ['q=SDI&limit=51', 'limit must be 1 to 50'],
    ['q=SDI&limit=abc', 'limit must be 1 to 50'],
  ])('should answer 400 for %s', async (query, message) => {
    const res = await request(app).get(`/api/search?${query}`).set(AUTH);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, code: 'VALIDATION_FAILED' });
    expect(res.body.message).toContain(message);
    expect(globalSearch).not.toHaveBeenCalled();
  });

  it('should search with the trimmed text, the year and the default limit', async () => {
    const res = await request(app).get('/api/search?q=%20SDI.2%20&fiscal_year=2026').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: RESULT });
    expect(globalSearch).toHaveBeenCalledWith({ q: 'SDI.2', fiscalYear: '2026', limit: 6, userId: 5, canSeeAll: false });
  });

  it('should let an administrator see every plan item', async () => {
    rbac.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
    await request(app).get('/api/search?q=SDI&limit=50').set(AUTH);
    expect(rbac.checkPermission).toHaveBeenCalledWith(5, 'pirs', 'delete');
    expect(globalSearch).toHaveBeenCalledWith({ q: 'SDI', fiscalYear: null, limit: 50, userId: 5, canSeeAll: true });
  });
});
