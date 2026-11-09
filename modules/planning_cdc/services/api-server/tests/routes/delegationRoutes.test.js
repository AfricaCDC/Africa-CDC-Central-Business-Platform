// ── /api/delegations (D-20261105-09) ──
//
// The service is mocked: these tests cover authentication, who may act for
// whom, and the response contract.

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ success: false, message: 'Sign in', code: 'UNAUTHORIZED' });
    req.user = { id: Number(req.headers['x-user'] || 5) };
    return next();
  },
}));
jest.mock('../../src/services/rbacService', () => ({ checkPermission: jest.fn() }));
jest.mock('../../src/services/approvals/delegationService', () => ({
  listFor: jest.fn(), create: jest.fn(), revoke: jest.fn(), candidates: jest.fn(),
}));
jest.mock('../../src/middleware/auditLog', () => ({ audit: jest.fn().mockResolvedValue(undefined) }));

const request = require('supertest');
const app = require('../../src/app');
const rbac = require('../../src/services/rbacService');
const svc = require('../../src/services/approvals/delegationService');
const { ApiError } = require('@rbm/lib/errors');

const AUTH = { authorization: 'Bearer t' };
const BODY = { delegate_id: 12, starts_on: '2026-11-10', ends_on: '2026-11-20', reason: 'Mission' };

beforeEach(() => {
  jest.clearAllMocks();
  rbac.checkPermission.mockResolvedValue({ allowed: false, scope: null });
  svc.listFor.mockResolvedValue({ given: [], received: [] });
  svc.create.mockResolvedValue(3);
  svc.revoke.mockResolvedValue(undefined);
  svc.candidates.mockResolvedValue([{ id: 12, name: 'Ama Diallo', email: 'ama@example.org' }]);
});

describe('authentication', () => {
  it('should answer 401 without a session', async () => {
    expect((await request(app).get('/api/delegations')).status).toBe(401);
  });
});

describe('GET /api/delegations', () => {
  it('should list the caller delegations', async () => {
    const res = await request(app).get('/api/delegations').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { given: [], received: [] } });
    expect(svc.listFor).toHaveBeenCalledWith(5);
  });

  it('should refuse another user without admin rights, accept with them', async () => {
    expect((await request(app).get('/api/delegations?delegator_id=9').set(AUTH)).status).toBe(403);
    rbac.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
    expect((await request(app).get('/api/delegations?delegator_id=9').set(AUTH)).status).toBe(200);
    expect(svc.listFor).toHaveBeenCalledWith(9);
  });
});

describe('POST /api/delegations', () => {
  it('should create the caller delegation', async () => {
    const res = await request(app).post('/api/delegations').set(AUTH).send(BODY);
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ id: 3 });
    expect(svc.create).toHaveBeenCalledWith({
      delegatorId: 5, delegateId: 12, startsOn: '2026-11-10', endsOn: '2026-11-20', reason: 'Mission', createdBy: 5,
    });
  });

  it('should refuse to create for another user without admin rights', async () => {
    expect((await request(app).post('/api/delegations').set(AUTH).send({ ...BODY, delegator_id: 9 })).status).toBe(403);
    expect(svc.create).not.toHaveBeenCalled();
  });

  it('should pass the service errors through the envelope (409)', async () => {
    svc.create.mockRejectedValue(new ApiError('DELEGATION_OVERLAP', 'A delegation already covers these dates: end it first', 409));
    const res = await request(app).post('/api/delegations').set(AUTH).send(BODY);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, code: 'DELEGATION_OVERLAP' });
  });
});

describe('DELETE /api/delegations/:id', () => {
  it('should end the delegation', async () => {
    const res = await request(app).delete('/api/delegations/3').set(AUTH);
    expect(res.status).toBe(200);
    expect(svc.revoke).toHaveBeenCalledWith(3, 5, false);
  });

  it('should refuse a non-numeric id', async () => {
    expect((await request(app).delete('/api/delegations/abc').set(AUTH)).status).toBe(400);
  });
});

describe('GET /api/delegations/candidates', () => {
  it('should return the matching active users', async () => {
    const res = await request(app).get('/api/delegations/candidates?q=ama').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data[0].name).toBe('Ama Diallo');
  });
});
