// ── GET /api/admin/data-health (D-20261105-11) ──

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ success: false, message: 'Sign in', code: 'UNAUTHORIZED' });
    req.user = { id: 5, roles: [] };
    return next();
  },
}));
jest.mock('../../src/services/rbacService', () => ({ checkPermission: jest.fn() }));
jest.mock('../../src/services/dataHealth/dataHealthReport', () => ({ buildReport: jest.fn() }));

const request = require('supertest');
const app = require('../../src/app');
const rbac = require('../../src/services/rbacService');
const { buildReport } = require('../../src/services/dataHealth/dataHealthReport');

const AUTH = { authorization: 'Bearer t' };

beforeEach(() => {
  jest.clearAllMocks();
  rbac.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
  buildReport.mockResolvedValue({ fiscal_year: '2027', checks: [] });
});

describe('GET /api/admin/data-health', () => {
  it('should answer 401 without a session', async () => {
    expect((await request(app).get('/api/admin/data-health')).status).toBe(401);
  });

  it('should answer 403 without data_health:read', async () => {
    rbac.checkPermission.mockResolvedValue({ allowed: false, scope: null });
    const res = await request(app).get('/api/admin/data-health').set(AUTH);
    expect(res.status).toBe(403);
    expect(rbac.checkPermission).toHaveBeenCalledWith(5, 'data_health', 'read');
    expect(buildReport).not.toHaveBeenCalled();
  });

  it('should answer 400 when fiscal_year is not a year', async () => {
    const res = await request(app).get('/api/admin/data-health?fiscal_year=20x7').set(AUTH);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, code: 'VALIDATION_FAILED' });
  });

  it('should return the checks of the requested year', async () => {
    const res = await request(app).get('/api/admin/data-health?fiscal_year=2027').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { fiscal_year: '2027', checks: [] } });
    expect(buildReport).toHaveBeenCalledWith('2027');
  });

  it('should default to the current year', async () => {
    await request(app).get('/api/admin/data-health').set(AUTH);
    expect(buildReport).toHaveBeenCalledWith(String(new Date().getUTCFullYear()));
  });
});
