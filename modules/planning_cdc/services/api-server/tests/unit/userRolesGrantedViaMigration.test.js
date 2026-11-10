// ── 20261009130000_user_roles_granted_via ──
//
// Division-derived global roles are classified from user_divisions: backed
// rows get granted_via = 'division', orphan FOCAL/HOD/DIRECTOR rows are
// revoked, orphan ME_OFFICER rows stay (manual central M&E role), missing
// rows are granted. Runs against the in-memory knex stand-in.

jest.mock('@rbm/lib/logger', () => ({
  createLogger: () => ({ child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }),
}));

const { makeFakeKnex } = require('../helpers/fakeKnex');
const migration = require('../../src/db/migrations/20261009130000_user_roles_granted_via');
const R = require('@rbm/lib/user-divisions').DIVISION_ASSIGNMENT_ROLES;
const { GRANTED_VIA_DIVISION } = require('../../src/services/divisionAssignmentService');

const ROLES = [
  { id: 1, code: R.FOCAL_PERSON },
  { id: 2, code: R.HEAD_OF_DIVISION },
  { id: 3, code: R.DIRECTOR },
  { id: 4, code: R.ME_OFFICER },
  { id: 9, code: 'SYSTEM_ADMIN' },
  { id: 10, code: 'STAFF' },
];

function setup({ userDivisions = [], userRoles = [] }) {
  const tables = {
    roles: ROLES.map((r) => ({ ...r })),
    user_divisions: userDivisions.map((u, i) => ({ id: i + 1, ...u })),
    user_roles: userRoles.map((u, i) => ({ id: i + 1, granted_via: null, ...u })),
  };
  return { knex: makeFakeKnex(tables), tables };
}

const rolesOf = (tables, userId) => tables.user_roles
  .filter((ur) => ur.user_id === userId)
  .map((ur) => `${ROLES.find((r) => r.id === ur.role_id).code}${ur.granted_via ? '@' + ur.granted_via : ''}`)
  .sort();

describe('20261009130000_user_roles_granted_via', () => {
  it('revokes orphan HEAD_OF_DIVISION / FOCAL_PERSON and keeps the backed DIRECTOR (Maria case)', async () => {
    const { knex, tables } = setup({
      userDivisions: [{ user_id: 246, division_code: 'PHAHM', role: R.DIRECTOR }],
      userRoles: [
        { user_id: 246, role_id: 2 }, // HEAD_OF_DIVISION from her DG days
        { user_id: 246, role_id: 1 }, // FOCAL_PERSON
        { user_id: 246, role_id: 3 }, // DIRECTOR
      ],
    });
    await migration.up(knex);
    expect(rolesOf(tables, 246)).toEqual(['DIRECTOR@division', 'STAFF@division']);
  });

  it('keeps an ME_OFFICER row with no division behind it, unmarked (central M&E team)', async () => {
    const { knex, tables } = setup({ userRoles: [{ user_id: 7, role_id: 4 }] });
    await migration.up(knex);
    expect(rolesOf(tables, 7)).toEqual(['ME_OFFICER']);
  });

  it('marks a backed ME_OFFICER row as division-granted', async () => {
    const { knex, tables } = setup({
      userDivisions: [{ user_id: 7, division_code: 'DPHI', role: R.ME_OFFICER }],
      userRoles: [{ user_id: 7, role_id: 4 }],
    });
    await migration.up(knex);
    expect(rolesOf(tables, 7)).toEqual(['ME_OFFICER@division', 'STAFF@division']);
  });

  it('grants the missing global role for a division row without one', async () => {
    const { knex, tables } = setup({
      userDivisions: [{ user_id: 5, division_code: 'DPHI', role: R.HEAD_OF_DIVISION }],
    });
    await migration.up(knex);
    expect(rolesOf(tables, 5)).toEqual(['HEAD_OF_DIVISION@division', 'STAFF@division']);
  });

  it('grants STAFF to a plain MEMBER and keeps an existing STAFF row as is', async () => {
    const { knex, tables } = setup({
      userDivisions: [
        { user_id: 11, division_code: 'DPHI', role: R.MEMBER },
        { user_id: 12, division_code: 'DPHI', role: R.MEMBER },
      ],
      userRoles: [{ user_id: 12, role_id: 10 }],
    });
    await migration.up(knex);
    expect(rolesOf(tables, 11)).toEqual(['STAFF@division']);
    expect(rolesOf(tables, 12)).toEqual(['STAFF']);
  });

  it('never touches roles outside the derived set', async () => {
    const { knex, tables } = setup({ userRoles: [{ user_id: 1, role_id: 9 }] });
    await migration.up(knex);
    expect(rolesOf(tables, 1)).toEqual(['SYSTEM_ADMIN']);
  });

  it('is idempotent', async () => {
    const { knex, tables } = setup({
      userDivisions: [
        { user_id: 246, division_code: 'PHAHM', role: R.DIRECTOR },
        { user_id: 5, division_code: 'DPHI', role: R.HEAD_OF_DIVISION },
      ],
      userRoles: [{ user_id: 246, role_id: 2 }, { user_id: 246, role_id: 3 }, { user_id: 7, role_id: 4 }],
    });
    await migration.up(knex);
    const after = JSON.stringify(tables.user_roles);
    await migration.up(knex);
    expect(JSON.stringify(tables.user_roles)).toBe(after);
  });

  it('down leaves rows untouched', async () => {
    const { knex, tables } = setup({ userRoles: [{ user_id: 1, role_id: 2, granted_via: GRANTED_VIA_DIVISION }] });
    await migration.down(knex);
    expect(tables.user_roles).toHaveLength(1);
  });
});
