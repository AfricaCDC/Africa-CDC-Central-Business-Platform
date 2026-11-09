// ── contributorApprovalRoutes — ROUTE GATES ──
//
// Covers the four endpoints of the contributor approval chain
// (D-20260415-05) at the route/controller layer:
//
//   POST /api/governance/workflows/steps/:stepId/approve
//   POST /api/governance/workflows/steps/:stepId/reject
//   POST /api/governance/workflows/:instanceId/admin-bypass
//   GET  /api/governance/workflows/:entityType/:entityId/history
//
// Focus: path-param validation → existence check → RBAC gate →
// engine-error mapping → success envelope. Full B1-B13 state-machine
// behaviour (spec §10.1) is exercised against the workflowEngine /
// contributorWorkflowEngine modules in their own integration suites.

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = global.__testUser || null;
    next();
  },
}));

jest.mock('../../src/services/workflowEngine', () => ({
  decideWorkflowStep: jest.fn(),
}));

jest.mock('../../src/services/contributorWorkflowEngine', () => ({
  adminBypassInstance: jest.fn(),
}));

jest.mock('../../src/services/approvalHistoryService', () => ({
  getApprovalHistoryForEntity: jest.fn(),
}));

jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const workflowEngine = require('../../src/services/workflowEngine');
const { RBAC_SCOPES } = require('@rbm/lib/rbac');
const contributorEngine = require('../../src/services/contributorWorkflowEngine');
const approvalHistoryService = require('../../src/services/approvalHistoryService');
const rbacService = require('../../src/services/rbacService');

const HOD_USER = { id: 20, email: 'hod@x.com', roles: ['HEAD_OF_DIVISION'] };

function allow() { rbacService.checkPermission.mockResolvedValue({ allowed: true }); }
function deny() { rbacService.checkPermission.mockResolvedValue({ allowed: false }); }

function resetChain() {
  const c = sharedDb.__chain;
  c.first.mockReset().mockResolvedValue(undefined);
  c.insert.mockReset().mockResolvedValue([1]);
  c.update.mockReset().mockResolvedValue(1);
  c.del.mockReset().mockResolvedValue(1);
  c.delete.mockReset().mockResolvedValue(1);
  c.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
}

beforeEach(() => {
  resetChain();
  workflowEngine.decideWorkflowStep.mockReset();
  contributorEngine.adminBypassInstance.mockReset();
  approvalHistoryService.getApprovalHistoryForEntity.mockReset();
  rbacService.checkPermission.mockReset();
  global.__testUser = HOD_USER;
});

// ────────────────────────────────────────────────────────────────
//   POST /workflows/steps/:stepId/approve
// ────────────────────────────────────────────────────────────────
describe('POST /api/governance/workflows/steps/:stepId/approve', () => {
  it('400 when stepId is not a positive integer', async () => {
    allow();
    const res = await request(app)
      .post('/api/governance/workflows/steps/abc/approve')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/stepId/);
  });

  it('404 when step does not exist', async () => {
    allow();
    sharedDb.__chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app)
      .post('/api/governance/workflows/steps/123/approve')
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('403 when user lacks approve_step1 permission', async () => {
    sharedDb.__chain.first.mockResolvedValueOnce({ id: 10, step_order: 1 });
    deny();
    const res = await request(app)
      .post('/api/governance/workflows/steps/10/approve')
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/reports:approve_step1/);
  });

  it('200 on happy path — forwards to engine and returns success envelope', async () => {
    sharedDb.__chain.first.mockResolvedValueOnce({ id: 10, step_order: 2, approver_id: HOD_USER.id });
    allow();
    workflowEngine.decideWorkflowStep.mockResolvedValue({ decided: true, step_order: 2 });
    const res = await request(app)
      .post('/api/governance/workflows/steps/10/approve')
      .send({ comments: 'Looks good' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ decided: true, step_order: 2 });
    expect(workflowEngine.decideWorkflowStep).toHaveBeenCalledWith(
      10, 'APPROVED', 'Looks good', HOD_USER.id, expect.any(Object),
    );
  });

  it('403 when a Responsible Person decides a step of another unit (D-20261108-02)', async () => {
    sharedDb.__chain.first.mockResolvedValueOnce({ id: 10, step_order: 1, approver_id: 99 });
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.DIVISION });
    const res = await request(app)
      .post('/api/governance/workflows/steps/10/approve')
      .send({});
    expect(res.status).toBe(403);
    expect(workflowEngine.decideWorkflowStep).not.toHaveBeenCalled();
  });

  it('200 for a permission at scope all, whoever the approver (D-20261108-02)', async () => {
    sharedDb.__chain.first.mockResolvedValueOnce({ id: 10, step_order: 3, approver_id: 99 });
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
    workflowEngine.decideWorkflowStep.mockResolvedValue({ decided: true });
    const res = await request(app)
      .post('/api/governance/workflows/steps/10/approve')
      .send({});
    expect(res.status).toBe(200);
  });

  it('409 when engine reports ALREADY_DECIDED', async () => {
    sharedDb.__chain.first.mockResolvedValueOnce({ id: 10, step_order: 3, approver_id: HOD_USER.id });
    allow();
    workflowEngine.decideWorkflowStep.mockRejectedValue(
      Object.assign(new Error('already decided'), { code: 'ALREADY_DECIDED' }),
    );
    const res = await request(app)
      .post('/api/governance/workflows/steps/10/approve')
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_DECIDED');
  });

  it('maps engine UNAUTHORIZED to FORBIDDEN code + 403 status', async () => {
    sharedDb.__chain.first.mockResolvedValueOnce({ id: 10, step_order: 1 });
    allow();
    workflowEngine.decideWorkflowStep.mockRejectedValue(
      Object.assign(new Error('not the HOD'), { code: 'UNAUTHORIZED' }),
    );
    const res = await request(app)
      .post('/api/governance/workflows/steps/10/approve')
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});

// ────────────────────────────────────────────────────────────────
//   POST /workflows/steps/:stepId/reject
// ────────────────────────────────────────────────────────────────
describe('POST /api/governance/workflows/steps/:stepId/reject', () => {
  it('422 when comments (reason) is missing or too short', async () => {
    const res = await request(app)
      .post('/api/governance/workflows/steps/10/reject')
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('404 when step does not exist', async () => {
    allow();
    sharedDb.__chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app)
      .post('/api/governance/workflows/steps/10/reject')
      .send({ comments: 'Budget too high' });
    expect(res.status).toBe(404);
  });

  it('403 when user lacks reject_step2 permission', async () => {
    sharedDb.__chain.first.mockResolvedValueOnce({ id: 10, step_order: 2 });
    deny();
    const res = await request(app)
      .post('/api/governance/workflows/steps/10/reject')
      .send({ comments: 'Budget too high' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/reports:reject_step2/);
  });

  it('200 on happy path — forwards rejection to engine', async () => {
    sharedDb.__chain.first.mockResolvedValueOnce({ id: 10, step_order: 1, approver_id: HOD_USER.id });
    allow();
    workflowEngine.decideWorkflowStep.mockResolvedValue({ decided: true, decision: 'REJECTED' });
    const res = await request(app)
      .post('/api/governance/workflows/steps/10/reject')
      .send({ comments: 'Needs more detail' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(workflowEngine.decideWorkflowStep).toHaveBeenCalledWith(
      10, 'REJECTED', 'Needs more detail', HOD_USER.id, expect.any(Object),
    );
  });
});

// ────────────────────────────────────────────────────────────────
//   POST /workflows/:instanceId/admin-bypass
// ────────────────────────────────────────────────────────────────
describe('POST /api/governance/workflows/:instanceId/admin-bypass', () => {
  it('400 when instanceId is not a positive integer', async () => {
    allow();
    const res = await request(app)
      .post('/api/governance/workflows/abc/admin-bypass')
      .send({ comments: 'Fix the blocker' });
    expect(res.status).toBe(400);
  });

  it('422 when comments is missing', async () => {
    const res = await request(app)
      .post('/api/governance/workflows/42/admin-bypass')
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('403 when user lacks approve_admin_bypass permission', async () => {
    deny();
    const res = await request(app)
      .post('/api/governance/workflows/42/admin-bypass')
      .send({ comments: 'Missing HOD — unblocking' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/reports:approve_admin_bypass/);
  });

  it('200 on happy path — forwards to contributor engine', async () => {
    allow();
    contributorEngine.adminBypassInstance.mockResolvedValue({ bypassed: 3 });
    const res = await request(app)
      .post('/api/governance/workflows/42/admin-bypass')
      .send({ comments: 'Missing HOD', bypassAll: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ bypassed: 3 });
    expect(contributorEngine.adminBypassInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceId: 42,
        adminUserId: HOD_USER.id,
        comments: 'Missing HOD',
        bypassAll: true,
      }),
    );
  });

  it('409 when engine reports NO_BYPASSABLE_STEP', async () => {
    allow();
    contributorEngine.adminBypassInstance.mockRejectedValue(
      Object.assign(new Error('already closed'), { code: 'NO_BYPASSABLE_STEP' }),
    );
    const res = await request(app)
      .post('/api/governance/workflows/42/admin-bypass')
      .send({ comments: 'Unblock' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NO_BYPASSABLE_STEP');
  });
});

// ────────────────────────────────────────────────────────────────
//   GET /workflows/:entityType/:entityId/history
// ────────────────────────────────────────────────────────────────
describe('GET /api/governance/workflows/:entityType/:entityId/history', () => {
  it('400 when entityId is not a positive integer', async () => {
    allow();
    const res = await request(app)
      .get('/api/governance/workflows/ACTIVITY_REPORT/abc/history');
    expect(res.status).toBe(400);
  });

  it('403 when user lacks read_history permission', async () => {
    deny();
    const res = await request(app)
      .get('/api/governance/workflows/ACTIVITY_REPORT/42/history');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/reports:read_history/);
  });

  it('200 on happy path — returns history payload wrapped in success envelope', async () => {
    allow();
    approvalHistoryService.getApprovalHistoryForEntity.mockResolvedValue({
      instance: { id: 42, entityType: 'ACTIVITY_REPORT', entityId: 7 },
      steps: [{ id: 1, step: 1, decision: 'APPROVED' }],
    });
    const res = await request(app)
      .get('/api/governance/workflows/ACTIVITY_REPORT/7/history');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.steps).toHaveLength(1);
    expect(approvalHistoryService.getApprovalHistoryForEntity)
      .toHaveBeenCalledWith('ACTIVITY_REPORT', 7);
  });
});
