/* eslint-disable no-restricted-syntax --
 * P-31: these are DB column-enum WIRE values in test fixtures/assertions
 * (plan_nodes.node_type = 'SPECIFIC_ACTIVITY'/'BROAD_ACTIVITY'/'OUTCOME_INDICATOR', etc.;
 * workplan_items.item_type = 'ACTIVITY'/'TASK'), NOT ENTITY_TYPES identifiers.
 * Literal wire values are intentional in tests so a column-enum rename is caught
 * by a failing test instead of masked by importing the enum. Mirrors the source
 * plan-nodes route files which carry the same documented P-31 exception.
 */
// ── workflowEngine unit tests ──
//
// Focus on the public API surface: startWorkflow, decideWorkflowStep,
// getCurrentPendingStep, getWorkflowForEntity, cancelWorkflow.
// Heavy mocks for DB and workflowTemplateService.

jest.mock('../../src/services/workflowTemplateService', () => ({
  getActiveTemplateForEntity: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../src/middleware/auditLog', () => ({
  audit: jest.fn().mockResolvedValue(undefined),
}));

const svc = require('../../src/services/workflowEngine');
const { getActiveTemplateForEntity } = require('../../src/services/workflowTemplateService');
const db = require('../../src/config/db');

function resetChain() {
  const c = db.__chain;
  c.first.mockReset().mockResolvedValue(undefined);
  c.insert.mockReset().mockResolvedValue([1]);
  c.update.mockReset().mockResolvedValue(1);
  c.del.mockReset().mockResolvedValue(1);
  c.delete.mockReset().mockResolvedValue(1);
  c.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  c.where.mockReset().mockReturnValue(c);
  c.whereIn.mockReset().mockReturnValue(c);
  c.whereNull.mockReset().mockReturnValue(c);
  c.select.mockReset().mockReturnValue(c);
  c.orderBy.mockReset().mockReturnValue(c);
  c.leftJoin.mockReset().mockReturnValue(c);
  c.join.mockReset().mockReturnValue(c);
  c.limit.mockReset().mockReturnValue(c);
}

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  getActiveTemplateForEntity.mockResolvedValue(null);
});

// ── startWorkflow ─────────────────────────────────────────────────────────────
describe('workflowEngine.startWorkflow', () => {
  it('should throw TEMPLATE_NOT_FOUND when no active template exists', async () => {
    getActiveTemplateForEntity.mockResolvedValueOnce(null);
    await expect(
      svc.startWorkflow({ entityType: 'INDICATOR_ACTUAL', entityId: 1, submittedById: 7, divisionCode: 'DCM' })
    ).rejects.toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
  });

  it('should throw TEMPLATE_NOT_FOUND when template has no steps', async () => {
    getActiveTemplateForEntity.mockResolvedValueOnce({ id: 1, steps: [] });
    await expect(
      svc.startWorkflow({ entityType: 'INDICATOR_ACTUAL', entityId: 1, submittedById: 7, divisionCode: 'DCM' })
    ).rejects.toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
  });

  it('should throw ENTITY_NOT_FOUND when entity does not exist in DB', async () => {
    getActiveTemplateForEntity.mockResolvedValueOnce({
      id: 1,
      steps: [{ id: 10, step_order: 1, step_label: 'Review', role_code: 'HEAD_OF_DIVISION', scope: 'DIVISION', is_required: true }],
    });
    // Entity lookup returns undefined
    db.__chain.first.mockResolvedValueOnce(undefined);
    await expect(
      svc.startWorkflow({ entityType: 'INDICATOR_ACTUAL', entityId: 99, submittedById: 7, divisionCode: 'DCM' })
    ).rejects.toMatchObject({ code: 'ENTITY_NOT_FOUND' });
  });

  it('should create approval_instance and steps when all deps resolve', async () => {
    getActiveTemplateForEntity.mockResolvedValueOnce({
      id: 1,
      steps: [
        { id: 10, step_order: 1, step_label: 'HOD Review', role_code: 'HEAD_OF_DIVISION', scope: 'DIVISION', is_required: true },
      ],
    });

    // entity exists
    db.__chain.first
      .mockResolvedValueOnce({ id: 1, status: 'SUBMITTED' }) // entity
      .mockResolvedValueOnce({ code: 'DCM', alias_of: null, parent_code: null, responsible_user_id: 5 }) // HOD (up-chain)
      .mockResolvedValueOnce({ id: 100, entity_type: 'INDICATOR_ACTUAL', entity_id: 1, round: 1, status: 'PENDING' }); // instance

    db.__chain.insert
      .mockResolvedValueOnce([100]) // instance insert
      .mockResolvedValueOnce([200]); // steps insert

    const result = await svc.startWorkflow({
      entityType: 'INDICATOR_ACTUAL', entityId: 1, submittedById: 7, divisionCode: 'DCM',
    });
    expect(result).toHaveProperty('instance');
    expect(result).toHaveProperty('steps');
  });
});

// ── getCurrentPendingStep ─────────────────────────────────────────────────────
describe('workflowEngine.getCurrentPendingStep', () => {
  it('should return the first PENDING step for a given instance', async () => {
    const step = { id: 200, approval_instance_id: 100, status: 'PENDING', step_order: 1 };
    db.__chain.first.mockResolvedValueOnce(step);
    const result = await svc.getCurrentPendingStep(100);
    expect(result).toMatchObject({ id: 200, status: 'PENDING' });
  });

  it('should return undefined when no pending step exists', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    const result = await svc.getCurrentPendingStep(100);
    expect(result).toBeUndefined();
  });
});

// ── getWorkflowForEntity ──────────────────────────────────────────────────────
describe('workflowEngine.getWorkflowForEntity', () => {
  it('should return null when no approval instance exists for the entity', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    const result = await svc.getWorkflowForEntity('INDICATOR_ACTUAL', 99);
    expect(result).toBeNull();
  });

  it('should return the instance with its steps nested in { instance, steps }', async () => {
    const instance = { id: 100, entity_type: 'INDICATOR_ACTUAL', entity_id: 1, status: 'PENDING' };
    const steps = [{ id: 200, approval_instance_id: 100, step_order: 1 }];
    db.__chain.first.mockResolvedValueOnce(instance);
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve(steps).then(r));
    const result = await svc.getWorkflowForEntity('INDICATOR_ACTUAL', 1);
    expect(result).toMatchObject({ instance: { id: 100 } });
    expect(result.steps).toHaveLength(1);
  });
});

// ── cancelWorkflow ────────────────────────────────────────────────────────────
describe('workflowEngine.cancelWorkflow', () => {
  it('should update the instance to CANCELLED when status is IN_REVIEW', async () => {
    // First first() call: instance lookup
    db.__chain.first
      .mockResolvedValueOnce({ id: 100, status: 'IN_REVIEW', entity_type: 'INDICATOR_ACTUAL', entity_id: 1 })
      .mockResolvedValueOnce({ id: 100, status: 'CANCELLED' }); // final row read after cancel
    await svc.cancelWorkflow(100, 7);
    // At least one update call sets CANCELLED
    const updateCalls = db.__chain.update.mock.calls;
    expect(updateCalls.some((args) => args[0] && args[0].status === 'CANCELLED')).toBe(true);
  });

  it('should throw INVALID_STATE when instance status is not IN_REVIEW', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 100, status: 'APPROVED', entity_type: 'INDICATOR_ACTUAL', entity_id: 1 });
    await expect(svc.cancelWorkflow(100, 7)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('should throw INSTANCE_NOT_FOUND when instance is not found', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    await expect(svc.cancelWorkflow(9999, 7)).rejects.toMatchObject({ code: 'INSTANCE_NOT_FOUND' });
  });
});

// ── decideWorkflowStep ────────────────────────────────────────────────────────
describe('workflowEngine.decideWorkflowStep', () => {
  it('should throw when the step is not found', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined); // step not found
    await expect(
      svc.decideWorkflowStep(999, 'APPROVED', null, 7)
    ).rejects.toThrow();
  });

  it('should throw ALREADY_DECIDED when step decision is not PENDING', async () => {
    db.__chain.first.mockResolvedValueOnce({
      id: 200, decision: 'APPROVED', approval_instance_id: 100,
      step_order: 1, role_code: 'HEAD_OF_DIVISION', scope: 'DIVISION',
    });
    await expect(
      svc.decideWorkflowStep(200, 'APPROVED', null, 7)
    ).rejects.toMatchObject({ code: 'ALREADY_DECIDED' });
  });
});