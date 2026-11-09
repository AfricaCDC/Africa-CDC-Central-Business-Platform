// ── M&E approver pool (D-20261015-07) ──
//
// The SQL of the reminder join is checked with a real knex query builder
// (no connection); the chain lookup with the shared knex mock.

const { ROLES } = require('@rbm/lib/roles');
const db = require('../../src/config/db');
const { isPoolRole, resolveMeOfficer, joinApproverOrPool } = require('../../src/services/approverPool');

const realKnex = jest.requireActual('knex')({ client: 'mysql2' });

beforeEach(() => {
  jest.clearAllMocks();
  db.__chain.first.mockReset().mockResolvedValue(undefined);
});

describe('isPoolRole', () => {
  it('should pool only the M&E officer step', () => {
    expect(isPoolRole(ROLES.ME_OFFICER)).toBe(true);
    expect(isPoolRole(ROLES.HEAD_OF_DIVISION)).toBe(false);
    expect(isPoolRole(ROLES.RBM_ADMIN)).toBe(false);
  });
});

describe('resolveMeOfficer', () => {
  it('should return the M&E officer of the unit', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ code: 'CLDS', alias_of: null, parent_code: null, m_and_e_user_id: 20 })
      .mockResolvedValueOnce({ id: 20 }); // active, still an M&E officer
    expect(await resolveMeOfficer(db, 'CLDS')).toBe(20);
  });

  it('should return null (pool) when the named holder lost the M&E role or left', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ code: 'FMG', alias_of: null, parent_code: null, m_and_e_user_id: 40 })
      .mockResolvedValueOnce(undefined);
    expect(await resolveMeOfficer(db, 'FMG')).toBeNull();
  });

  it('should return null (pool) without a unit or without an officer', async () => {
    expect(await resolveMeOfficer(db, null)).toBeNull();
    db.__chain.first.mockResolvedValueOnce({ code: 'EPR', alias_of: null, parent_code: null, m_and_e_user_id: null });
    expect(await resolveMeOfficer(db, 'EPR')).toBeNull();
  });
});

describe('joinApproverOrPool', () => {
  it('should join the approver, or every holder of the role on an unassigned pool step', () => {
    const sql = joinApproverOrPool(realKnex('approval_steps as s')).select('u.id').toString();
    expect(sql).toContain('`u`.`id` = `s`.`approver_id` or (`s`.`approver_id` is null');
    expect(sql).toContain("`s`.`role_code` in ('ME_OFFICER')");
    expect(sql).toContain('pro.code = s.role_code');
  });
});
