// ── workflowDecisions — generic engine-decision helper ──
//
// Pure unit tests with the shared knex mock and a mocked workflowEngine.
// Contract under test:
//   - no open IN_REVIEW instance          → { handled:false } (caller falls back)
//   - instance + actionable step          → decideWorkflowStep(step_id, …)
//   - instance + no step, non-admin       → 403 NO_PENDING_STEP
//   - instance + no step, allowUnassigned → { handled:false } (admin fallback)

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/services/workflowEngine', () => ({
  decideWorkflowStep: jest.fn().mockResolvedValue({ isComplete: true }),
}));

const workflowEngine = require('../../src/services/workflowEngine');
const { decideEntityStep, findPendingStepForUser, hasOpenInstance } = require('../../src/services/workflowDecisions');

function resetChain() {
  const c = sharedDb.__chain;
  c.first.mockReset().mockResolvedValue(undefined);
  c.pluck.mockReset().mockResolvedValue([]);
  c.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
}

beforeEach(() => {
  resetChain();
  workflowEngine.decideWorkflowStep.mockClear();
});

describe('hasOpenInstance', () => {
  it('should return false when no IN_REVIEW instance exists', async () => {
    expect(await hasOpenInstance('ACTIVITY_REPORT', 7)).toBe(false);
  });

  it('should return true when an open instance exists', async () => {
    sharedDb.__chain.first.mockResolvedValueOnce({ id: 5 });
    expect(await hasOpenInstance('ACTIVITY_REPORT', 7)).toBe(true);
  });
});

describe('decideEntityStep', () => {
  it('should return handled:false when there is no open instance', async () => {
    const res = await decideEntityStep({
      entityType: 'ACTIVITY_REPORT', entityId: 7, decision: 'APPROVED', userId: 20,
    });
    expect(res).toEqual({ handled: false });
    expect(workflowEngine.decideWorkflowStep).not.toHaveBeenCalled();
  });

  it('should decide the actionable step through the engine', async () => {
    sharedDb.__chain.first
      .mockResolvedValueOnce({ id: 5 }) // open instance
      .mockResolvedValueOnce({ step_id: 11, step_label: 'HOD approval', step_order: 1 }); // step
    const res = await decideEntityStep({
      entityType: 'ACTIVITY_REPORT', entityId: 7, decision: 'APPROVED', userId: 20,
      comment: 'ok', allowUnassigned: true,
    });
    expect(res.handled).toBe(true);
    expect(workflowEngine.decideWorkflowStep)
      .toHaveBeenCalledWith(11, 'APPROVED', 'ok', 20, undefined);
  });

  it('should throw 403 NO_PENDING_STEP for a non-admin caller with no step', async () => {
    sharedDb.__chain.first
      .mockResolvedValueOnce({ id: 5 }) // open instance
      .mockResolvedValueOnce(undefined); // no actionable step
    await expect(decideEntityStep({
      entityType: 'ACTIVITY_REPORT', entityId: 7, decision: 'REJECTED', userId: 99,
    })).rejects.toMatchObject({ status: 403, code: 'NO_PENDING_STEP' });
  });

  it('should return handled:false for a scope-all caller with nothing actionable', async () => {
    sharedDb.__chain.first
      .mockResolvedValueOnce({ id: 5 })
      .mockResolvedValueOnce(undefined);
    const res = await decideEntityStep({
      entityType: 'ACTIVITY_REPORT', entityId: 7, decision: 'APPROVED', userId: 99,
      allowUnassigned: true,
    });
    expect(res).toEqual({ handled: false });
  });
});

describe('findPendingStepForUser', () => {
  it('should restrict to assigned-or-unassigned steps for non-admin callers', async () => {
    sharedDb.__chain.first.mockResolvedValueOnce({ step_id: 3, step_label: 'x', step_order: 1 });
    const step = await findPendingStepForUser('PLAN_NODE', 42, 20);
    expect(step.step_id).toBe(3);
    // the assigned-or-null filter was applied (a where-group function was registered)
    const groupCall = sharedDb.__chain.where.mock.calls.find((c) => typeof c[0] === 'function');
    expect(groupCall).toBeTruthy();
  });

  it('should not apply the assignment filter when allowUnassigned', async () => {
    sharedDb.__chain.first.mockResolvedValueOnce({ step_id: 4, step_label: 'y', step_order: 2 });
    await findPendingStepForUser('PLAN_NODE', 42, 20, { allowUnassigned: true });
    const groupCall = sharedDb.__chain.where.mock.calls.find((c) => typeof c[0] === 'function');
    expect(groupCall).toBeFalsy();
  });
});
