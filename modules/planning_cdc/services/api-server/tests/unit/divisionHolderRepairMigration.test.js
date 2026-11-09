// ── Division holder repair migration tests ──
//
// Runs the migration's up() against an in-memory knex stand-in and asserts on
// the resulting rows. Fake ids and codes only; no real data.

jest.mock('@rbm/lib/logger', () => {
  const info = jest.fn();
  const child = () => ({ info, warn: jest.fn(), error: jest.fn(), debug: jest.fn() });
  return { createLogger: () => ({ child, info, warn: jest.fn(), error: jest.fn() }), __info: info };
});

const { makeFakeKnex } = require('../helpers/fakeKnex');
const migration = require('../../src/db/migrations/20261009120000_repair_division_holder_conflicts');
const R = require('@rbm/lib/user-divisions').DIVISION_ASSIGNMENT_ROLES;
const OLT = require('@rbm/lib/enums').ORG_LEVEL_TYPES;

/** Build the fake database from a seed. */
function setup({ divisions = [], userDivisions = [], userRoles = [] }) {
  const tables = {
    division_codes: divisions.map((d) => ({
      focal_user_id: null, responsible_user_id: null, m_and_e_user_id: null, alias_of: null, ...d,
    })),
    user_divisions: userDivisions.map((u, i) => ({ id: i + 1, is_primary: false, assigned_at: null, ...u })),
    user_roles: userRoles.map((r) => ({ ...r })),
  };
  return { knex: makeFakeKnex(tables), tables };
}

const rowsFor = (tables, userId, code) =>
  tables.user_divisions.filter((r) => r.user_id === userId && r.division_code === code).map((r) => r.role).sort();
const division = (tables, code) => tables.division_codes.find((d) => d.code === code);
const snapshot = (tables) => JSON.stringify(tables);

describe('divisionHolderRepair migration — up()', () => {
  it('keeps the DIRECTOR on a directorate even when a HEAD_OF_DIVISION row is newer (expected role wins)', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DIR1', level_type: OLT.DIRECTORATE }],
      userDivisions: [
        { user_id: 2, division_code: 'DIR1', role: R.DIRECTOR, assigned_at: '2026-07-07T09:00:00Z' },
        { user_id: 3, division_code: 'DIR1', role: R.HEAD_OF_DIVISION, assigned_at: '2026-07-10T09:00:00Z' },
      ],
    });

    await migration.up(knex);

    expect(division(tables, 'DIR1').responsible_user_id).toBe(2);
    expect(rowsFor(tables, 2, 'DIR1')).toEqual([R.DIRECTOR]);
    expect(rowsFor(tables, 3, 'DIR1')).toEqual([R.MEMBER]);
  });

  it('converts the only HEAD_OF_DIVISION row of a directorate to DIRECTOR and sets the column', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DIR2', level_type: OLT.DIRECTORATE }],
      userDivisions: [{ user_id: 4, division_code: 'DIR2', role: R.HEAD_OF_DIVISION, assigned_at: '2026-07-10T09:00:00Z' }],
    });

    await migration.up(knex);

    expect(division(tables, 'DIR2').responsible_user_id).toBe(4);
    expect(rowsFor(tables, 4, 'DIR2')).toEqual([R.DIRECTOR]);
  });

  it('keeps the newest of two DIRECTORs on a directorate and demotes the other', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DIR3', level_type: OLT.DIRECTORATE }],
      userDivisions: [
        { user_id: 5, division_code: 'DIR3', role: R.DIRECTOR, assigned_at: '2026-07-10T11:09:00Z' },
        { user_id: 6, division_code: 'DIR3', role: R.DIRECTOR, assigned_at: '2026-07-10T12:28:00Z' },
      ],
    });

    await migration.up(knex);

    expect(division(tables, 'DIR3').responsible_user_id).toBe(6);
    expect(rowsFor(tables, 6, 'DIR3')).toEqual([R.DIRECTOR]);
    expect(rowsFor(tables, 5, 'DIR3')).toEqual([R.MEMBER]);
  });

  it('keeps the 12:28 candidate over the 11:09 one on a division', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DPHI', level_type: OLT.DIVISION }],
      userDivisions: [
        { user_id: 7, division_code: 'DPHI', role: R.HEAD_OF_DIVISION, assigned_at: '2026-07-10T11:09:00Z' },
        { user_id: 8, division_code: 'DPHI', role: R.HEAD_OF_DIVISION, assigned_at: '2026-07-10T12:28:00Z' },
      ],
    });

    await migration.up(knex);

    expect(division(tables, 'DPHI').responsible_user_id).toBe(8);
    expect(rowsFor(tables, 7, 'DPHI')).toEqual([R.MEMBER]);
  });

  it('breaks an assigned_at tie in favour of the current holder, then the lowest user id', async () => {
    const same = '2026-07-10T12:00:00Z';
    const { knex, tables } = setup({
      divisions: [
        { code: 'DPA', level_type: OLT.DIVISION, responsible_user_id: 9 },
        { code: 'DPB', level_type: OLT.DIVISION },
      ],
      userDivisions: [
        { user_id: 9, division_code: 'DPA', role: R.HEAD_OF_DIVISION, assigned_at: same },
        { user_id: 3, division_code: 'DPA', role: R.HEAD_OF_DIVISION, assigned_at: same },
        { user_id: 12, division_code: 'DPB', role: R.HEAD_OF_DIVISION, assigned_at: same },
        { user_id: 11, division_code: 'DPB', role: R.HEAD_OF_DIVISION, assigned_at: same },
      ],
    });

    await migration.up(knex);

    expect(division(tables, 'DPA').responsible_user_id).toBe(9);
    expect(division(tables, 'DPB').responsible_user_id).toBe(11);
  });

  it('resolves M&E officers the same way and never touches FOCAL_PERSON rows', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DPHI', level_type: OLT.DIVISION }],
      userDivisions: [
        { user_id: 20, division_code: 'DPHI', role: R.ME_OFFICER, assigned_at: '2026-07-01T00:00:00Z' },
        { user_id: 21, division_code: 'DPHI', role: R.ME_OFFICER, assigned_at: '2026-07-02T00:00:00Z' },
        { user_id: 20, division_code: 'DPHI', role: R.FOCAL_PERSON, assigned_at: '2026-07-01T00:00:00Z' },
      ],
    });

    await migration.up(knex);

    expect(division(tables, 'DPHI').m_and_e_user_id).toBe(21);
    expect(rowsFor(tables, 21, 'DPHI')).toEqual([R.ME_OFFICER]);
    // The loser also holds a FOCAL row, so the ME row is deleted, not turned into MEMBER.
    expect(rowsFor(tables, 20, 'DPHI')).toEqual([R.FOCAL_PERSON]);
  });

  it('keeps only the expected role when one user holds both HEAD_OF_DIVISION and DIRECTOR', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DIR4', level_type: OLT.DIRECTORATE }],
      userDivisions: [
        { user_id: 30, division_code: 'DIR4', role: R.HEAD_OF_DIVISION, assigned_at: '2026-07-10T12:00:00Z' },
        { user_id: 30, division_code: 'DIR4', role: R.DIRECTOR, assigned_at: '2026-07-07T09:00:00Z' },
      ],
    });

    await migration.up(knex);

    expect(division(tables, 'DIR4').responsible_user_id).toBe(30);
    expect(rowsFor(tables, 30, 'DIR4')).toEqual([R.DIRECTOR]);
  });

  it('leaves a division with no candidates untouched', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'EMPTY', level_type: OLT.DIVISION }],
      userDivisions: [{ user_id: 40, division_code: 'EMPTY', role: R.MEMBER }],
    });

    await migration.up(knex);

    expect(division(tables, 'EMPTY').responsible_user_id).toBeNull();
    expect(rowsFor(tables, 40, 'EMPTY')).toEqual([R.MEMBER]);
  });

  it('skips alias rows as divisions and mirrors the resolved holder onto them', async () => {
    const { knex, tables } = setup({
      divisions: [
        { code: 'CANON', level_type: OLT.DIVISION },
        { code: 'ALIAS', level_type: OLT.DIVISION, alias_of: 'CANON' },
      ],
      userDivisions: [{ user_id: 50, division_code: 'CANON', role: R.HEAD_OF_DIVISION, assigned_at: '2026-07-10T00:00:00Z' }],
    });

    await migration.up(knex);

    expect(division(tables, 'CANON').responsible_user_id).toBe(50);
    expect(division(tables, 'ALIAS').responsible_user_id).toBe(50);
  });

  it('demotes the losing HEAD row to MEMBER (no delete) and keeps the winner FOCAL row intact', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DPHI', level_type: OLT.DIVISION }],
      userDivisions: [
        { user_id: 60, division_code: 'DPHI', role: R.HEAD_OF_DIVISION, assigned_at: '2026-07-01T00:00:00Z' },
        { user_id: 61, division_code: 'DPHI', role: R.HEAD_OF_DIVISION, assigned_at: '2026-07-02T00:00:00Z' },
        { user_id: 61, division_code: 'DPHI', role: R.FOCAL_PERSON, assigned_at: '2026-07-02T00:00:00Z' },
      ],
    });

    await migration.up(knex);

    expect(rowsFor(tables, 61, 'DPHI')).toEqual([R.FOCAL_PERSON, R.HEAD_OF_DIVISION]);
    expect(rowsFor(tables, 60, 'DPHI')).toEqual([R.MEMBER]);
    expect(tables.user_roles).toEqual([]);
  });

  it('is idempotent: a second run changes nothing', async () => {
    const { knex, tables } = setup({
      divisions: [
        { code: 'DIR5', level_type: OLT.DIRECTORATE },
        { code: 'DPHI', level_type: OLT.DIVISION },
      ],
      userDivisions: [
        { user_id: 70, division_code: 'DIR5', role: R.HEAD_OF_DIVISION, assigned_at: '2026-07-10T00:00:00Z' },
        { user_id: 71, division_code: 'DIR5', role: R.DIRECTOR, assigned_at: '2026-07-11T00:00:00Z' },
        { user_id: 72, division_code: 'DPHI', role: R.ME_OFFICER, assigned_at: '2026-07-11T00:00:00Z' },
        { user_id: 73, division_code: 'DPHI', role: R.ME_OFFICER, assigned_at: '2026-07-12T00:00:00Z' },
      ],
    });

    await migration.up(knex);
    const afterFirst = snapshot(tables);
    await migration.up(knex);

    expect(snapshot(tables)).toBe(afterFirst);
  });

  it('logs per-division outcomes and totals', async () => {
    const { __info } = require('@rbm/lib/logger');
    __info.mockClear();
    const { knex } = setup({
      divisions: [{ code: 'DPHI', level_type: OLT.DIVISION }],
      userDivisions: [{ user_id: 80, division_code: 'DPHI', role: R.HEAD_OF_DIVISION, assigned_at: '2026-07-10T00:00:00Z' }],
    });

    await migration.up(knex);

    const calls = __info.mock.calls.map((c) => c[1]);
    expect(calls).toContainEqual(expect.objectContaining({ division: 'DPHI', winner: 80, column_changed: true }));
    expect(calls).toContainEqual(expect.objectContaining({ divisions: 1, columns_set: 1 }));
  });
});

describe('divisionHolderRepair migration — down()', () => {
  it('is a documented no-op that changes no rows', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DPHI', level_type: OLT.DIVISION, responsible_user_id: 2 }],
      userDivisions: [{ user_id: 2, division_code: 'DPHI', role: R.HEAD_OF_DIVISION }],
    });
    const before = snapshot(tables);

    await expect(migration.down(knex)).resolves.toBeUndefined();

    expect(snapshot(tables)).toBe(before);
  });
});
