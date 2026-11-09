/* eslint-disable no-restricted-syntax --
 * P-31: these are DB column-enum WIRE values in test fixtures/assertions
 * (plan_nodes.node_type = 'SPECIFIC_ACTIVITY'/'BROAD_ACTIVITY'/'OUTCOME_INDICATOR', etc.;
 * workplan_items.item_type = 'ACTIVITY'/'TASK'), NOT ENTITY_TYPES identifiers.
 * Literal wire values are intentional in tests so a column-enum rename is caught
 * by a failing test instead of masked by importing the enum. Mirrors the source
 * plan-nodes route files which carry the same documented P-31 exception.
 */
// ── approvalHistoryService unit tests ──

const svc = require('../../src/services/approvalHistoryService');
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
  c.select.mockReset().mockReturnValue(c);
  c.orderBy.mockReset().mockReturnValue(c);
}

beforeEach(() => {
  resetChain();
});

describe('approvalHistoryService.getApprovalHistoryForEntity', () => {
  it('should return empty instances when no approval instances exist', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    const result = await svc.getApprovalHistoryForEntity('activity_report', 42);
    expect(result).toEqual({ instances: [] });
  });

  it('should attach steps to each instance', async () => {
    const instances = [
      { id: 9, entity_type: 'activity_report', entity_id: 42, round: 2 },
      { id: 5, entity_type: 'activity_report', entity_id: 42, round: 1 },
    ];
    const steps = [
      { id: 100, approval_instance_id: 9, step_order: 1, status: 'APPROVED' },
      { id: 101, approval_instance_id: 9, step_order: 2, status: 'PENDING' },
      { id: 90, approval_instance_id: 5, step_order: 1, status: 'APPROVED' },
    ];

    db.__chain.then
      .mockImplementationOnce((r) => Promise.resolve(instances).then(r)) // instances query
      .mockImplementationOnce((r) => Promise.resolve(steps).then(r));    // steps query

    const result = await svc.getApprovalHistoryForEntity('activity_report', 42);
    expect(result.instances).toHaveLength(2);
    expect(result.instances[0].steps).toHaveLength(2);
    expect(result.instances[1].steps).toHaveLength(1);
  });

  it('should return empty steps array for instances that have no steps', async () => {
    const instances = [{ id: 9, entity_type: 'activity_report', entity_id: 42, round: 1 }];

    db.__chain.then
      .mockImplementationOnce((r) => Promise.resolve(instances).then(r))
      .mockImplementationOnce((r) => Promise.resolve([]).then(r)); // no steps

    const result = await svc.getApprovalHistoryForEntity('activity_report', 42);
    expect(result.instances[0].steps).toEqual([]);
  });

  it('should handle different entity types correctly', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    const result = await svc.getApprovalHistoryForEntity('specific_activity', 99);
    expect(result).toEqual({ instances: [] });
  });

  it('should preserve original instance data when attaching steps', async () => {
    const instances = [{ id: 1, entity_type: 'report', entity_id: 10, round: 1, status: 'PENDING' }];
    const steps = [{ id: 50, approval_instance_id: 1, step_order: 1, role: 'HOD' }];

    db.__chain.then
      .mockImplementationOnce((r) => Promise.resolve(instances).then(r))
      .mockImplementationOnce((r) => Promise.resolve(steps).then(r));

    const result = await svc.getApprovalHistoryForEntity('report', 10);
    expect(result.instances[0]).toMatchObject({ id: 1, status: 'PENDING' });
    expect(result.instances[0].steps[0]).toMatchObject({ role: 'HOD' });
  });
});