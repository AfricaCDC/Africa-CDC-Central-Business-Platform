// ── contributorWorkflowEngine unit tests ──
//
// Tests: startContributorWorkflow, adminBypassInstance, resolveContribApprover

jest.mock('../../src/services/workflowTemplateService', () => ({
  getActiveTemplateForEntity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/middleware/auditLog', () => ({
  audit: jest.fn().mockResolvedValue(undefined),
}));

const svc = require('../../src/services/contributorWorkflowEngine');
const { getActiveTemplateForEntity } = require('../../src/services/workflowTemplateService');
const { audit } = require('../../src/middleware/auditLog');
const db = require('../../src/config/db');

const MOCK_TEMPLATE = {
  id: 10,
  name: 'Contributor Chain',
  entity_type: 'INDICATOR_ACTUAL',
  steps: [
    { step_order: 1, step_label: 'Contrib HOD', role_code: 'HEAD_OF_DIVISION', scope: 'CONTRIB_DIVISION', is_required: true },
    { step_order: 2, step_label: 'Main HOD', role_code: 'HEAD_OF_DIVISION', scope: 'MAIN_DIVISION', is_required: true },
    { step_order: 3, step_label: 'M&E Sign-off', role_code: 'ME_OFFICER', scope: 'GLOBAL', is_required: false },
  ],
};

function resetChain() {
  const c = db.__chain;
  c.first.mockReset().mockResolvedValue(undefined);
  c.insert.mockReset().mockResolvedValue([1]);
  c.update.mockReset().mockResolvedValue(1);
  c.del.mockReset().mockResolvedValue(1);
  c.delete.mockReset().mockResolvedValue(1);
  c.pluck.mockReset().mockResolvedValue([]);
  c.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  c.where.mockReset().mockReturnValue(c);
  c.whereIn.mockReset().mockReturnValue(c);
  c.whereNot.mockReset().mockReturnValue(c);
  c.whereNull.mockReset().mockReturnValue(c);
  c.select.mockReset().mockReturnValue(c);
  c.orderBy.mockReset().mockReturnValue(c);
  c.leftJoin.mockReset().mockReturnValue(c);
  c.join.mockReset().mockReturnValue(c);
  c.count.mockReset().mockReturnValue(c);
  c.andWhere.mockReset().mockReturnValue(c);
}

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  getActiveTemplateForEntity.mockResolvedValue(undefined);
  audit.mockResolvedValue(undefined);
});

// ── startContributorWorkflow ──────────────────────────────────────────────────
describe('contributorWorkflowEngine.startContributorWorkflow', () => {
  it('should throw TEMPLATE_NOT_FOUND when no template', async () => {
    getActiveTemplateForEntity.mockResolvedValueOnce(undefined);
    await expect(
      svc.startContributorWorkflow({
        entityType: 'INDICATOR_ACTUAL', entityId: 1,
        submittedById: 7, contribOrgCode: 'DCM', mainOrgCode: 'AMERT',
      })
    ).rejects.toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
  });

  it('should throw TEMPLATE_NOT_FOUND when template has no steps', async () => {
    getActiveTemplateForEntity.mockResolvedValueOnce({ id: 1, steps: [] });
    await expect(
      svc.startContributorWorkflow({
        entityType: 'INDICATOR_ACTUAL', entityId: 1,
        submittedById: 7, contribOrgCode: 'DCM', mainOrgCode: 'AMERT',
      })
    ).rejects.toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
  });

  it('should throw UNKNOWN_ENTITY_TYPE for unsupported entity type', async () => {
    getActiveTemplateForEntity.mockResolvedValueOnce({ ...MOCK_TEMPLATE });
    await expect(
      svc.startContributorWorkflow({
        entityType: 'UNKNOWN_TYPE', entityId: 1,
        submittedById: 7, contribOrgCode: 'DCM', mainOrgCode: 'AMERT',
      })
    ).rejects.toMatchObject({ code: 'UNKNOWN_ENTITY_TYPE' });
  });

  it('should throw ENTITY_NOT_FOUND when entity does not exist in DB', async () => {
    getActiveTemplateForEntity.mockResolvedValueOnce({ ...MOCK_TEMPLATE });
    // entity query returns nothing
    db.__chain.first.mockResolvedValueOnce(undefined);
    await expect(
      svc.startContributorWorkflow({
        entityType: 'INDICATOR_ACTUAL', entityId: 999,
        submittedById: 7, contribOrgCode: 'DCM', mainOrgCode: 'AMERT',
      })
    ).rejects.toMatchObject({ code: 'ENTITY_NOT_FOUND' });
  });

  it('should succeed and return { instance, steps, blockedSteps }', async () => {
    getActiveTemplateForEntity.mockResolvedValueOnce({ ...MOCK_TEMPLATE });
    // Entity found
    db.__chain.first
      .mockResolvedValueOnce({ id: 1, status: 'DRAFT' })   // entity row
      .mockResolvedValueOnce(null)                          // priorRejected check → no prior
      .mockResolvedValueOnce({ id: 100, status: 'IN_REVIEW' }) // re-fetch instance
      // division_codes.responsible_user_id (up-chain) for the two division steps
      .mockResolvedValueOnce({ code: 'DCM', alias_of: null, responsible_user_id: 5 })   // contrib head
      .mockResolvedValueOnce({ code: 'AMERT', alias_of: null, responsible_user_id: 5 }) // main head
      // GLOBAL step → user_roles join
      .mockResolvedValueOnce({ id: 2 }); // ME_OFFICER user

    // priorInstanceIds (pluck) → none
    db.__chain.pluck.mockResolvedValueOnce([]);

    // insert instance → [100]
    db.__chain.insert
      .mockResolvedValueOnce([100]) // approval_instances
      .mockResolvedValueOnce([undefined]); // approval_steps

    // steps fetch after transaction
    db.__chain.then
      .mockImplementationOnce((r) => Promise.resolve([{ id: 1 }, { id: 2 }, { id: 3 }]).then(r));

    // division_codes selects for resolver
    db.__chain.where.mockReturnValue(db.__chain);
    db.__chain.select.mockReturnValue(db.__chain);

    const result = await svc.startContributorWorkflow({
      entityType: 'INDICATOR_ACTUAL', entityId: 1,
      submittedById: 7, contribOrgCode: 'DCM', mainOrgCode: 'AMERT',
    });
    expect(result).toHaveProperty('instance');
    expect(result).toHaveProperty('steps');
    expect(result).toHaveProperty('blockedSteps');
    expect(Array.isArray(result.blockedSteps)).toBe(true);
  });
});

// ── adminBypassInstance ───────────────────────────────────────────────────────
describe('contributorWorkflowEngine.adminBypassInstance', () => {
  it('should throw INSTANCE_NOT_FOUND when instance not found', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    await expect(
      svc.adminBypassInstance({ instanceId: 999, adminUserId: 1, comments: 'Absent HOD' })
    ).rejects.toMatchObject({ code: 'INSTANCE_NOT_FOUND' });
  });

  it('should throw INVALID_STATE when instance is not IN_REVIEW', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 1, status: 'APPROVED', entity_type: 'INDICATOR_ACTUAL' });
    await expect(
      svc.adminBypassInstance({ instanceId: 1, adminUserId: 1, comments: 'Bypass' })
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('should throw UNKNOWN_ENTITY_TYPE for unsupported entity', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 1, status: 'IN_REVIEW', entity_type: 'UNKNOWN_TYPE' });
    await expect(
      svc.adminBypassInstance({ instanceId: 1, adminUserId: 1, comments: 'x' })
    ).rejects.toMatchObject({ code: 'UNKNOWN_ENTITY_TYPE' });
  });

  it('should throw NO_BYPASSABLE_STEP when no pending/blocked steps', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 1, status: 'IN_REVIEW', entity_type: 'INDICATOR_ACTUAL', entity_id: 5 });
    // candidateSteps → empty array
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await expect(
      svc.adminBypassInstance({ instanceId: 1, adminUserId: 1, comments: 'x' })
    ).rejects.toMatchObject({ code: 'NO_BYPASSABLE_STEP' });
  });

  it('should bypass single step and return result when bypassAll=false', async () => {
    const instance = { id: 1, status: 'IN_REVIEW', entity_type: 'INDICATOR_ACTUAL', entity_id: 5 };
    db.__chain.first
      .mockResolvedValueOnce(instance)                                    // load instance
      .mockResolvedValueOnce({ c: '0' })                                  // _hasNoRemainingSteps count
      .mockResolvedValueOnce({ id: 1, status: 'IN_REVIEW', entity_type: 'INDICATOR_ACTUAL', entity_id: 5 }) // re-fetch instance
    ;

    // candidateSteps (then) → one blocked step
    db.__chain.then
      .mockImplementationOnce((r) => Promise.resolve([
        { id: 10, step_order: 1, step_label: 'HOD', decision: 'BLOCKED', approver_id: null },
      ]).then(r))
      // steps re-fetch at end of transaction
      .mockImplementationOnce((r) => Promise.resolve([{ id: 10 }]).then(r));

    db.__chain.update.mockResolvedValue(1);

    const result = await svc.adminBypassInstance({ instanceId: 1, adminUserId: 1, comments: 'HOD absent' });
    expect(result).toHaveProperty('instance');
    expect(result).toHaveProperty('steps');
    expect(result).toHaveProperty('isComplete');
  });
});

// ── resolveContribApprover ────────────────────────────────────────────────────
describe('contributorWorkflowEngine.resolveContribApprover', () => {
  it('should return null when scope is CONTRIB_DIVISION and no org code', async () => {
    const result = await svc.resolveContribApprover('HEAD_OF_DIVISION', 'CONTRIB_DIVISION', {});
    expect(result).toBeNull();
  });

  it('should return null when canonical division not found', async () => {
    db.__chain.first
      .mockResolvedValueOnce(null); // division_codes row for canonical lookup
    const result = await svc.resolveContribApprover('HEAD_OF_DIVISION', 'CONTRIB_DIVISION', { contribOrgCode: 'GHOST' });
    expect(result).toBeNull();
  });

  it('should return responsible_user_id for CONTRIB_DIVISION scope', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ code: 'DCM', alias_of: null, responsible_user_id: 7 });
    const result = await svc.resolveContribApprover('HEAD_OF_DIVISION', 'CONTRIB_DIVISION', { contribOrgCode: 'DCM' });
    expect(result).toBe(7);
  });

  it('should return responsible_user_id for MAIN_DIVISION scope', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ code: 'AMERT', alias_of: null, responsible_user_id: 3 });
    const result = await svc.resolveContribApprover('HEAD_OF_DIVISION', 'MAIN_DIVISION', { mainOrgCode: 'AMERT' });
    expect(result).toBe(3);
  });

  it('should escalate to the directorate director when the contributor division has no head (D-20261009-03)', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ code: 'DCM', alias_of: null, parent_code: 'CLSN', responsible_user_id: null })
      .mockResolvedValueOnce({ code: 'CLSN', alias_of: null, parent_code: null, responsible_user_id: 31 });
    const result = await svc.resolveContribApprover('HEAD_OF_DIVISION', 'CONTRIB_DIVISION', { contribOrgCode: 'DCM' });
    expect(result).toBe(31);
  });

  it('should return first active user for GLOBAL scope (non-M&E role)', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 2 });
    const result = await svc.resolveContribApprover('RBM_ADMIN', 'GLOBAL', {});
    expect(result).toBe(2);
  });

  it('should give the M&E step to the M&E officer of the main unit', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ code: 'CLDS', alias_of: null, parent_code: null, m_and_e_user_id: 20 })
      .mockResolvedValueOnce({ id: 20 }); // active M&E officer (D-20261022-01)
    expect(await svc.resolveContribApprover('ME_OFFICER', 'GLOBAL', { mainOrgCode: 'CLDS' })).toBe(20);
  });

  it('should leave the M&E step to the pool when the unit has no M&E officer (D-20261015-07)', async () => {
    db.__chain.first.mockResolvedValueOnce({ code: 'EPR', alias_of: null, parent_code: null, m_and_e_user_id: null });
    expect(await svc.resolveContribApprover('ME_OFFICER', 'GLOBAL', { mainOrgCode: 'EPR' })).toBeNull();
    expect(await svc.resolveContribApprover('ME_OFFICER', 'GLOBAL', {})).toBeNull();
  });

  it('should return null for GLOBAL scope when no user found', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    const result = await svc.resolveContribApprover('ME_OFFICER', 'GLOBAL', {});
    expect(result).toBeNull();
  });

  it('should return null for unknown scope', async () => {
    const result = await svc.resolveContribApprover('ROLE', 'UNKNOWN_SCOPE', {});
    expect(result).toBeNull();
  });
});
