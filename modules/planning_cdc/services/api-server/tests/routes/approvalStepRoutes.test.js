// ── GET /api/approvals/steps/:id — decide from the email (D-20261105-10) ──

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ success: false, message: 'Sign in', code: 'UNAUTHORIZED' });
    req.user = { id: Number(req.headers['x-user'] || 5) };
    return next();
  },
}));
jest.mock('../../src/services/rbacService', () => ({ checkPermission: jest.fn() }));
jest.mock('../../src/services/approvals/stepSummary', () => ({ summarize: jest.fn() }));
jest.mock('../../src/services/approvals/approverIdentity', () => ({
  ...jest.requireActual('../../src/services/approvals/approverIdentity'),
  isActingApproverOf: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const rbac = require('../../src/services/rbacService');
const { summarize } = require('../../src/services/approvals/stepSummary');
const { isActingApproverOf } = require('../../src/services/approvals/approverIdentity');

const AUTH = { authorization: 'Bearer t' };
const STEP = {
  step_id: 311, step_label: 'Responsible Person of the Business Unit', decision: 'PENDING', approver_id: 5,
  instance_status: 'IN_REVIEW', entity_type: 'ACTIVITY_REPORT', entity_id: 7, type_label: 'Activity report',
  code: '1.2.3.01', title: 'Lab training', unit_code: 'EPR', link: '/activity-report/42/report/7',
};

beforeEach(() => {
  jest.clearAllMocks();
  summarize.mockResolvedValue(STEP);
  isActingApproverOf.mockResolvedValue(true);
  rbac.checkPermission.mockResolvedValue({ allowed: false, scope: null });
});

describe('GET /api/approvals/steps/:id', () => {
  it('should answer 401 without a session', async () => {
    expect((await request(app).get('/api/approvals/steps/311')).status).toBe(401);
  });

  it('should return the step and let its approver decide it', async () => {
    const res = await request(app).get('/api/approvals/steps/311').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ step_id: 311, code: '1.2.3.01', is_open: true, can_decide: true });
    expect(isActingApproverOf).toHaveBeenCalledWith(5, STEP);
  });

  it('should say a decided step is closed', async () => {
    summarize.mockResolvedValue({ ...STEP, decision: 'APPROVED', instance_status: 'APPROVED', decided_by_name: 'Ama Diallo' });
    const res = await request(app).get('/api/approvals/steps/311').set(AUTH);
    expect(res.body.data).toMatchObject({ is_open: false, can_decide: false, decided_by_name: 'Ama Diallo' });
  });

  it('should refuse a user who is not the approver, delegate or escalation target (403)', async () => {
    isActingApproverOf.mockResolvedValue(false);
    expect((await request(app).get('/api/approvals/steps/311').set(AUTH)).status).toBe(403);
  });

  it('should let an approver at scope all see and decide any step of the entity', async () => {
    isActingApproverOf.mockResolvedValue(false);
    rbac.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
    const res = await request(app).get('/api/approvals/steps/311').set(AUTH);
    expect(res.status).toBe(200);
    expect(rbac.checkPermission).toHaveBeenCalledWith(5, 'activity_report', 'approve');
  });

  it('should answer 404 for an unknown step and 400 for a bad id', async () => {
    summarize.mockResolvedValue(null);
    expect((await request(app).get('/api/approvals/steps/999').set(AUTH)).status).toBe(404);
    expect((await request(app).get('/api/approvals/steps/abc').set(AUTH)).status).toBe(400);
  });
});
