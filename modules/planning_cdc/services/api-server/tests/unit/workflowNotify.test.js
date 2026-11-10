// ── workflowNotify tests ──
// The approval engine must mail the approver on submit and the submitter on
// the final decision, for specific activities; reports keep their own events.

jest.mock('../../src/services/eventBusService', () => ({ emitEvent: jest.fn().mockResolvedValue({}) }));
jest.mock('../../src/config/db', () => {
  const rows = {
    plan_nodes: { id: 42, code: 'SDI.1.1.01.03', title: 'Train lab staff', responsible_division_code: 'SDI', created_by_user_id: 7 },
    users: { id: 7, email: 'focal@africacdc.org', first_name: 'Ama', last_name: 'Focal' },
  };
  const db = jest.fn((table) => {
    const b = { where: () => b, first: () => Promise.resolve(db.__fail ? Promise.reject(new Error('db down')) : rows[table]) };
    return b;
  });
  return db;
});

const db = require('../../src/config/db');
const { emitEvent } = require('../../src/services/eventBusService');
const { notifySubmitted, notifyDecided } = require('../../src/services/workflowNotify');
const { STATUSES } = require('@rbm/lib/enums');

beforeEach(() => {
  jest.clearAllMocks();
  db.__fail = false;
});

describe('notifySubmitted', () => {
  it('should emit plan_node.submitted with the activity and the submitter', async () => {
    await notifySubmitted({ entityType: 'PLAN_NODE', entityId: 42, submittedById: 7, steps: [{ approver_id: 9, step_label: 'HoD review' }] });
    expect(emitEvent).toHaveBeenCalledTimes(1);
    const call = emitEvent.mock.calls[0][0];
    expect(call.eventKey).toBe('plan_node.submitted');
    expect(call.entity).toMatchObject({ id: 42, responsible_division_code: 'SDI', entity_type: 'PLAN_NODE' });
    expect(call.metadata).toMatchObject({ entity_label: 'Specific activity', actor_name: 'Ama Focal', step_label: 'HoD review' });
    expect(call.metadata.reviewUrl).toMatch(/\/review-submissions$/);
  });

  it('should not emit for report entities that send their own events', async () => {
    await notifySubmitted({ entityType: 'INDICATOR_DIVISION_REPORT', entityId: 1, submittedById: 7 });
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('should never throw when the database fails', async () => {
    db.__fail = true;
    await expect(notifySubmitted({ entityType: 'PLAN_NODE', entityId: 42, submittedById: 7 })).resolves.toBeUndefined();
  });
});

describe('notifyDecided', () => {
  const instance = { entity_type: 'PLAN_NODE', entity_id: 42, submitted_by_id: 7 };

  it('should emit plan_node.approved to the submitter', async () => {
    await notifyDecided({ instance, decision: STATUSES.APPROVED, decidedById: 9 });
    const call = emitEvent.mock.calls[0][0];
    expect(call.eventKey).toBe('plan_node.approved');
    expect(call.entity.responsible_user_id).toBe(7);
    expect(call.metadata.reportUrl).toMatch(/\/my-specifics\/42\/edit$/);
  });

  it('should emit plan_node.rejected with the reason', async () => {
    await notifyDecided({ instance, decision: STATUSES.REJECTED, decidedById: 9, comments: 'Budget too high' });
    const call = emitEvent.mock.calls[0][0];
    expect(call.eventKey).toBe('plan_node.rejected');
    expect(call.metadata).toMatchObject({ decision: STATUSES.REJECTED, reason: 'Budget too high' });
  });

  it('should fall back to the creator when the instance has no submitter', async () => {
    await notifyDecided({ instance: { ...instance, submitted_by_id: null }, decision: STATUSES.APPROVED, decidedById: 9 });
    expect(emitEvent.mock.calls[0][0].entity.responsible_user_id).toBe(7);
  });

  it('should ignore other decisions and entity types', async () => {
    await notifyDecided({ instance, decision: STATUSES.DRAFT, decidedById: 9 });
    await notifyDecided({ instance: { ...instance, entity_type: 'ACTIVITY_REPORT' }, decision: STATUSES.APPROVED, decidedById: 9 });
    expect(emitEvent).not.toHaveBeenCalled();
  });
});
