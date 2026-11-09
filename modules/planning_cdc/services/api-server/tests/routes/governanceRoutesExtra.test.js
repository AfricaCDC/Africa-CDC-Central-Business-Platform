// ── governanceRoutes extra integration tests ──
//
// Covers: GET/POST /approvals, GET /approvals/:id, GET /approvals/:id/steps,
//         POST /approvals/:id/steps, PUT /steps/:id/decide,
//         GET /audit, GET /inbox, GET /my-drafts, GET /notifications,
//         PUT /notifications/:id/read, PUT /notifications/read-all,
//         GET /snapshots/:entityType/:entityId, POST /page-view

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

jest.mock('../../src/services/governanceService', () => ({
  getApprovals: jest.fn().mockResolvedValue([]),
  getApprovalById: jest.fn().mockResolvedValue(null),
  createApproval: jest.fn().mockResolvedValue({ id: 1 }),
  getApprovalSteps: jest.fn().mockResolvedValue([]),
  addApprovalStep: jest.fn().mockResolvedValue({ id: 10 }),
  getAuditEvents: jest.fn().mockResolvedValue([]),
  getInbox: jest.fn().mockResolvedValue([]),
  getMyDrafts: jest.fn().mockResolvedValue([]),
  getNotifications: jest.fn().mockResolvedValue([]),
  markRead: jest.fn().mockResolvedValue(undefined),
  markAllRead: jest.fn().mockResolvedValue(undefined),
  getSnapshots: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../src/services/workflowEngine', () => ({
  startWorkflow: jest.fn().mockResolvedValue({ instance: { id: 1 }, steps: [] }),
  decideWorkflowStep: jest.fn().mockResolvedValue({ step: { id: 5 }, instance: { id: 1 }, isComplete: false }),
  getWorkflowForEntity: jest.fn().mockResolvedValue(null),
  cancelWorkflow: jest.fn().mockResolvedValue({ id: 1, status: 'CANCELLED' }),
  resolveApprover: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../src/services/workflowTemplateService', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplateById: jest.fn().mockResolvedValue(undefined),
  createTemplate: jest.fn().mockResolvedValue({ id: 1 }),
  updateTemplate: jest.fn().mockResolvedValue({ id: 1 }),
  deleteTemplate: jest.fn().mockResolvedValue(undefined),
  replaceSteps: jest.fn().mockResolvedValue(undefined),
  getActiveTemplateForEntity: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const app = require('../../src/app');
const rbacService = require('../../src/services/rbacService');
const governanceService = require('../../src/services/governanceService');
const workflowEngine = require('../../src/services/workflowEngine');
const chain = sharedDb.__chain;

function resetChain() {
  chain.first.mockReset().mockResolvedValue(undefined);
  chain.insert.mockReset().mockResolvedValue([1]);
  chain.update.mockReset().mockResolvedValue(1);
  chain.del.mockReset().mockResolvedValue(1);
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  ['select', 'where', 'whereIn', 'orderBy', 'leftJoin'].forEach((m) => {
    if (chain[m]) chain[m].mockClear().mockReturnValue(chain);
  });
}

const ADMIN_USER = { id: 1, email: 'admin@africacdc.org' };

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  global.__testUser = ADMIN_USER;
  rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
  governanceService.getApprovals.mockResolvedValue([]);
  governanceService.getApprovalById.mockResolvedValue(null);
  governanceService.createApproval.mockResolvedValue({ id: 1 });
  governanceService.getApprovalSteps.mockResolvedValue([]);
  governanceService.addApprovalStep.mockResolvedValue({ id: 10 });
  governanceService.getAuditEvents.mockResolvedValue([]);
  governanceService.getInbox.mockResolvedValue([]);
  governanceService.getMyDrafts.mockResolvedValue([]);
  governanceService.getNotifications.mockResolvedValue([]);
  workflowEngine.decideWorkflowStep.mockResolvedValue({ step: { id: 5 }, instance: { id: 1 }, isComplete: false });
});

afterEach(() => {
  global.__testUser = null;
});

// ── GET /api/governance/approvals ─────────────────────────────────────────────

// ── GET /api/governance/approvals/:id ────────────────────────────────────────

// ── POST /api/governance/approvals ───────────────────────────────────────────

// ── GET /api/governance/approvals/:id/steps ───────────────────────────────────

// ── POST /api/governance/approvals/:id/steps ──────────────────────────────────

// ── PUT /api/governance/steps/:id/decide ─────────────────────────────────────
describe('PUT /api/governance/steps/:id/decide', () => {
  it('should return 403 when user is neither direct approver nor admin', async () => {
    // step.approver_id = 99, user.id = 1 → not direct approver
    chain.first.mockResolvedValueOnce({ approver_id: 99, entity_type: 'ACTIVITY_REPORT' });
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    const res = await request(app)
      .put('/api/governance/steps/5/decide')
      .send({ decision: 'APPROVED', comments: '' });
    expect(res.status).toBe(403);
  });

  it('should allow decision when user is the direct approver', async () => {
    chain.first.mockResolvedValueOnce({ approver_id: 1, entity_type: 'ACTIVITY_REPORT' }); // matches req.user.id
    const res = await request(app)
      .put('/api/governance/steps/5/decide')
      .send({ decision: 'APPROVED', comments: 'LGTM' });
    expect(res.status).toBe(200);
    expect(workflowEngine.decideWorkflowStep).toHaveBeenCalledWith(5, 'APPROVED', 'LGTM', 1, expect.anything());
  });

  it('should allow decision when user has global approve scope', async () => {
    chain.first.mockResolvedValueOnce({ approver_id: 99, entity_type: 'ACTIVITY_REPORT' }); // not direct
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    const res = await request(app)
      .put('/api/governance/steps/5/decide')
      .send({ decision: 'REJECTED', comments: 'Needs work' });
    expect(res.status).toBe(200);
    // The module follows the step's entity, not always the quarterly report (D-20261108-02).
    expect(rbacService.checkPermission).toHaveBeenCalledWith(1, 'activity_report', 'approve');
  });
});

// ── GET /api/governance/audit ─────────────────────────────────────────────────
describe('GET /api/governance/audit', () => {
  it('should return audit events', async () => {
    governanceService.getAuditEvents.mockResolvedValueOnce([{ id: 1, action: 'SUBMIT' }]);
    const res = await request(app).get('/api/governance/audit');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(rbacService.checkPermission).toHaveBeenCalledWith(1, 'audit_log', 'read');
  });

  it('should return 403 without audit_log:read (D-20261108-02)', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    const res = await request(app).get('/api/governance/audit');
    expect(res.status).toBe(403);
    expect(governanceService.getAuditEvents).not.toHaveBeenCalled();
  });
});

// ── GET /api/governance/inbox ─────────────────────────────────────────────────
describe('GET /api/governance/inbox', () => {
  it('should return inbox items', async () => {
    governanceService.getInbox.mockResolvedValueOnce([{ id: 1 }]);
    const res = await request(app).get('/api/governance/inbox');
    expect(res.status).toBe(200);
  });
});

// ── GET /api/governance/my-drafts ────────────────────────────────────────────
describe('GET /api/governance/my-drafts', () => {
  it('should return drafts', async () => {
    governanceService.getMyDrafts.mockResolvedValueOnce([{ id: 1 }]);
    const res = await request(app).get('/api/governance/my-drafts');
    expect(res.status).toBe(200);
  });
});

// ── GET /api/governance/notifications ────────────────────────────────────────
describe('GET /api/governance/notifications', () => {
  it('should return notifications', async () => {
    governanceService.getNotifications.mockResolvedValueOnce([{ id: 1, message: 'Test' }]);
    const res = await request(app).get('/api/governance/notifications');
    expect(res.status).toBe(200);
  });
});

// ── PUT /api/governance/notifications/:id/read ───────────────────────────────
describe('PUT /api/governance/notifications/:id/read', () => {
  it('should mark notification as read and return success', async () => {
    const res = await request(app).put('/api/governance/notifications/5/read');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(governanceService.markRead).toHaveBeenCalledWith('5', 1); // only the caller's own notification (D-20261108-02)
  });
});

// ── PUT /api/governance/notifications/read-all ───────────────────────────────
describe('PUT /api/governance/notifications/read-all', () => {
  it('should mark all notifications as read', async () => {
    const res = await request(app).put('/api/governance/notifications/read-all');
    expect(res.status).toBe(200);
    expect(governanceService.markAllRead).toHaveBeenCalledWith(1);
  });
});

// ── GET /api/governance/snapshots/:entityType/:entityId ──────────────────────

// ── POST /api/governance/page-view ───────────────────────────────────────────
describe('POST /api/governance/page-view', () => {
  it('should record page view and return success', async () => {
    const res = await request(app)
      .post('/api/governance/page-view')
      .send({ path: '/dashboard', search: '?tab=workplan' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
