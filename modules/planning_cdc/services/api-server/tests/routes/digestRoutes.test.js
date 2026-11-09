// ── GET /api/digest (D-20261105-15) ──

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ success: false, message: 'Sign in', code: 'UNAUTHORIZED' });
    req.user = { id: Number(req.headers['x-user'] || 14) };
    return next();
  },
}));
jest.mock('../../src/services/rbacService', () => ({ checkPermission: jest.fn() }));
jest.mock('../../src/services/approvals/approverIdentity', () => ({ actingFor: jest.fn(async (id) => [id]) }));
jest.mock('../../src/services/digest/directorDigest', () => ({ directorates: jest.fn(), buildDigest: jest.fn() }));

const request = require('supertest');
const app = require('../../src/app');
const rbac = require('../../src/services/rbacService');
const { actingFor } = require('../../src/services/approvals/approverIdentity');
const { directorates, buildDigest } = require('../../src/services/digest/directorDigest');
const { RBAC_SCOPES } = require('@rbm/lib/rbac');

const AUTH = { authorization: 'Bearer t' };
const DIRS = [{ code: 'DSI', name: 'Science', responsible_user_id: 14 }, { code: 'APPM', name: 'Programmes', responsible_user_id: 20 }];

beforeEach(() => {
  jest.clearAllMocks();
  rbac.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.OWN });
  directorates.mockImplementation(async (codes) => (codes ? DIRS.filter((d) => codes.includes(d.code)) : DIRS));
  buildDigest.mockResolvedValue({ directorate: { code: 'DSI' } });
});

describe('GET /api/digest', () => {
  it('should answer 401 without a session', async () => {
    expect((await request(app).get('/api/digest?directorate=DSI')).status).toBe(401);
  });

  it('should answer 400 without a directorate and 404 for an unknown one', async () => {
    expect((await request(app).get('/api/digest').set(AUTH)).status).toBe(400);
    expect((await request(app).get('/api/digest?directorate=XYZ').set(AUTH)).status).toBe(404);
  });

  it('should give the director their digest and refuse another directorate', async () => {
    const own = await request(app).get('/api/digest?directorate=dsi').set(AUTH);
    expect(own.status).toBe(200);
    expect(buildDigest).toHaveBeenCalledWith(DIRS[0]);
    const other = await request(app).get('/api/digest?directorate=APPM').set(AUTH);
    expect(other.status).toBe(403);
    expect(other.body.code).toBe('FORBIDDEN');
  });

  it('should open it to the delegate of the director', async () => {
    actingFor.mockResolvedValueOnce([33, 20]);
    expect((await request(app).get('/api/digest?directorate=APPM').set({ ...AUTH, 'x-user': '33' })).status).toBe(200);
  });

  it('should open every directorate to dashboard:read at scope all', async () => {
    rbac.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.ALL });
    const res = await request(app).get('/api/digest/directorates').set({ ...AUTH, 'x-user': '5' });
    expect(res.body.data).toEqual([{ code: 'DSI', name: 'Science' }, { code: 'APPM', name: 'Programmes' }]);
  });

  it('should list only the directorate of the director otherwise', async () => {
    const res = await request(app).get('/api/digest/directorates').set(AUTH);
    expect(res.body.data).toEqual([{ code: 'DSI', name: 'Science' }]);
  });
});
