// ── workflowRoutes integration tests ──
//
// Covers: GET/POST/PUT for /api/governance/workflow-templates and /api/governance/workflows

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
  checkPermission: jest.fn(() => Promise.resolve(global.__rbacPermission || { allowed: true, scope: 'all' })),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: true, denies: [] }),
}));

jest.mock('../../src/services/workflowTemplateService', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplateById: jest.fn().mockResolvedValue(undefined),
  createTemplate: jest.fn().mockResolvedValue({ id: 1, name: 'T1', entity_type: 'INDICATOR_ACTUAL', steps: [] }),
  updateTemplate: jest.fn().mockResolvedValue({ id: 1, name: 'Updated' }),
  deleteTemplate: jest.fn().mockResolvedValue(undefined),
  replaceSteps: jest.fn().mockResolvedValue(undefined),
  getActiveTemplateForEntity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/workflowEngine', () => ({
  startWorkflow: jest.fn().mockResolvedValue({ instance: { id: 1 }, steps: [] }),
  decideWorkflowStep: jest.fn().mockResolvedValue({ id: 1, decision: 'APPROVED' }),
  getWorkflowForEntity: jest.fn().mockResolvedValue({ instance: { id: 1 }, steps: [] }),
  cancelWorkflow: jest.fn().mockResolvedValue({ id: 1, status: 'CANCELLED' }),
  getCurrentPendingStep: jest.fn().mockResolvedValue(null),
}));

const request = require('supertest');
const app = require('../../src/app');
const templateService = require('../../src/services/workflowTemplateService');
const { RBAC_SCOPES } = require('@rbm/lib/rbac');
const workflowEngine = require('../../src/services/workflowEngine');

const ADMIN_USER = { id: 1, email: 'admin@africacdc.org', roles: ['SYSTEM_ADMIN'] };

beforeEach(() => {
  jest.clearAllMocks();
  global.__testUser = ADMIN_USER;
  global.__rbacPermission = { allowed: true, scope: 'all' };
  templateService.listTemplates.mockResolvedValue([]);
  templateService.getTemplateById.mockResolvedValue(undefined);
  templateService.createTemplate.mockResolvedValue({ id: 1, name: 'T1', entity_type: 'INDICATOR_ACTUAL', steps: [] });
  templateService.updateTemplate.mockResolvedValue({ id: 1, name: 'Updated' });
  workflowEngine.startWorkflow.mockResolvedValue({ instance: { id: 1 }, steps: [] });
  workflowEngine.decideWorkflowStep.mockResolvedValue({ id: 1, decision: 'APPROVED' });
  workflowEngine.getWorkflowForEntity.mockResolvedValue({ instance: { id: 1 }, steps: [] });
  workflowEngine.cancelWorkflow.mockResolvedValue({ id: 1, status: 'CANCELLED' });
});

afterEach(() => {
  global.__testUser = null;
  global.__rbacPermission = null;
});

// ── GET /api/governance/workflow-templates ────────────────────────────────────
describe('GET /api/governance/workflow-templates', () => {
  it('should return all templates', async () => {
    templateService.listTemplates.mockResolvedValueOnce([{ id: 1, name: 'T1', entity_type: 'INDICATOR_ACTUAL' }]);
    const res = await request(app).get('/api/governance/workflow-templates');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ── GET /api/governance/workflow-templates/:id ────────────────────────────────
describe('GET /api/governance/workflow-templates/:id', () => {
  it('should return 404 when template not found', async () => {
    templateService.getTemplateById.mockResolvedValueOnce(undefined);
    const res = await request(app).get('/api/governance/workflow-templates/999');
    expect(res.status).toBe(404);
  });

  it('should return template when found', async () => {
    templateService.getTemplateById.mockResolvedValueOnce({ id: 1, name: 'T1', steps: [] });
    const res = await request(app).get('/api/governance/workflow-templates/1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(1);
  });
});

// ── POST /api/governance/workflow-templates ───────────────────────────────────
describe('POST /api/governance/workflow-templates', () => {
  it('should return 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/governance/workflow-templates')
      .send({ entity_type: 'INDICATOR_ACTUAL' });
    expect(res.status).toBe(400);
  });

  it('should return 400 when entity_type is missing', async () => {
    const res = await request(app)
      .post('/api/governance/workflow-templates')
      .send({ name: 'My Template' });
    expect(res.status).toBe(400);
  });

  it('should create template and return 201', async () => {
    templateService.createTemplate.mockResolvedValueOnce({ id: 5, name: 'T5', entity_type: 'ACTIVITY_REPORT', steps: [] });
    templateService.getTemplateById.mockResolvedValueOnce({ id: 5, name: 'T5', entity_type: 'ACTIVITY_REPORT', steps: [] });
    const res = await request(app)
      .post('/api/governance/workflow-templates')
      .send({ name: 'T5', entity_type: 'ACTIVITY_REPORT' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(5);
  });

  it('should call replaceSteps when steps are provided', async () => {
    templateService.createTemplate.mockResolvedValueOnce({ id: 5, name: 'T5', entity_type: 'ACTIVITY_REPORT', steps: [] });
    templateService.getTemplateById.mockResolvedValueOnce({ id: 5, name: 'T5', steps: [{ id: 1 }] });
    const res = await request(app)
      .post('/api/governance/workflow-templates')
      .send({ name: 'T5', entity_type: 'ACTIVITY_REPORT', steps: [{ step_label: 'Approval', step_order: 1 }] });
    expect(res.status).toBe(201);
    expect(templateService.replaceSteps).toHaveBeenCalledTimes(1);
  });
});

// ── PUT /api/governance/workflow-templates/:id ────────────────────────────────
describe('PUT /api/governance/workflow-templates/:id', () => {
  it('should return 404 when template does not exist', async () => {
    templateService.getTemplateById.mockResolvedValueOnce(undefined);
    const res = await request(app)
      .put('/api/governance/workflow-templates/999')
      .send({ name: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('should update template and return 200', async () => {
    templateService.getTemplateById.mockResolvedValueOnce({ id: 1, name: 'T1', steps: [] });
    templateService.updateTemplate.mockResolvedValueOnce({ id: 1, name: 'Updated' });
    const res = await request(app)
      .put('/api/governance/workflow-templates/1')
      .send({ name: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated');
  });
});

// ── DELETE /api/governance/workflow-templates/:id ─────────────────────────────
describe('DELETE /api/governance/workflow-templates/:id', () => {
  it('should delete template and return 200', async () => {
    templateService.deleteTemplate.mockResolvedValueOnce(undefined);
    const res = await request(app).delete('/api/governance/workflow-templates/1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── PUT /api/governance/workflow-templates/:id/steps ──────────────────────────
describe('PUT /api/governance/workflow-templates/:id/steps', () => {
  it('should return 404 when template does not exist', async () => {
    templateService.getTemplateById.mockResolvedValueOnce(undefined);
    const res = await request(app)
      .put('/api/governance/workflow-templates/999/steps')
      .send({ steps: [] });
    expect(res.status).toBe(404);
  });

  it('should return 400 when steps is not an array', async () => {
    templateService.getTemplateById.mockResolvedValueOnce({ id: 1, name: 'T1' });
    const res = await request(app)
      .put('/api/governance/workflow-templates/1/steps')
      .send({ steps: 'not-an-array' });
    expect(res.status).toBe(400);
  });

  it('should replace steps and return 200', async () => {
    templateService.getTemplateById
      .mockResolvedValueOnce({ id: 1, name: 'T1' }) // existence check
      .mockResolvedValueOnce({ id: 1, name: 'T1', steps: [{ id: 10 }] }); // final fetch
    const res = await request(app)
      .put('/api/governance/workflow-templates/1/steps')
      .send({ steps: [{ step_label: 'Review', step_order: 1 }] });
    expect(res.status).toBe(200);
    expect(templateService.replaceSteps).toHaveBeenCalledTimes(1);
  });
});

// ── POST /api/governance/workflows/start ──────────────────────────────────────
describe('POST /api/governance/workflows/start', () => {
  it('should return 403 without workflows:update (admin tool, D-20261108-02)', async () => {
    global.__rbacPermission = { allowed: false, scope: null };
    const res = await request(app)
      .post('/api/governance/workflows/start')
      .send({ entityType: 'PLAN_NODE', entityId: 1, divisionCode: 'EPR' });
    global.__rbacPermission = null;
    expect(res.status).toBe(403);
    expect(workflowEngine.startWorkflow).not.toHaveBeenCalled();
  });

  it('should return 400 when entityType is missing', async () => {
    const res = await request(app)
      .post('/api/governance/workflows/start')
      .send({ entityId: 1 });
    expect(res.status).toBe(400);
  });

  it('should return 400 when entityId is missing', async () => {
    const res = await request(app)
      .post('/api/governance/workflows/start')
      .send({ entityType: 'INDICATOR_ACTUAL' });
    expect(res.status).toBe(400);
  });

  it('should start workflow and return 201', async () => {
    workflowEngine.startWorkflow.mockResolvedValueOnce({ instance: { id: 10 }, steps: [] });
    const res = await request(app)
      .post('/api/governance/workflows/start')
      .send({ entityType: 'INDICATOR_ACTUAL', entityId: 5 });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('should return 404 when TEMPLATE_NOT_FOUND', async () => {
    const err = new Error('No template'); err.code = 'TEMPLATE_NOT_FOUND';
    workflowEngine.startWorkflow.mockRejectedValueOnce(err);
    const res = await request(app)
      .post('/api/governance/workflows/start')
      .send({ entityType: 'INDICATOR_ACTUAL', entityId: 5 });
    expect(res.status).toBe(404);
  });

  it('should return 404 when ENTITY_NOT_FOUND', async () => {
    const err = new Error('Entity not found'); err.code = 'ENTITY_NOT_FOUND';
    workflowEngine.startWorkflow.mockRejectedValueOnce(err);
    const res = await request(app)
      .post('/api/governance/workflows/start')
      .send({ entityType: 'INDICATOR_ACTUAL', entityId: 999 });
    expect(res.status).toBe(404);
  });
});

// ── PUT /api/governance/workflows/steps/:id/decide ───────────────────────────
describe('PUT /api/governance/workflows/steps/:id/decide', () => {
  // The step exists and belongs to someone else: the admin decides it through
  // approve rights at scope all on the step's entity module (D-20261108-02).
  beforeEach(() => {
    sharedDb.__chain.first.mockResolvedValue({ approver_id: 99, escalated_to_id: null, entity_type: 'ACTIVITY_REPORT' });
  });

  it('should return 403 for a user who is not the approver and lacks approve rights at scope all', async () => {
    global.__rbacPermission = { allowed: true, scope: RBAC_SCOPES.DIVISION };
    const res = await request(app)
      .put('/api/governance/workflows/steps/1/decide')
      .send({ decision: 'APPROVED' });
    global.__rbacPermission = null;
    expect(res.status).toBe(403);
    expect(workflowEngine.decideWorkflowStep).not.toHaveBeenCalled();
  });

  it('should return 400 when decision is invalid', async () => {
    const res = await request(app)
      .put('/api/governance/workflows/steps/1/decide')
      .send({ decision: 'INVALID' });
    expect(res.status).toBe(400);
  });

  it('should return 400 when rejecting without comments', async () => {
    const res = await request(app)
      .put('/api/governance/workflows/steps/1/decide')
      .send({ decision: 'REJECTED' });
    expect(res.status).toBe(400);
  });

  it('should approve a step and return 200', async () => {
    workflowEngine.decideWorkflowStep.mockResolvedValueOnce({ id: 1, decision: 'APPROVED' });
    const res = await request(app)
      .put('/api/governance/workflows/steps/1/decide')
      .send({ decision: 'APPROVED' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should reject a step with comments and return 200', async () => {
    workflowEngine.decideWorkflowStep.mockResolvedValueOnce({ id: 1, decision: 'REJECTED' });
    const res = await request(app)
      .put('/api/governance/workflows/steps/1/decide')
      .send({ decision: 'REJECTED', comments: 'Missing data' });
    expect(res.status).toBe(200);
  });

  it('should return 404 when STEP_NOT_FOUND', async () => {
    const err = new Error('Step not found'); err.code = 'STEP_NOT_FOUND';
    workflowEngine.decideWorkflowStep.mockRejectedValueOnce(err);
    const res = await request(app)
      .put('/api/governance/workflows/steps/999/decide')
      .send({ decision: 'APPROVED' });
    expect(res.status).toBe(404);
  });

  it('should return 400 when ALREADY_DECIDED', async () => {
    const err = new Error('Already decided'); err.code = 'ALREADY_DECIDED';
    workflowEngine.decideWorkflowStep.mockRejectedValueOnce(err);
    const res = await request(app)
      .put('/api/governance/workflows/steps/1/decide')
      .send({ decision: 'APPROVED' });
    expect(res.status).toBe(400);
  });
});

// ── GET /api/governance/workflows/:entityType/:entityId ───────────────────────
describe('GET /api/governance/workflows/:entityType/:entityId', () => {
  it('should return 404 when no workflow found', async () => {
    workflowEngine.getWorkflowForEntity.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/governance/workflows/INDICATOR_ACTUAL/1');
    expect(res.status).toBe(404);
  });

  it('should return workflow data', async () => {
    workflowEngine.getWorkflowForEntity.mockResolvedValueOnce({ instance: { id: 5 }, steps: [] });
    const res = await request(app).get('/api/governance/workflows/INDICATOR_ACTUAL/1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── POST /api/governance/workflows/:id/cancel ────────────────────────────────
describe('POST /api/governance/workflows/:id/cancel', () => {
  it('should return 403 without workflows:update (D-20261108-02)', async () => {
    global.__rbacPermission = { allowed: false, scope: null };
    const res = await request(app).post('/api/governance/workflows/1/cancel');
    global.__rbacPermission = null;
    expect(res.status).toBe(403);
    expect(workflowEngine.cancelWorkflow).not.toHaveBeenCalled();
  });

  it('should cancel workflow and return 200', async () => {
    workflowEngine.cancelWorkflow.mockResolvedValueOnce({ id: 1, status: 'CANCELLED' });
    const res = await request(app).post('/api/governance/workflows/1/cancel');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 404 when INSTANCE_NOT_FOUND', async () => {
    const err = new Error('Instance not found'); err.code = 'INSTANCE_NOT_FOUND';
    workflowEngine.cancelWorkflow.mockRejectedValueOnce(err);
    const res = await request(app).post('/api/governance/workflows/999/cancel');
    expect(res.status).toBe(404);
  });

  it('should return 400 when INVALID_STATE', async () => {
    const err = new Error('Cannot cancel'); err.code = 'INVALID_STATE';
    workflowEngine.cancelWorkflow.mockRejectedValueOnce(err);
    const res = await request(app).post('/api/governance/workflows/1/cancel');
    expect(res.status).toBe(400);
  });
});
