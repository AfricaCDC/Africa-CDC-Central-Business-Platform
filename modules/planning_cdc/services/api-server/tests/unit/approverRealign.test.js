// ── Pending M&E sign-offs follow the unit's current M&E officer (D-20261022-01) ──
//
// The step query is checked with a real knex query builder (no connection);
// the reassignment with a small fake knex. resolveMeOfficer is mocked.

jest.mock('../../src/services/approverPool', () => ({ resolveMeOfficer: jest.fn() }));

const { resolveMeOfficer } = require('../../src/services/approverPool');
const { realignMeSteps, _internals } = require('../../src/services/approverRealign');

const realKnex = jest.requireActual('knex')({ client: 'mysql2' });

/** Fake knex: the step query resolves to `steps`; updates are recorded. */
function fakeKnex(steps) {
  const updates = [];
  const knex = (table) => {
    if (table === 'approval_steps as s') {
      const q = realKnex(table);
      q.then = (resolve, reject) => Promise.resolve(steps).then(resolve, reject);
      return q;
    }
    return { where: (_col, id) => ({ update: async (row) => { updates.push({ id, ...row }); } }) };
  };
  knex.raw = realKnex.raw.bind(realKnex);
  knex.fn = { now: () => 'NOW' };
  return { knex, updates };
}

beforeEach(() => jest.clearAllMocks());

describe('realignMeSteps', () => {
  it('should move a step from a former M&E officer to the unit\'s current one', async () => {
    resolveMeOfficer.mockResolvedValue(48);
    const { knex, updates } = fakeKnex([{ id: 893, approver_id: 40, unit: 'FMG' }]);
    expect(await realignMeSteps(knex)).toEqual([{ step_id: 893, from: 40, to: 48, unit: 'FMG' }]);
    expect(updates).toEqual([{ id: 893, approver_id: 48, updated_at: 'NOW' }]);
  });

  it('should leave a step already on the unit\'s M&E officer', async () => {
    resolveMeOfficer.mockResolvedValue(48);
    const { knex, updates } = fakeKnex([{ id: 1, approver_id: 48, unit: 'FMG' }]);
    expect(await realignMeSteps(knex)).toEqual([]);
    expect(updates).toEqual([]);
  });

  it('should send the step to the pool when the unit has no M&E officer any more', async () => {
    resolveMeOfficer.mockResolvedValue(null);
    const { knex, updates } = fakeKnex([{ id: 2, approver_id: 40, unit: 'FMG' }]);
    expect(await realignMeSteps(knex)).toEqual([{ step_id: 2, from: 40, to: null, unit: 'FMG' }]);
    expect(updates[0].approver_id).toBeNull();
  });

  it('should assign a pool step once the unit has an M&E officer, resolving each unit once', async () => {
    resolveMeOfficer.mockResolvedValue(48);
    const { knex } = fakeKnex([{ id: 3, approver_id: null, unit: 'FMG' }, { id: 4, approver_id: null, unit: 'FMG' }]);
    expect((await realignMeSteps(knex)).map((c) => c.to)).toEqual([48, 48]);
    expect(resolveMeOfficer).toHaveBeenCalledTimes(1);
  });

  it('should leave a step whose report has no known unit', async () => {
    const { knex } = fakeKnex([{ id: 5, approver_id: 40, unit: null }]);
    expect(await realignMeSteps(knex)).toEqual([]);
    expect(resolveMeOfficer).not.toHaveBeenCalled();
  });

  it('should select pending M&E steps of reports in review with their main unit', () => {
    const sql = _internals.pendingMeSteps(realKnex).toString();
    expect(sql).toContain("`s`.`role_code` = 'ME_OFFICER'");
    expect(sql).toContain("`s`.`decision` = 'PENDING'");
    expect(sql).toContain("`ai`.`status` = 'IN_REVIEW'");
    expect(sql).toContain('COALESCE(p.responsible_division_code, ir.division_code) as unit');
  });
});
