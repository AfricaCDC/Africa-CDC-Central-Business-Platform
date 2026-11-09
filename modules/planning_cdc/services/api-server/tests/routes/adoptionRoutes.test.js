// ── GET /api/admin/adoption (D-20261106-03) ──

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ success: false, message: 'Sign in', code: 'UNAUTHORIZED' });
    req.user = { id: 5, roles: [] };
    return next();
  },
}));
jest.mock('../../src/services/rbacService', () => ({ checkPermission: jest.fn() }));
jest.mock('../../src/services/adoption/adoptionReport', () => ({ adoptionReport: jest.fn() }));

const request = require('supertest');
const app = require('../../src/app');
const rbac = require('../../src/services/rbacService');
const { adoptionReport } = require('../../src/services/adoption/adoptionReport');

const AUTH = { authorization: 'Bearer t' };

beforeEach(() => {
  jest.clearAllMocks();
  rbac.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
  adoptionReport.mockResolvedValue({ summary: { users: 0 }, rows: [], total: 0, page: 1, page_size: 15 });
});

describe('GET /api/admin/adoption', () => {
  it('should answer 401 without a session', async () => {
    expect((await request(app).get('/api/admin/adoption')).status).toBe(401);
  });

  it('should answer 403 without users:read', async () => {
    rbac.checkPermission.mockResolvedValue({ allowed: false, scope: null });
    const res = await request(app).get('/api/admin/adoption').set(AUTH);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ success: false, message: 'Insufficient permissions: users:read', code: 'FORBIDDEN' });
    expect(rbac.checkPermission).toHaveBeenCalledWith(5, 'users', 'read');
    expect(adoptionReport).not.toHaveBeenCalled();
  });

  it.each([
    ['filter=SOMETIMES', 'filter must be one of'],
    ['page=0', 'page must be 1 or more'],
    ['page=abc', 'page must be 1 or more'],
    ['unit=DROP%20TABLE', 'unit must be a Business Unit code'],
  ])('should answer 400 for %s', async (query, message) => {
    const res = await request(app).get(`/api/admin/adoption?${query}`).set(AUTH);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.message).toContain(message);
    expect(adoptionReport).not.toHaveBeenCalled();
  });

  it('should pass the filters to the report and return it', async () => {
    const res = await request(app).get('/api/admin/adoption?filter=NO_TOUR&unit=SDI&q=%20jane%20&page=2').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(adoptionReport).toHaveBeenCalledWith({ filter: 'NO_TOUR', unit: 'SDI', search: 'jane', page: 2 });
  });

  it('should default to the first page with no filter', async () => {
    await request(app).get('/api/admin/adoption').set(AUTH);
    expect(adoptionReport).toHaveBeenCalledWith({ filter: null, unit: '', search: '', page: 1 });
  });
});
