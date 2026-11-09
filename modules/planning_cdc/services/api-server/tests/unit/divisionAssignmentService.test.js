// ── divisionAssignmentService tests ──
//
// The service is the single write path for division holders. Both entry points
// (division page and user edit window) must keep division_codes and
// user_divisions in step. Tests run against an in-memory knex stand-in, so each
// assertion is on the resulting rows, not on call order.

jest.mock('../../src/services/divisionAliasService', () => ({
  resolveAliases: jest.fn(async (code) => [code]),
}));
jest.mock('../../src/services/rbacService', () => ({ invalidateUserPermissions: jest.fn() }));

const { resolveAliases } = require('../../src/services/divisionAliasService');
const { makeFakeKnex } = require('../helpers/fakeKnex');
const svc = require('../../src/services/divisionAssignmentService');
const R = require('@rbm/lib/user-divisions').DIVISION_ASSIGNMENT_ROLES;
const OLT = require('@rbm/lib/enums').ORG_LEVEL_TYPES;
const { ROLES: GLOBAL } = require('@rbm/lib/roles');
const { invalidateUserPermissions } = require('../../src/services/rbacService');

const ROLES = [
  { id: 1, code: R.FOCAL_PERSON },
  { id: 2, code: R.HEAD_OF_DIVISION },
  { id: 3, code: R.DIRECTOR },
  { id: 4, code: R.ME_OFFICER },
  { id: 5, code: R.MEMBER },
  { id: 6, code: GLOBAL.STAFF },
];

/**
 * Build a fresh in-memory database for one test.
 * @param {{divisions?: object[], userDivisions?: object[], userRoles?: object[]}} seed
 * @returns {{knex: Function, tables: object}}
 */
function setup({ divisions = [], userDivisions = [], userRoles = [], users = [] } = {}) {
  const tables = {
    roles: ROLES.map((r) => ({ ...r })),
    division_codes: divisions.map((d) => ({
      responsible_user_id: null, m_and_e_user_id: null, alias_of: null, ...d,
    })),
    user_divisions: userDivisions.map((u, i) => ({ id: i + 1, is_primary: false, assigned_at: null, ...u })),
    user_roles: userRoles.map((r, i) => ({ id: i + 1, granted_via: null, ...r })),
    users: users.map((u) => ({ ...u })),
  };
  return { knex: makeFakeKnex(tables), tables };
}

const rowsFor = (tables, userId, code) =>
  tables.user_divisions.filter((r) => r.user_id === userId && r.division_code === code).map((r) => r.role).sort();
const division = (tables, code) => tables.division_codes.find((d) => d.code === code);
const hasGlobalRole = (tables, userId, roleCode) => {
  const role = tables.roles.find((r) => r.code === roleCode);
  return tables.user_roles.some((ur) => ur.user_id === userId && ur.role_id === role.id);
};
const globalRolesOf = (tables, userId) => tables.user_roles
  .filter((ur) => ur.user_id === userId)
  .map((ur) => tables.roles.find((r) => r.id === ur.role_id).code)
  .sort();

beforeEach(() => {
  resolveAliases.mockImplementation(async (code) => [code]);
  invalidateUserPermissions.mockClear();
});

describe('divisionAssignmentService — responsible holder', () => {
  const seed = () => setup({
    divisions: [{ code: 'DPHI', level_type: OLT.DIVISION, responsible_user_id: 2 }],
    userDivisions: [{ user_id: 2, division_code: 'DPHI', role: R.HEAD_OF_DIVISION }],
  });

  it('division page: setting responsible writes the column, adds the new holder row and demotes the previous one', async () => {
    const { knex, tables } = seed();

    await svc.applyHolderChange(knex, { code: 'DPHI', field: 'responsible_user_id', userId: 5 });

    expect(division(tables, 'DPHI').responsible_user_id).toBe(5);
    expect(rowsFor(tables, 5, 'DPHI')).toEqual([R.HEAD_OF_DIVISION]);
    expect(rowsFor(tables, 2, 'DPHI')).toEqual([R.MEMBER]);
    expect(hasGlobalRole(tables, 5, R.HEAD_OF_DIVISION)).toBe(true);
  });

  it('user window: adding HEAD_OF_DIVISION writes the same two tables and demotes the previous holder', async () => {
    const { knex, tables } = seed();

    await svc.addDivisionRole(knex, { userId: 5, code: 'DPHI', role: R.HEAD_OF_DIVISION });

    expect(division(tables, 'DPHI').responsible_user_id).toBe(5);
    expect(rowsFor(tables, 5, 'DPHI')).toEqual([R.HEAD_OF_DIVISION]);
    expect(rowsFor(tables, 2, 'DPHI')).toEqual([R.MEMBER]);
  });

  it('demotes by deleting when the previous holder already has another row there', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DPHI', level_type: OLT.DIVISION, responsible_user_id: 2 }],
      userDivisions: [
        { user_id: 2, division_code: 'DPHI', role: R.HEAD_OF_DIVISION },
        { user_id: 2, division_code: 'DPHI', role: R.MEMBER },
      ],
    });

    await svc.applyHolderChange(knex, { code: 'DPHI', field: 'responsible_user_id', userId: 5 });

    expect(rowsFor(tables, 2, 'DPHI')).toEqual([R.MEMBER]);
  });

  it('division page: unsetting responsible clears the column and demotes the holder', async () => {
    const { knex, tables } = seed();

    await svc.applyHolderChange(knex, { code: 'DPHI', field: 'responsible_user_id', userId: null });

    expect(division(tables, 'DPHI').responsible_user_id).toBeNull();
    expect(rowsFor(tables, 2, 'DPHI')).toEqual([R.MEMBER]);
  });

  it('user window: removing the HEAD row clears the column and removes the row', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DPHI', level_type: OLT.DIVISION, responsible_user_id: 2 }],
      userDivisions: [{ user_id: 2, division_code: 'DPHI', role: R.HEAD_OF_DIVISION }],
    });

    await svc.removeDivisionRole(knex, { userId: 2, code: 'DPHI', role: R.HEAD_OF_DIVISION });

    expect(division(tables, 'DPHI').responsible_user_id).toBeNull();
    expect(rowsFor(tables, 2, 'DPHI')).toEqual([]);
  });

  it('user window: removing a row that is not the holder leaves the column alone', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DPHI', level_type: OLT.DIVISION, responsible_user_id: 2 }],
      userDivisions: [
        { user_id: 2, division_code: 'DPHI', role: R.HEAD_OF_DIVISION },
        { user_id: 9, division_code: 'DPHI', role: R.MEMBER },
      ],
    });

    await svc.removeDivisionRole(knex, { userId: 9, code: 'DPHI', role: R.MEMBER });

    expect(division(tables, 'DPHI').responsible_user_id).toBe(2);
  });

  it('mirrors the column onto alias siblings of the division', async () => {
    resolveAliases.mockResolvedValue(['DPHI', 'DPHI_OLD']);
    const { knex, tables } = setup({
      divisions: [
        { code: 'DPHI', level_type: OLT.DIVISION },
        { code: 'DPHI_OLD', level_type: OLT.DIVISION, alias_of: 'DPHI' },
      ],
    });

    await svc.applyHolderChange(knex, { code: 'DPHI', field: 'responsible_user_id', userId: 5 });

    expect(division(tables, 'DPHI').responsible_user_id).toBe(5);
    expect(division(tables, 'DPHI_OLD').responsible_user_id).toBe(5);
  });

  it('revokes the demoted holder division-granted global role and grants the new holder', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DPHI', level_type: OLT.DIVISION, responsible_user_id: 2 }],
      userDivisions: [{ user_id: 2, division_code: 'DPHI', role: R.HEAD_OF_DIVISION }],
      userRoles: [{ user_id: 2, role_id: 2, granted_via: svc.GRANTED_VIA_DIVISION }],
    });

    await svc.applyHolderChange(knex, { code: 'DPHI', field: 'responsible_user_id', userId: 5 });

    expect(globalRolesOf(tables, 2)).toEqual([GLOBAL.STAFF]); // still MEMBER there, so STAFF stays
    expect(globalRolesOf(tables, 5)).toEqual([R.HEAD_OF_DIVISION, GLOBAL.STAFF]);
    expect(tables.user_roles.filter((ur) => ur.user_id === 5).every((ur) => ur.granted_via === svc.GRANTED_VIA_DIVISION)).toBe(true);
    expect(invalidateUserPermissions).toHaveBeenCalledWith(2);
    expect(invalidateUserPermissions).toHaveBeenCalledWith(5);
  });

  it('keeps a global role the admin granted manually (granted_via null) on demotion', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DPHI', level_type: OLT.DIVISION, responsible_user_id: 2 }],
      userDivisions: [{ user_id: 2, division_code: 'DPHI', role: R.HEAD_OF_DIVISION }],
      userRoles: [{ user_id: 2, role_id: 2 }],
    });

    await svc.applyHolderChange(knex, { code: 'DPHI', field: 'responsible_user_id', userId: 5 });

    expect(hasGlobalRole(tables, 2, R.HEAD_OF_DIVISION)).toBe(true);
  });

  it('keeps a division-granted role while the user still holds it on another division', async () => {
    const { knex, tables } = setup({
      divisions: [
        { code: 'DPHI', level_type: OLT.DIVISION, responsible_user_id: 2 },
        { code: 'DCM', level_type: OLT.DIVISION, responsible_user_id: 2 },
      ],
      userDivisions: [
        { user_id: 2, division_code: 'DPHI', role: R.HEAD_OF_DIVISION },
        { user_id: 2, division_code: 'DCM', role: R.HEAD_OF_DIVISION },
      ],
      userRoles: [{ user_id: 2, role_id: 2, granted_via: svc.GRANTED_VIA_DIVISION }],
    });

    await svc.applyHolderChange(knex, { code: 'DPHI', field: 'responsible_user_id', userId: 5 });

    expect(hasGlobalRole(tables, 2, R.HEAD_OF_DIVISION)).toBe(true);
  });

  it('throws NotFoundError when the division does not exist', async () => {
    const { knex } = setup();
    await expect(
      svc.applyHolderChange(knex, { code: 'NOPE', field: 'responsible_user_id', userId: 5 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('divisionAssignmentService — directorate', () => {
  it('division page: a directorate responsible is DIRECTOR, not HEAD_OF_DIVISION', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DIR1', level_type: OLT.DIRECTORATE }],
    });

    await svc.applyHolderChange(knex, { code: 'DIR1', field: 'responsible_user_id', userId: 7 });

    expect(rowsFor(tables, 7, 'DIR1')).toEqual([R.DIRECTOR]);
    expect(hasGlobalRole(tables, 7, R.DIRECTOR)).toBe(true);
  });

  // "Responsible person" is one concept: the stored role follows level_type.
  it('user window: Responsible person on a directorate is stored as DIRECTOR, whichever role was sent', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DIR1', level_type: OLT.DIRECTORATE }],
    });

    await svc.addDivisionRole(knex, { userId: 7, code: 'DIR1', role: R.HEAD_OF_DIVISION, isPrimary: true });

    expect(rowsFor(tables, 7, 'DIR1')).toEqual([R.DIRECTOR]);
    expect(division(tables, 'DIR1').responsible_user_id).toBe(7);
    expect(tables.user_divisions.find((r) => r.user_id === 7).is_primary).toBe(true);
  });

  it('user window: DIRECTOR sent for a division is stored as HEAD_OF_DIVISION', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DPHI', level_type: OLT.DIVISION }],
    });

    await svc.addDivisionRole(knex, { userId: 7, code: 'DPHI', role: R.DIRECTOR });

    expect(rowsFor(tables, 7, 'DPHI')).toEqual([R.HEAD_OF_DIVISION]);
  });
});

describe('divisionAssignmentService — M&E officer', () => {
  it('sets the M&E column, adds ME_OFFICER and demotes the previous officer on either path', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DPHI', level_type: OLT.DIVISION, m_and_e_user_id: 3 }],
      userDivisions: [{ user_id: 3, division_code: 'DPHI', role: R.ME_OFFICER }],
    });

    await svc.addDivisionRole(knex, { userId: 8, code: 'DPHI', role: R.ME_OFFICER });

    expect(division(tables, 'DPHI').m_and_e_user_id).toBe(8);
    expect(rowsFor(tables, 8, 'DPHI')).toEqual([R.ME_OFFICER]);
    expect(rowsFor(tables, 3, 'DPHI')).toEqual([R.MEMBER]);
  });

  it('unsetting from the division page clears the column and demotes the officer', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DPHI', level_type: OLT.DIVISION, m_and_e_user_id: 3 }],
      userDivisions: [{ user_id: 3, division_code: 'DPHI', role: R.ME_OFFICER }],
    });

    await svc.applyHolderChange(knex, { code: 'DPHI', field: 'm_and_e_user_id', userId: null });

    expect(division(tables, 'DPHI').m_and_e_user_id).toBeNull();
    expect(rowsFor(tables, 3, 'DPHI')).toEqual([R.MEMBER]);
  });
});

describe('divisionAssignmentService — focal team (D-20261106-09)', () => {
  it('user window: each focal person adds a FOCAL_PERSON row; no division column is written', async () => {
    const { knex, tables } = setup({ divisions: [{ code: 'DPHI', level_type: OLT.DIVISION }] });

    await svc.addDivisionRole(knex, { userId: 3, code: 'DPHI', role: R.FOCAL_PERSON });
    await svc.addDivisionRole(knex, { userId: 4, code: 'DPHI', role: R.FOCAL_PERSON });

    expect(rowsFor(tables, 3, 'DPHI')).toEqual([R.FOCAL_PERSON]);
    expect(rowsFor(tables, 4, 'DPHI')).toEqual([R.FOCAL_PERSON]);
    expect(division(tables, 'DPHI')).not.toHaveProperty('focal_user_id');
    expect(hasGlobalRole(tables, 4, R.FOCAL_PERSON)).toBe(true);
  });

  it('division page: focal_user_id is no longer a holder field', async () => {
    const { knex } = setup({ divisions: [{ code: 'DPHI', level_type: OLT.DIVISION }] });

    await expect(svc.applyHolderChange(knex, { code: 'DPHI', field: 'focal_user_id', userId: 6 }))
      .rejects.toThrow('focal_user_id is not a holder field');
  });

  it('user window: removing a focal person removes only their row', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DPHI', level_type: OLT.DIVISION }],
      userDivisions: [
        { user_id: 6, division_code: 'DPHI', role: R.FOCAL_PERSON },
        { user_id: 4, division_code: 'DPHI', role: R.FOCAL_PERSON },
      ],
    });

    await svc.removeDivisionRole(knex, { userId: 6, code: 'DPHI', role: R.FOCAL_PERSON });

    expect(rowsFor(tables, 6, 'DPHI')).toEqual([]);
    expect(rowsFor(tables, 4, 'DPHI')).toEqual([R.FOCAL_PERSON]);
  });

  it('throws NotFoundError when a focal person is added to an unknown division', async () => {
    const { knex } = setup();

    await expect(svc.addDivisionRole(knex, { userId: 3, code: 'NOPE', role: R.FOCAL_PERSON }))
      .rejects.toThrow('Division not found');
  });

  it('a focal row removes the redundant MEMBER row on the same division', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DPHI', level_type: OLT.DIVISION }],
      userDivisions: [{ user_id: 3, division_code: 'DPHI', role: R.MEMBER }],
    });

    await svc.addDivisionRole(knex, { userId: 3, code: 'DPHI', role: R.FOCAL_PERSON });

    expect(rowsFor(tables, 3, 'DPHI')).toEqual([R.FOCAL_PERSON]);
  });
});

describe('divisionAssignmentService — removal and role change', () => {
  it('user window: a role change from HEAD_OF_DIVISION to FOCAL_PERSON clears the responsible pointer', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DPHI', level_type: OLT.DIVISION, responsible_user_id: 2 }],
      userDivisions: [{ user_id: 2, division_code: 'DPHI', role: R.HEAD_OF_DIVISION }],
    });

    await svc.removeDivisionRole(knex, { userId: 2, code: 'DPHI', role: R.HEAD_OF_DIVISION });
    await svc.addDivisionRole(knex, { userId: 2, code: 'DPHI', role: R.FOCAL_PERSON });

    expect(division(tables, 'DPHI').responsible_user_id).toBeNull();
    expect(rowsFor(tables, 2, 'DPHI')).toEqual([R.FOCAL_PERSON]);
  });
});

describe('legacy users.division_code', () => {
  const user = (tables, id) => tables.users.find((u) => u.id === id);

  it('moves to the primary remaining division when the last row on it is removed', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DG', level_type: OLT.DIRECTORATE }, { code: 'PHAHM', level_type: OLT.DIRECTORATE }],
      users: [{ id: 246, division_code: 'DG' }],
      userDivisions: [
        { user_id: 246, division_code: 'DG', role: R.MEMBER },
        { user_id: 246, division_code: 'PHAHM', role: R.FOCAL_PERSON },
        { user_id: 246, division_code: 'PHAHM', role: R.DIRECTOR, is_primary: true },
      ],
    });

    await svc.removeDivisionRole(knex, { userId: 246, code: 'DG', role: R.MEMBER });

    expect(user(tables, 246).division_code).toBe('PHAHM');
  });

  it('is cleared when the user has no division left', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DG', level_type: OLT.DIRECTORATE }],
      users: [{ id: 7, division_code: 'DG' }],
      userDivisions: [{ user_id: 7, division_code: 'DG', role: R.MEMBER }],
    });

    await svc.removeDivisionRole(knex, { userId: 7, code: 'DG', role: R.MEMBER });

    expect(user(tables, 7).division_code).toBeNull();
  });

  it('stays while the user still has another row on that division', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DG', level_type: OLT.DIRECTORATE }],
      users: [{ id: 7, division_code: 'DG' }],
      userDivisions: [
        { user_id: 7, division_code: 'DG', role: R.FOCAL_PERSON },
        { user_id: 7, division_code: 'DG', role: R.MEMBER },
      ],
    });

    await svc.removeDivisionRole(knex, { userId: 7, code: 'DG', role: R.FOCAL_PERSON });

    expect(user(tables, 7).division_code).toBe('DG');
  });

  it('is untouched when it points at another division', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DG', level_type: OLT.DIRECTORATE }],
      users: [{ id: 7, division_code: 'EPR' }],
      userDivisions: [{ user_id: 7, division_code: 'DG', role: R.MEMBER }],
    });

    await svc.removeDivisionRole(knex, { userId: 7, code: 'DG', role: R.MEMBER });

    expect(user(tables, 7).division_code).toBe('EPR');
  });
});

describe('divisionAssignmentService — global roles follow user_divisions', () => {
  it('a MEMBER row grants STAFF; a HEAD row grants HEAD_OF_DIVISION on top', async () => {
    const { knex, tables } = setup({ divisions: [{ code: 'DPHI', level_type: OLT.DIVISION }] });

    await svc.addDivisionRole(knex, { userId: 9, code: 'DPHI', role: R.MEMBER });
    expect(globalRolesOf(tables, 9)).toEqual([GLOBAL.STAFF]);

    await svc.addDivisionRole(knex, { userId: 9, code: 'DPHI', role: R.HEAD_OF_DIVISION });
    expect(globalRolesOf(tables, 9)).toEqual([R.HEAD_OF_DIVISION, GLOBAL.STAFF]);
  });

  it('removing the last division row revokes division-granted roles but never STAFF', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DPHI', level_type: OLT.DIVISION, focal_user_id: 9 }],
      userDivisions: [{ user_id: 9, division_code: 'DPHI', role: R.FOCAL_PERSON }],
      userRoles: [{ user_id: 9, role_id: 1, granted_via: svc.GRANTED_VIA_DIVISION }, { user_id: 9, role_id: 6, granted_via: svc.GRANTED_VIA_DIVISION }],
    });

    await svc.removeDivisionRole(knex, { userId: 9, code: 'DPHI', role: R.FOCAL_PERSON });

    expect(globalRolesOf(tables, 9)).toEqual([GLOBAL.STAFF]);
  });

  it('moving from Head of one division to Director of a directorate swaps the global roles', async () => {
    const { knex, tables } = setup({
      divisions: [
        { code: 'DG', level_type: OLT.DIVISION, responsible_user_id: 246 },
        { code: 'PHAHM', level_type: OLT.DIRECTORATE },
      ],
      userDivisions: [{ user_id: 246, division_code: 'DG', role: R.HEAD_OF_DIVISION }],
      userRoles: [{ user_id: 246, role_id: 2, granted_via: svc.GRANTED_VIA_DIVISION }],
    });

    await svc.addDivisionRole(knex, { userId: 246, code: 'PHAHM', role: R.DIRECTOR });
    await svc.removeDivisionRole(knex, { userId: 246, code: 'DG', role: R.HEAD_OF_DIVISION });

    expect(globalRolesOf(tables, 246)).toEqual([R.DIRECTOR, GLOBAL.STAFF]);
  });

  it('does not add a MEMBER row on top of an existing role row (team slot on a focal)', async () => {
    const { knex, tables } = setup({
      divisions: [{ code: 'DPHI', level_type: OLT.DIVISION, focal_user_id: 9 }],
      userDivisions: [{ user_id: 9, division_code: 'DPHI', role: R.FOCAL_PERSON }],
    });

    await svc.addDivisionRole(knex, { userId: 9, code: 'DPHI', role: R.MEMBER });

    expect(rowsFor(tables, 9, 'DPHI')).toEqual([R.FOCAL_PERSON]);
  });

  it('skips silently when the roles table lacks a derived role', async () => {
    const { knex, tables } = setup({ divisions: [{ code: 'DPHI', level_type: OLT.DIVISION }] });
    tables.roles = tables.roles.filter((r) => r.code !== R.HEAD_OF_DIVISION);

    await svc.addDivisionRole(knex, { userId: 9, code: 'DPHI', role: R.HEAD_OF_DIVISION });

    expect(rowsFor(tables, 9, 'DPHI')).toEqual([R.HEAD_OF_DIVISION]);
    expect(globalRolesOf(tables, 9)).toEqual([GLOBAL.STAFF]);
  });
});
