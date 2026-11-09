// ── Approval trail of a specific activity (D-20261103-02) ──
//
// buildTrail is pure; getTrail runs on the shared knex mock.

jest.mock('../../src/services/divisionAliasService', () => ({ resolveHolderUpChain: jest.fn() }));

const db = require('../../src/config/db');
const { STATUSES } = require('@rbm/lib/enums');
const { resolveHolderUpChain } = require('../../src/services/divisionAliasService');
const { buildTrail, getTrail } = require('../../src/services/activityTrail');

const at = (min) => new Date(Date.UTC(2026, 10, 3, 9, min));
let seq = 0;
const row = (action, min, actor = 7, extra = {}) => ({
  id: ++seq, action, actor_id: actor, actor_name: actor === 7 ? 'Focal A' : 'Head B', details: null, timestamp: at(min), ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  db.__chain.first.mockReset().mockResolvedValue(undefined);
  // The shared mock has no whereNotIn.
  db.__chain.whereNotIn = jest.fn().mockReturnValue(db.__chain);
});

describe('buildTrail', () => {
  it('should list create, submit, reject with its reason, and approve in order', () => {
    const trail = buildTrail([
      row('SPECIFIC_ACTIVITY_CREATE', 0),
      row('SPECIFIC_ACTIVITY_SUBMIT', 30),
      row('SPECIFIC_ACTIVITY_REJECT', 40, 9, { details: JSON.stringify({ reason: 'Split the cost per quarter' }) }),
      row('SPECIFIC_ACTIVITY_APPROVE', 59, 9),
    ]);
    expect(trail.map((e) => e.label)).toEqual(['Created as draft', 'Submitted for approval', 'Rejected', 'Approved']);
    expect(trail[2]).toMatchObject({ actor: 'Head B', decision: STATUSES.REJECTED, comment: 'Split the cost per quarter' });
    expect(trail[3].decision).toBe(STATUSES.APPROVED);
    expect(trail[0].at).toBe(at(0).toISOString());
  });

  it('should fold the cost lines and screening saved with the creation into the creation line', () => {
    const trail = buildTrail([
      row('SPECIFIC_ACTIVITY_CREATE', 0),
      row('ACTIVITY_COST_LINES_UPDATED', 0),
      row('ACTIVITY_COMPLEXITY_SCREENED', 1),
    ]);
    expect(trail.map((e) => e.label)).toEqual(['Created as draft']);
  });

  it('should keep separate edits made later or by someone else', () => {
    const trail = buildTrail([
      row('SPECIFIC_ACTIVITY_CREATE', 0),
      row('SPECIFIC_ACTIVITY_UPDATE', 20),
      row('ACTIVITY_COST_LINES_UPDATED', 21),
      row('SPECIFIC_ACTIVITY_UPDATE', 22, 9),
    ]);
    expect(trail.map((e) => [e.label, e.actor])).toEqual([
      ['Created as draft', 'Focal A'], ['Edited', 'Focal A'], ['Edited', 'Head B'],
    ]);
  });

  it('should show an edit that sends an approved activity back for approval on its own line', () => {
    const trail = buildTrail([
      row('SPECIFIC_ACTIVITY_UPDATE', 0),
      row('SPECIFIC_ACTIVITY_UPDATE', 1, 7, { details: { bumped_to_review: true } }),
    ]);
    expect(trail.map((e) => e.label)).toEqual(['Edited', 'Edited, sent back for approval']);
  });

  it('should mark an activity created by an administrator as approved, and skip unknown actions', () => {
    const trail = buildTrail([
      row('SPECIFIC_ACTIVITY_CREATE', 0, 9, { details: '{"admin_bypass":true}' }),
      row('OWNERSHIP_DISPUTE_DISMISSED', 1),
      row('SPECIFIC_ACTIVITY_CANCEL', 2, 9, { details: 'not json' }),
    ]);
    expect(trail.map((e) => [e.label, e.decision])).toEqual([
      ['Created and approved (administrator)', STATUSES.APPROVED], ['Cancelled', STATUSES.CANCELLED],
    ]);
  });

  it('should return an empty trail for an activity without audit rows', () => {
    expect(buildTrail([])).toEqual([]);
  });
});

describe('getTrail', () => {
  it('should not look for an approver when the activity is not in review', async () => {
    db.__chain.select.mockResolvedValueOnce([row('SPECIFIC_ACTIVITY_CREATE', 0)]);
    const data = await getTrail({ id: 4102, status: STATUSES.DRAFT, responsible_division_code: 'EPR' });
    expect(data).toEqual({ events: [expect.objectContaining({ label: 'Created as draft' })], waiting_for: null });
  });

  it('should name the approver of the pending workflow step', async () => {
    db.__chain.select.mockResolvedValueOnce([]);
    db.__chain.first.mockResolvedValueOnce({ step_label: 'Head of Division', name: 'Head B' });
    const data = await getTrail({ id: 4102, status: STATUSES.IN_REVIEW, responsible_division_code: 'EPR' });
    expect(data.waiting_for).toEqual({ step: 'Head of Division', name: 'Head B' });
    expect(resolveHolderUpChain).not.toHaveBeenCalled();
  });

  it('should fall back to the Responsible Person of the unit without a workflow step', async () => {
    db.__chain.select.mockResolvedValueOnce([]);
    db.__chain.first.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ name: 'Head B' });
    resolveHolderUpChain.mockResolvedValueOnce(9);
    const data = await getTrail({ id: 4102, status: STATUSES.IN_REVIEW, responsible_division_code: 'EPR' });
    expect(resolveHolderUpChain).toHaveBeenCalledWith(db, 'EPR', 'responsible_user_id');
    expect(data.waiting_for).toEqual({ step: 'Responsible Person of the Business Unit', name: 'Head B' });
  });

  it('should say nobody when the unit has no Responsible Person', async () => {
    db.__chain.select.mockResolvedValueOnce([]);
    db.__chain.first.mockResolvedValueOnce(undefined);
    resolveHolderUpChain.mockResolvedValueOnce(null);
    const data = await getTrail({ id: 4102, status: STATUSES.IN_REVIEW, responsible_division_code: 'NCD' });
    expect(data.waiting_for).toEqual({ step: 'Responsible Person of the Business Unit', name: null });
  });
});
