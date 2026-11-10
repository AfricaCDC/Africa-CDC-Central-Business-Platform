/* eslint-disable no-restricted-syntax --
 * P-31: these are DB column-enum WIRE values in test fixtures/assertions
 * (plan_nodes.node_type = 'SPECIFIC_ACTIVITY'/'BROAD_ACTIVITY'/'OUTCOME_INDICATOR', etc.;
 * workplan_items.item_type = 'ACTIVITY'/'TASK'), NOT ENTITY_TYPES identifiers.
 * Literal wire values are intentional in tests so a column-enum rename is caught
 * by a failing test instead of masked by importing the enum. Mirrors the source
 * plan-nodes route files which carry the same documented P-31 exception.
 */
// ── workflowEngine extra branch coverage ──
//
// Extends the existing workflowEngine.test.js to cover the branches
// left uncovered: decideWorkflowStep transaction logic (reject vs last
// approve vs intermediate approve), resolveApprover paths,
// and startWorkflow GLOBAL scope / APPROVER_NOT_RESOLVED / UNKNOWN_ENTITY_TYPE.

jest.mock('../../src/services/workflowTemplateService', () => ({
  getActiveTemplateForEntity: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../src/middleware/auditLog', () => ({
  audit: jest.fn().mockResolvedValue(undefined),
}));

const svc = require('../../src/services/workflowEngine');
const { getActiveTemplateForEntity } = require('../../src/services/workflowTemplateService');
const db = require('../../src/config/db');

// Build a transaction mock that mirrors the pattern in other test files
function makeTransactionMock() {
  const trx = {
    fn: { now: jest.fn().mockReturnValue(new Date().toISOString()) },
  };
  const chain = {
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    whereNot: jest.fn().mockReturnThis(),
    whereNotIn: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    pluck: jest.fn().mockResolvedValue([]),
    first: jest.fn().mockResolvedValue(undefined),
    insert: jest.fn().mockResolvedValue([1]),
    update: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
    then: jest.fn((r) => Promise.resolve([]).then(r)),
  };
  chain.where.mockReturnValue(chain);
  chain.whereIn.mockReturnValue(chain);
  chain.whereNot.mockReturnValue(chain);
  const trxFn = jest.fn().mockReturnValue(chain);
  Object.assign(trxFn, trx, chain);
  trxFn.__chain = chain;
  return { trxFn, chain };
}

function resetDbChain() {
  const c = db.__chain;
  c.first.mockReset().mockResolvedValue(undefined);
  c.insert.mockReset().mockResolvedValue([1]);
  c.update.mockReset().mockResolvedValue(1);
  c.del.mockReset().mockResolvedValue(1);
  c.delete.mockReset().mockResolvedValue(1);
  c.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  ['where', 'whereIn', 'whereNull', 'whereNot', 'select', 'orderBy',
    'leftJoin', 'join', 'limit', 'pluck'].forEach((m) => {
    if (c[m]) c[m].mockReset().mockReturnValue(c);
  });
}

beforeEach(() => {
  resetDbChain();
  jest.clearAllMocks();
  getActiveTemplateForEntity.mockResolvedValue(null);
});

// ── startWorkflow — edge branches ─────────────────────────────────────────────
describe('startWorkflow — edge cases', () => {
  it('should throw UNKNOWN_ENTITY_TYPE for unmapped entity type', async () => {
    getActiveTemplateForEntity.mockResolvedValueOnce({
      id: 1, steps: [{ step_order: 1, step_label: 'Step', role_code: 'FOCAL_PERSON', scope: 'DIVISION', is_required: true }],
    });
    await expect(
      svc.startWorkflow({ entityType: 'UNKNOWN_TYPE', entityId: 1, submittedById: 7 })
    ).rejects.toMatchObject({ code: 'UNKNOWN_ENTITY_TYPE' });
  });

  it('should throw APPROVER_NOT_RESOLVED when required step has no approver', async () => {
    getActiveTemplateForEntity.mockResolvedValueOnce({
      id: 1, steps: [{ step_order: 1, step_label: 'HOD', role_code: 'HEAD_OF_DIVISION', scope: 'DIVISION', is_required: true }],
    });
    // entity exists
    db.__chain.first
      .mockResolvedValueOnce({ id: 1, status: 'DRAFT' }) // entity
      .mockResolvedValueOnce({ code: 'DCM', alias_of: null }) // canonical division
      .mockResolvedValueOnce({ responsible_user_id: null }); // HOD slot is empty → null approver

    const { trxFn } = makeTransactionMock();
    db.transaction = jest.fn().mockImplementation((cb) => cb(trxFn));
    trxFn.pluck = jest.fn().mockResolvedValue([]);
    trxFn.__chain.pluck = jest.fn().mockResolvedValue([]);

    await expect(
      svc.startWorkflow({ entityType: 'INDICATOR_ACTUAL', entityId: 1, submittedById: 7, divisionCode: 'DCM' })
    ).rejects.toMatchObject({ code: 'APPROVER_NOT_RESOLVED' });
  });

  it('should resolve FOCAL_PERSON approver from the focal team of the division', async () => {
    getActiveTemplateForEntity.mockResolvedValueOnce({
      id: 1, steps: [{ step_order: 1, step_label: 'FP', role_code: 'FOCAL_PERSON', scope: 'DIVISION', is_required: true }],
    });
    db.__chain.first
      .mockResolvedValueOnce({ id: 1, status: 'DRAFT' }) // entity
      .mockResolvedValueOnce({ code: 'DCM', alias_of: null }) // canonical
      .mockResolvedValueOnce({ user_id: 3 }) // first focal person (user_divisions)
      .mockResolvedValueOnce({ id: 100, entity_type: 'INDICATOR_ACTUAL', entity_id: 1 }); // instance after insert

    const { trxFn, chain: tChain } = makeTransactionMock();
    db.transaction = jest.fn().mockImplementation((cb) => cb(trxFn));
    tChain.pluck.mockResolvedValue([]);
    tChain.insert.mockResolvedValueOnce([100]).mockResolvedValueOnce([200]);
    tChain.then.mockImplementation((r) => Promise.resolve([]).then(r));
    tChain.first.mockResolvedValueOnce({ id: 100 }).mockResolvedValueOnce(undefined);

    const result = await svc.startWorkflow({
      entityType: 'INDICATOR_ACTUAL', entityId: 1, submittedById: 7, divisionCode: 'DCM',
    });
    expect(result).toHaveProperty('instance');
  });

  it('should resolve GLOBAL scope approver via user_roles join', async () => {
    getActiveTemplateForEntity.mockResolvedValueOnce({
      id: 1, steps: [{ step_order: 1, step_label: 'ME', role_code: 'ME_OFFICER', scope: 'GLOBAL', is_required: true }],
    });
    db.__chain.first
      .mockResolvedValueOnce({ id: 1, status: 'DRAFT' }) // entity
      .mockResolvedValueOnce({ id: 9 }) // GLOBAL approver (user_roles join)
      .mockResolvedValueOnce({ id: 100, entity_type: 'INDICATOR_ACTUAL', entity_id: 1 }); // instance

    const { trxFn, chain: tChain } = makeTransactionMock();
    db.transaction = jest.fn().mockImplementation((cb) => cb(trxFn));
    tChain.pluck.mockResolvedValue([]);
    tChain.insert.mockResolvedValueOnce([100]).mockResolvedValueOnce([200]);
    tChain.then.mockImplementation((r) => Promise.resolve([]).then(r));
    tChain.first.mockResolvedValue({ id: 100 });

    const result = await svc.startWorkflow({
      entityType: 'INDICATOR_ACTUAL', entityId: 1, submittedById: 7, divisionCode: null,
    });
    expect(result).toHaveProperty('steps');
  });

  it('should start with an unassigned M&E step (pool) instead of failing or picking the first officer', async () => {
    getActiveTemplateForEntity.mockResolvedValueOnce({
      id: 1, steps: [{ step_order: 1, step_label: 'M&E', role_code: 'ME_OFFICER', scope: 'GLOBAL', is_required: true }],
    });
    db.__chain.first
      .mockResolvedValueOnce({ id: 1, status: 'DRAFT' }) // entity
      .mockResolvedValueOnce({ code: 'EPR', alias_of: null, parent_code: null, m_and_e_user_id: null }); // no M&E officer
    const { trxFn, chain: tChain } = makeTransactionMock();
    db.transaction = jest.fn().mockImplementation((cb) => cb(trxFn));
    tChain.pluck.mockResolvedValue([]);
    tChain.insert.mockResolvedValueOnce([100]).mockResolvedValueOnce([200]);
    tChain.then.mockImplementation((r) => Promise.resolve([]).then(r));
    tChain.first.mockResolvedValue({ id: 100 });

    await svc.startWorkflow({ entityType: 'INDICATOR_ACTUAL', entityId: 1, submittedById: 7, divisionCode: 'EPR' });
    const stepInsert = tChain.insert.mock.calls.find(([rows]) => Array.isArray(rows));
    expect(stepInsert[0][0]).toMatchObject({ role_code: 'ME_OFFICER', approver_id: null, decision: 'PENDING' });
  });

  it('should handle MAIN_DIVISION scope — resolves via indicator plan_node', async () => {
    getActiveTemplateForEntity.mockResolvedValueOnce({
      id: 1, steps: [{ step_order: 1, step_label: 'ME', role_code: 'HEAD_OF_DIVISION', scope: 'MAIN_DIVISION', is_required: false }],
    });
    db.__chain.first
      .mockResolvedValueOnce({ id: 1, status: 'DRAFT' })  // entity exists (INDICATOR_DIVISION_REPORT)
      .mockResolvedValueOnce({ plan_node_id: 5 })           // report lookup for MAIN_DIVISION
      .mockResolvedValueOnce({ responsible_division_code: 'WHC' }) // plan_node
      .mockResolvedValueOnce({ code: 'WHC', alias_of: null }) // canonical
      .mockResolvedValueOnce({ responsible_user_id: 11 })   // HOD slot
      .mockResolvedValueOnce({ id: 100, entity_type: 'INDICATOR_DIVISION_REPORT', entity_id: 1 });

    const { trxFn, chain: tChain } = makeTransactionMock();
    db.transaction = jest.fn().mockImplementation((cb) => cb(trxFn));
    tChain.pluck.mockResolvedValue([]);
    tChain.insert.mockResolvedValueOnce([100]).mockResolvedValueOnce([200]);
    tChain.then.mockImplementation((r) => Promise.resolve([]).then(r));
    tChain.first.mockResolvedValue({ id: 100 });

    const result = await svc.startWorkflow({
      entityType: 'INDICATOR_DIVISION_REPORT', entityId: 1, submittedById: 7, divisionCode: 'DCM',
    });
    expect(result).toHaveProperty('instance');
  });
});

// ── decideWorkflowStep — transaction branches ─────────────────────────────────
describe('decideWorkflowStep — REJECTED path', () => {
  it('should reject the step and set entity status to onReject (INDICATOR_ACTUAL)', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 200, decision: 'PENDING', approval_instance_id: 100, step_label: 'Review', step_order: 1 })
      .mockResolvedValueOnce({ id: 100, entity_type: 'INDICATOR_ACTUAL', entity_id: 5, status: 'IN_REVIEW' });

    const { trxFn, chain: tChain } = makeTransactionMock();
    db.transaction = jest.fn().mockImplementation((cb) => cb(trxFn));
    tChain.first
      .mockResolvedValueOnce({ id: 200, decision: 'REJECTED' })   // updatedStep
      .mockResolvedValueOnce({ id: 100, status: 'REJECTED' });    // updatedInstance

    const result = await svc.decideWorkflowStep(200, 'REJECTED', 'Not enough data', 7);
    expect(result.isComplete).toBe(true);
    expect(tChain.update).toHaveBeenCalled();
  });

  it('should reject for ACTIVITY_REPORT entity type', async () => {
    // (was PLAN_NODE before cleaning Phase 1.1 — PLAN_NODE no longer flows through
    // the template engine; this exercises the generic single-step reject path.)
    db.__chain.first
      .mockResolvedValueOnce({ id: 201, decision: 'PENDING', approval_instance_id: 101, step_label: 'Review', step_order: 1 })
      .mockResolvedValueOnce({ id: 101, entity_type: 'ACTIVITY_REPORT', entity_id: 7, status: 'IN_REVIEW' });

    const { trxFn, chain: tChain } = makeTransactionMock();
    db.transaction = jest.fn().mockImplementation((cb) => cb(trxFn));
    tChain.first
      .mockResolvedValueOnce({ id: 201, decision: 'REJECTED' })
      .mockResolvedValueOnce({ id: 101, status: 'REJECTED' });

    const result = await svc.decideWorkflowStep(201, 'REJECTED', 'Incomplete', 7);
    expect(result.isComplete).toBe(true);
  });

  it('should reject for INDICATOR_DIVISION_REPORT and write history', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 202, decision: 'PENDING', approval_instance_id: 102, step_label: 'FP Review', step_order: 1 })
      .mockResolvedValueOnce({ id: 102, entity_type: 'INDICATOR_DIVISION_REPORT', entity_id: 8, status: 'IN_REVIEW' });

    const { trxFn, chain: tChain } = makeTransactionMock();
    db.transaction = jest.fn().mockImplementation((cb) => cb(trxFn));
    tChain.first
      .mockResolvedValueOnce({ id: 202, decision: 'REJECTED' })
      .mockResolvedValueOnce({ id: 102, status: 'REJECTED' });

    const result = await svc.decideWorkflowStep(202, 'REJECTED', 'Missing data', 7);
    expect(result.isComplete).toBe(true);
    // history insert should be called for INDICATOR_DIVISION_REPORT
    expect(tChain.insert).toHaveBeenCalled();
  });
});

describe('decideWorkflowStep — APPROVED path (last step)', () => {
  it('should approve and mark instance APPROVED on last step (ACTIVITY_REPORT)', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 200, decision: 'PENDING', approval_instance_id: 100, step_label: 'Review', step_order: 1 })
      .mockResolvedValueOnce({ id: 100, entity_type: 'ACTIVITY_REPORT', entity_id: 5, status: 'IN_REVIEW' });

    const { trxFn, chain: tChain } = makeTransactionMock();
    db.transaction = jest.fn().mockImplementation((cb) => cb(trxFn));
    // pendingSteps after this approval → empty (last step)
    tChain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    tChain.first
      .mockResolvedValueOnce({ id: 200, decision: 'APPROVED' })
      .mockResolvedValueOnce({ id: 100, status: 'APPROVED' });

    const result = await svc.decideWorkflowStep(200, 'APPROVED', 'OK', 7);
    expect(result.isComplete).toBe(true);
  });

  it('should approve last step for DIVISION_ACTIVITY_REPORT', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 201, decision: 'PENDING', approval_instance_id: 101, step_label: 'HOD', step_order: 1 })
      .mockResolvedValueOnce({ id: 101, entity_type: 'DIVISION_ACTIVITY_REPORT', entity_id: 6, status: 'IN_REVIEW' });

    const { trxFn, chain: tChain } = makeTransactionMock();
    db.transaction = jest.fn().mockImplementation((cb) => cb(trxFn));
    tChain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r)); // no pending steps
    tChain.first
      .mockResolvedValueOnce({ id: 201, decision: 'APPROVED' })
      .mockResolvedValueOnce({ id: 101, status: 'APPROVED' });

    const result = await svc.decideWorkflowStep(201, 'APPROVED', null, 7);
    expect(result.isComplete).toBe(true);
  });

  it('should approve last step for INDICATOR_DIVISION_REPORT and update history', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 203, decision: 'PENDING', approval_instance_id: 103, step_label: 'HOD', step_order: 1 })
      .mockResolvedValueOnce({ id: 103, entity_type: 'INDICATOR_DIVISION_REPORT', entity_id: 9, status: 'IN_REVIEW' });

    const { trxFn, chain: tChain } = makeTransactionMock();
    db.transaction = jest.fn().mockImplementation((cb) => cb(trxFn));
    tChain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r)); // no pending steps
    tChain.first
      .mockResolvedValueOnce({ id: 203, decision: 'APPROVED' })
      .mockResolvedValueOnce({ id: 103, status: 'APPROVED' });

    const result = await svc.decideWorkflowStep(203, 'APPROVED', null, 7);
    expect(result.isComplete).toBe(true);
    // history + history update both called for INDICATOR_DIVISION_REPORT
    expect(tChain.insert).toHaveBeenCalled();
    expect(tChain.update).toHaveBeenCalled();
  });
});

describe('decideWorkflowStep — APPROVED path (intermediate step)', () => {
  it('should NOT mark isComplete when more pending steps remain', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 200, decision: 'PENDING', approval_instance_id: 100, step_label: 'Step1', step_order: 1 })
      .mockResolvedValueOnce({ id: 100, entity_type: 'ACTIVITY_REPORT', entity_id: 5, status: 'IN_REVIEW' });

    const { trxFn, chain: tChain } = makeTransactionMock();
    db.transaction = jest.fn().mockImplementation((cb) => cb(trxFn));
    // pendingSteps has remaining steps
    tChain.then.mockImplementationOnce((r) =>
      Promise.resolve([{ id: 201, step_order: 2, decision: 'PENDING' }]).then(r)
    );
    tChain.first
      .mockResolvedValueOnce({ id: 200, decision: 'APPROVED' })
      .mockResolvedValueOnce({ id: 100, status: 'IN_REVIEW' });

    const result = await svc.decideWorkflowStep(200, 'APPROVED', null, 7);
    expect(result.isComplete).toBe(false);
  });
});

describe('decideWorkflowStep — error cases', () => {
  it('should throw INSTANCE_NOT_FOUND when instance is missing', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 200, decision: 'PENDING', approval_instance_id: 100 })
      .mockResolvedValueOnce(undefined); // instance not found

    await expect(svc.decideWorkflowStep(200, 'APPROVED', null, 7))
      .rejects.toMatchObject({ code: 'INSTANCE_NOT_FOUND' });
  });

  it('should throw UNKNOWN_ENTITY_TYPE when instance entity_type is unknown', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 200, decision: 'PENDING', approval_instance_id: 100 })
      .mockResolvedValueOnce({ id: 100, entity_type: 'GHOST_ENTITY', entity_id: 1, status: 'IN_REVIEW' });

    await expect(svc.decideWorkflowStep(200, 'REJECTED', null, 7))
      .rejects.toMatchObject({ code: 'UNKNOWN_ENTITY_TYPE' });
  });
});

// ── resolveApprover — direct coverage ────────────────────────────────────────
describe('resolveApprover (exported)', () => {
  it('should return null when divisionCode is null and scope is DIVISION', async () => {
    const result = await svc.resolveApprover('HEAD_OF_DIVISION', 'DIVISION', null, null);
    // With no divisionCode, falls through to GLOBAL lookup
    // GLOBAL: db query returns undefined → null
    db.__chain.first.mockResolvedValueOnce(undefined);
    expect(result).toBeNull();
  });

  it('should return null when canonical division not found', async () => {
    db.__chain.first.mockResolvedValueOnce(null); // resolveCanonicalDivision → null
    const result = await svc.resolveApprover('HEAD_OF_DIVISION', 'DIVISION', 'GHOST', null);
    expect(result).toBeNull();
  });

  it('should return the first focal person of the division for FOCAL_PERSON scope=DIVISION', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ code: 'DCM', alias_of: null }) // canonical
      .mockResolvedValueOnce({ user_id: '42' });              // first FOCAL_PERSON row
    const result = await svc.resolveApprover('FOCAL_PERSON', 'DIVISION', 'DCM', null);
    expect(result).toBe(42);
    expect(db).toHaveBeenCalledWith('user_divisions');
    expect(db.__chain.where).toHaveBeenCalledWith({ division_code: 'DCM', role: 'FOCAL_PERSON' });
  });

  it('should return null for FOCAL_PERSON when the division has no focal person', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ code: 'DCM', alias_of: null })
      .mockResolvedValueOnce(undefined);
    const result = await svc.resolveApprover('FOCAL_PERSON', 'DIVISION', 'DCM', null);
    expect(result).toBeNull();
  });

  it('should resolve via alias_of when division is an alias', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ code: 'DCMA', alias_of: 'DCM' }) // alias → canonical = DCM
      .mockResolvedValueOnce({ code: 'DCM', alias_of: null, responsible_user_id: 7 });
    const result = await svc.resolveApprover('HEAD_OF_DIVISION', 'DIVISION', 'DCMA', null);
    expect(result).toBe(7);
  });

  // D-20261009-03 — approver escalation up the org chart
  it('should escalate HEAD_OF_DIVISION to the directorate director when the division has no head', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ code: 'CLDS', alias_of: null, parent_code: 'CLSN', level_type: 'division', responsible_user_id: null })
      .mockResolvedValueOnce({ code: 'CLSN', alias_of: null, parent_code: null, level_type: 'directorate', responsible_user_id: 31 });
    expect(await svc.resolveApprover('HEAD_OF_DIVISION', 'DIVISION', 'CLDS', null)).toBe(31);
  });

  it('should return null (no GLOBAL fallback) when nobody is responsible up the chain', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ code: 'CLDS', alias_of: null, parent_code: 'CLSN', level_type: 'division', responsible_user_id: null })
      .mockResolvedValueOnce({ code: 'CLSN', alias_of: null, parent_code: null, level_type: 'directorate', responsible_user_id: null });
    expect(await svc.resolveApprover('HEAD_OF_DIVISION', 'DIVISION', 'CLDS', null)).toBeNull();
  });

  it('should resolve DIRECTOR to the directorate responsible, skipping the division head', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ code: 'CLDS', alias_of: null, parent_code: 'CLSN', level_type: 'division', responsible_user_id: 7 })
      .mockResolvedValueOnce({ code: 'CLSN', alias_of: null, parent_code: null, level_type: 'directorate', responsible_user_id: 31 });
    expect(await svc.resolveApprover('DIRECTOR', 'DIVISION', 'CLDS', null)).toBe(31);
  });

  it('should resolve DIRECTOR on a directorate code to its own responsible', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ code: 'CPI', alias_of: null, parent_code: null, level_type: 'directorate', responsible_user_id: 40 });
    expect(await svc.resolveApprover('DIRECTOR', 'DIVISION', 'CPI', null)).toBe(40);
  });

  it('should resolve ME_OFFICER to the division M&E officer before the GLOBAL fallback', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ code: 'DCM', alias_of: null, parent_code: null, m_and_e_user_id: 12 })
      .mockResolvedValueOnce({ id: 12 }); // active M&E officer (D-20261022-01)
    expect(await svc.resolveApprover('ME_OFFICER', 'DIVISION', 'DCM', null)).toBe(12);
  });

  it('should leave the M&E step to the pool when no division officer exists (D-20261015-07)', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ code: 'DCM', alias_of: null, parent_code: null, m_and_e_user_id: null })
      .mockResolvedValueOnce({ id: 99 }); // would be the first M&E officer: must not be used
    expect(await svc.resolveApprover('ME_OFFICER', 'DIVISION', 'DCM', null)).toBeNull();
  });

  it('should use the division M&E officer on a GLOBAL M&E step', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ code: 'DCM', alias_of: null, parent_code: null, m_and_e_user_id: 12 })
      .mockResolvedValueOnce({ id: 12 });
    expect(await svc.resolveApprover('ME_OFFICER', 'GLOBAL', 'DCM', null)).toBe(12);
  });

  it('should keep the first-user fallback for other GLOBAL roles', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 46 });
    expect(await svc.resolveApprover('RBM_ADMIN', 'GLOBAL', null, null)).toBe(46);
  });
});