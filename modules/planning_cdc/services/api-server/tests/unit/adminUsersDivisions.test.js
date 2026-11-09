// ── getUsers division memberships (staff list) ──
//
// Regression: the staff list only read the legacy users.division_code, so a
// user who was RESPONSIBLE (HEAD_OF_DIVISION / DIRECTOR in user_divisions) of
// a division never saw it. getUsers now reads user_divisions only: the legacy
// column follows it (divisionAssignmentService) and must never add a ghost
// membership (D-20261009-03). The DB is mocked via config/db (shared chain stub).

const adminService = require('../../src/services/admin/users');
const db = require('../../src/config/db');

function resetChain() {
  const c = db.__chain;
  c.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
}

/**
 * Queue the three sequential reads getUsers performs: users, roles, memberships.
 * @param {Array<object>} users
 * @param {Array<object>} membershipRows
 */
function queueReads(users, membershipRows) {
  db.__chain.then
    .mockImplementationOnce((r) => Promise.resolve(users).then(r))
    .mockImplementationOnce((r) => Promise.resolve([]).then(r))
    .mockImplementationOnce((r) => Promise.resolve(membershipRows).then(r));
}

beforeEach(() => {
  resetChain();
});

describe('adminService.getUsers — division memberships', () => {
  it('should show a division the user is only RESPONSIBLE of, with its role label', async () => {
    queueReads(
      [{ id: 1, full_name: 'Head One', division_code: null, division_name: null }],
      [{ user_id: 1, division_code: 'DPHI', division_name: 'Public Health', role: 'HEAD_OF_DIVISION', is_primary: 0 }],
    );

    const [user] = await adminService.getUsers();

    expect(user.divisions).toEqual([
      {
        code: 'DPHI',
        division_name: 'Public Health',
        is_primary: false,
        roles: [{ code: 'HEAD_OF_DIVISION', label: 'Responsible person' }],
      },
    ]);
  });

  it('should show a focal division once with its primary flag, without a ghost MEMBER role', async () => {
    queueReads(
      [{ id: 2, full_name: 'Focal Two', division_code: 'WARCC', division_name: 'WARCC' }],
      [{ user_id: 2, division_code: 'WARCC', division_name: 'WARCC', role: 'FOCAL_PERSON', is_primary: 1 }],
    );

    const [user] = await adminService.getUsers();

    expect(user.divisions).toHaveLength(1);
    expect(user.divisions[0]).toMatchObject({ code: 'WARCC', is_primary: true });
    expect(user.divisions[0].roles).toEqual([{ code: 'FOCAL_PERSON', label: 'Focal Person' }]);
  });

  it('should ignore a stale legacy users.division_code when no user_divisions row exists', async () => {
    queueReads(
      [{ id: 3, full_name: 'Staff Three', division_code: 'DG', division_name: 'Director General' }],
      [],
    );

    const [user] = await adminService.getUsers();

    expect(user.divisions).toEqual([]);
  });

  it('should return an empty divisions array for a user with no division at all', async () => {
    queueReads(
      [{ id: 4, full_name: 'Unassigned', division_code: null, division_name: null }],
      [],
    );

    const [user] = await adminService.getUsers();

    expect(user.divisions).toEqual([]);
  });

  it('should order the primary division first, then by code, and keep roles in enum order', async () => {
    queueReads(
      [{ id: 5, full_name: 'Multi', division_code: 'ZZZ', division_name: 'Zed' }],
      [
        { user_id: 5, division_code: 'AAA', division_name: 'Alpha', role: 'ME_OFFICER', is_primary: 1 },
        { user_id: 5, division_code: 'AAA', division_name: 'Alpha', role: 'FOCAL_PERSON', is_primary: 0 },
        { user_id: 5, division_code: 'ZZZ', division_name: 'Zed', role: 'DIRECTOR', is_primary: 0 },
      ],
    );

    const [user] = await adminService.getUsers();

    expect(user.divisions.map((d) => d.code)).toEqual(['AAA', 'ZZZ']);
    expect(user.divisions[0].roles.map((r) => r.code)).toEqual(['FOCAL_PERSON', 'ME_OFFICER']);
    expect(user.divisions[1].roles.map((r) => r.code)).toEqual(['DIRECTOR']);
  });

  it('should not query memberships when no users match', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));

    const users = await adminService.getUsers();

    expect(users).toEqual([]);
    expect(db.__chain.then).toHaveBeenCalledTimes(1);
  });
});
