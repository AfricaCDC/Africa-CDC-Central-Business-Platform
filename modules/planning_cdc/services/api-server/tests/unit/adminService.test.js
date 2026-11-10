// ── adminService unit tests ──
//
// All DB calls flow through `config/db.js`, which imports the auto-mocked
// `knex` module. We interact with the chain via `db.__chain` (the same
// chainable stub exposed by `global.__makeKnexMock`).

const adminService = require('../../src/services/adminService');
const db = require('../../src/config/db');
const { ORG_LEVEL_TYPES } = require('@rbm/lib/enums');

// Reset chain-level mock state so each test starts clean.
function resetChain() {
  const c = db.__chain;
  c.first.mockReset().mockResolvedValue(undefined);
  c.insert.mockReset().mockResolvedValue([1]);
  c.update.mockReset().mockResolvedValue(1);
  c.del.mockReset().mockResolvedValue(1);
  c.delete.mockReset().mockResolvedValue(1);
  c.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
}

beforeEach(() => {
  resetChain();
});

describe('adminService.getUsers', () => {
  it('should return an empty list and skip the role join when no users match', async () => {
    // then() resolves the list query to [] by default
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    const users = await adminService.getUsers();
    expect(Array.isArray(users)).toBe(true);
    expect(users).toHaveLength(0);
  });

  it('should attach roles array to each user and coerce to empty when none found', async () => {
    // First `then` resolves the users list, second `then` resolves the roles join
    db.__chain.then
      .mockImplementationOnce((r) =>
        Promise.resolve([{ id: 1, email: 'a@x.com', full_name: 'A' }]).then(r)
      )
      .mockImplementationOnce((r) => Promise.resolve([]).then(r));

    const users = await adminService.getUsers();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ id: 1, email: 'a@x.com', roles: [] });
  });

  it('should group the user_roles join rows onto the correct user', async () => {
    db.__chain.then
      .mockImplementationOnce((r) =>
        Promise.resolve([
          { id: 1, email: 'a@x.com' },
          { id: 2, email: 'b@x.com' },
        ]).then(r)
      )
      .mockImplementationOnce((r) =>
        Promise.resolve([
          { user_id: 1, role_id: 10, code: 'FOCAL_PERSON', name: 'Focal' },
          { user_id: 2, role_id: 11, code: 'HEAD_OF_DIVISION', name: 'HOD' },
          { user_id: 1, role_id: 12, code: 'PLANNER', name: 'Planner' },
        ]).then(r)
      );

    const users = await adminService.getUsers();
    expect(users[0].roles).toEqual([
      { id: 10, code: 'FOCAL_PERSON', name: 'Focal' },
      { id: 12, code: 'PLANNER', name: 'Planner' },
    ]);
    expect(users[1].roles).toEqual([
      { id: 11, code: 'HEAD_OF_DIVISION', name: 'HOD' },
    ]);
  });
});

describe('adminService.getUserById', () => {
  it('should resolve with the matching row', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 7, email: 'a@x.com' });
    const row = await adminService.getUserById(7);
    expect(row).toEqual({ id: 7, email: 'a@x.com' });
  });

  it('should return undefined when the row is not found', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    const row = await adminService.getUserById(999);
    expect(row).toBeUndefined();
  });
});

describe('adminService.createUser', () => {
  it('should drop any password sent by a client and return the fresh row', async () => {
    // insert → [42], then getUserById → first() → user row
    db.__chain.insert.mockResolvedValueOnce([42]);
    db.__chain.first.mockResolvedValueOnce({ id: 42, email: 'new@x.com' });

    const result = await adminService.createUser({
      email: 'new@x.com',
      password: 'secret123',
      first_name: 'Jane',
      last_name: 'Doe',
    });

    // Returned row proxied from getUserById
    expect(result).toEqual({ id: 42, email: 'new@x.com' });

    // No password of any kind reaches the database (D-20261107-03)
    const insertArg = db.__chain.insert.mock.calls[0][0];
    expect(insertArg).not.toHaveProperty('password');
    expect(insertArg).not.toHaveProperty('password_hash');
  });

  it('should recompute full_name when structured name fields are provided', async () => {
    db.__chain.insert.mockResolvedValueOnce([1]);
    db.__chain.first.mockResolvedValueOnce({ id: 1 });

    await adminService.createUser({
      email: 'jane@x.com',
      title: 'Dr',
      first_name: 'Jane',
      last_name: 'Doe',
    });

    const insertArg = db.__chain.insert.mock.calls[0][0];
    expect(insertArg.full_name).toBe('Dr Jane Doe');
  });

  it('should strip readonly fields like id and created_at before insert', async () => {
    db.__chain.insert.mockResolvedValueOnce([1]);
    db.__chain.first.mockResolvedValueOnce({ id: 1 });

    await adminService.createUser({
      id: 999,
      email: 'x@x.com',
      password_hash: 'should-not-pass-through',
      created_at: 'should-drop',
      updated_at: 'should-drop',
      last_login_at: 'should-drop',
    });

    const insertArg = db.__chain.insert.mock.calls[0][0];
    expect(insertArg).not.toHaveProperty('id');
    expect(insertArg).not.toHaveProperty('created_at');
    expect(insertArg).not.toHaveProperty('updated_at');
    expect(insertArg).not.toHaveProperty('last_login_at');
    expect(insertArg).not.toHaveProperty('password_hash');
  });

  it('should propagate DB errors from the insert call', async () => {
    const dbErr = new Error('ER_DUP_ENTRY: email');
    dbErr.code = 'ER_DUP_ENTRY';
    db.__chain.insert.mockRejectedValueOnce(dbErr);

    await expect(
      adminService.createUser({ email: 'dup@x.com' })
    ).rejects.toThrow('ER_DUP_ENTRY');
  });
});

describe('adminService.updateUser', () => {
  it('should update and return the fresh row', async () => {
    db.__chain.update.mockResolvedValueOnce(1);
    db.__chain.first.mockResolvedValueOnce({ id: 7, email: 'x@x.com', title: 'Dr' });

    const row = await adminService.updateUser(7, { title: 'Dr' });
    expect(row).toEqual({ id: 7, email: 'x@x.com', title: 'Dr' });
  });

  it('should drop a password sent on update', async () => {
    db.__chain.update.mockResolvedValueOnce(1);
    db.__chain.first.mockResolvedValueOnce({ id: 7 });

    await adminService.updateUser(7, { password: 'newpass123', title: 'Dr' });

    const updateArg = db.__chain.update.mock.calls[0][0];
    expect(updateArg).not.toHaveProperty('password_hash');
    expect(updateArg).not.toHaveProperty('password');
    expect(updateArg).toHaveProperty('title', 'Dr');
  });

  it('should strip readonly fields like id on update', async () => {
    db.__chain.update.mockResolvedValueOnce(1);
    db.__chain.first.mockResolvedValueOnce({ id: 7 });

    await adminService.updateUser(7, { id: 999, email: 'a@b.com' });

    const updateArg = db.__chain.update.mock.calls[0][0];
    expect(updateArg).not.toHaveProperty('id');
    expect(updateArg).toHaveProperty('email', 'a@b.com');
  });
});

// ─────────────────────────────────────────────────────────────────
//   adminService.assignRole / removeRole / updateRolePermissions
// ─────────────────────────────────────────────────────────────────
describe('adminService.assignRole', () => {
  it('should be a no-op when the user already has the role', async () => {
    db.__chain.first.mockResolvedValueOnce({ user_id: 7, role_id: 3 });
    const result = await adminService.assignRole(7, 3);
    expect(result).toBeUndefined();
    expect(db.__chain.insert).not.toHaveBeenCalled();
  });

  it('should insert the (user_id, role_id) pair when not yet granted', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    db.__chain.insert.mockResolvedValueOnce([42]);

    const result = await adminService.assignRole(7, 3);
    expect(result).toEqual([42]);
    expect(db.__chain.insert).toHaveBeenCalledWith({ user_id: 7, role_id: 3 });
  });
});

describe('adminService.removeRole', () => {
  it('should call del() and return the count', async () => {
    db.__chain.del.mockResolvedValueOnce(1);
    const n = await adminService.removeRole(7, 3);
    expect(n).toBe(1);
    expect(db.__chain.del).toHaveBeenCalled();
  });

  it('should return 0 when no rows match (already removed)', async () => {
    db.__chain.del.mockResolvedValueOnce(0);
    const n = await adminService.removeRole(7, 999);
    expect(n).toBe(0);
  });
});

describe('adminService.updateRolePermissions', () => {
  it('should serialise the permissions object as JSON before update', async () => {
    db.__chain.update.mockResolvedValueOnce(1);
    await adminService.updateRolePermissions(3, ['read', 'write']);
    const updateArg = db.__chain.update.mock.calls[0][0];
    expect(updateArg.permissions).toBe(JSON.stringify(['read', 'write']));
  });

  it('should serialise nested object permissions correctly', async () => {
    db.__chain.update.mockResolvedValueOnce(1);
    await adminService.updateRolePermissions(3, { workplans: ['read', 'write'] });
    const updateArg = db.__chain.update.mock.calls[0][0];
    expect(JSON.parse(updateArg.permissions)).toEqual({ workplans: ['read', 'write'] });
  });
});

describe('adminService.getUserRoles', () => {
  it('should return the joined role rows for a user', async () => {
    db.__chain.then.mockImplementationOnce((r) =>
      Promise.resolve([
        { id: 1, code: 'FOCAL_PERSON', name: 'Focal' },
        { id: 2, code: 'PLANNER', name: 'Planner' },
      ]).then(r)
    );
    const rows = await adminService.getUserRoles(7);
    expect(rows).toHaveLength(2);
    expect(rows[0].code).toBe('FOCAL_PERSON');
  });

  it('should return an empty array when the user has no roles', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    const rows = await adminService.getUserRoles(999);
    expect(rows).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────
//   adminService.getDivisionTree
// ─────────────────────────────────────────────────────────────────
describe('adminService.getDivisionTree', () => {
  it('should return rows with user_count coerced to a number', async () => {
    // MySQL count() returns a string — service must coerce to Number
    db.__chain.then.mockImplementationOnce((r) =>
      Promise.resolve([
        { code: 'DPHI', user_count: '5' },
        { code: 'DPI', user_count: '0' },
        { code: 'OPS', user_count: null },
      ]).then(r)
    );

    const rows = await adminService.getDivisionTree();
    expect(rows[0].user_count).toBe(5);
    expect(rows[1].user_count).toBe(0);
    expect(rows[2].user_count).toBe(0);
    rows.forEach(r => expect(typeof r.user_count).toBe('number'));
  });

  it('should list the focal persons of each unit from user_divisions (D-20261106-09)', async () => {
    db.__chain.then.mockImplementationOnce((r) =>
      Promise.resolve([
        { code: 'DPHI', user_count: '3', focal_user_ids: '4,12' },
        { code: 'OPS', user_count: '1', focal_user_ids: null },
      ]).then(r)
    );

    const rows = await adminService.getDivisionTree();
    expect(rows[0].focal_user_ids).toEqual([4, 12]);
    expect(rows[1].focal_user_ids).toEqual([]);
    expect(db.raw).toHaveBeenCalledWith(expect.stringContaining('AS focal_user_ids'), ['FOCAL_PERSON']);
  });

  it('should default to excluding alias rows', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await adminService.getDivisionTree();
    // whereNull('d.alias_of') must have been called
    expect(db.__chain.whereNull).toHaveBeenCalledWith('d.alias_of');
  });

  it('should include alias rows when includeAliases: true', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    db.__chain.whereNull.mockClear();
    await adminService.getDivisionTree({ includeAliases: true });
    expect(db.__chain.whereNull).not.toHaveBeenCalledWith('d.alias_of');
  });
});

// ─────────────────────────────────────────────────────────────────
//   adminService.updateDivision
// ─────────────────────────────────────────────────────────────────
//
// Critical paths to cover:
//   - patch with no allowed fields → no-op, returns current row
//   - level_type validation (must be one of directorate/division/unit)
//   - parent_code === code → cycle (self-parent)
//   - parent_code that walks back to `code` → cycle
//   - alias_of === code → self-alias error
//   - alias_of pointing at non-existent row → error
//   - alias_of pointing at a row that is itself an alias → chain error
//   - aliasing a row that is canonical for others → error
//   - focal_user_id non-numeric → 400
//   - focal_user_id pointing at missing user → 400
//   - happy path: bare update applies and returns the new row
//   - happy path: focal_user_id triggers ensureUserRole(FOCAL_PERSON)
//   - happy path: responsible_user_id triggers ensureUserRole(HEAD_OF_DIVISION)
describe('adminService.updateDivision', () => {
  it('should be a no-op (returns current row) when patch has no allowed fields', async () => {
    db.__chain.first.mockResolvedValueOnce({ code: 'DPHI', division_name: 'DPHI Name' });
    const row = await adminService.updateDivision('DPHI', { foo: 'bar', random: 1 });
    expect(row).toMatchObject({ code: 'DPHI' });
    // No transaction should have been opened
    expect(db.__chain.update).not.toHaveBeenCalled();
  });

  // Country office of one AU member state (D-20261026-05).
  it('should mark a country office with an upper-cased AU member state code', async () => {
    db.__chain.first.mockResolvedValueOnce({ code: 'KCO', is_country_office: 0, country_code: null });
    await adminService.updateDivision('KCO', { is_country_office: true, country_code: 'ken' });
    expect(db.__chain.update).toHaveBeenCalledWith(expect.objectContaining({ is_country_office: true, country_code: 'KEN' }));
  });

  it('should reject a country office without a country or with an unknown one', async () => {
    db.__chain.first.mockResolvedValueOnce({ code: 'KCO', is_country_office: 0, country_code: null });
    await expect(adminService.updateDivision('KCO', { is_country_office: true }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/country/i) });
    db.__chain.first.mockResolvedValueOnce({ code: 'KCO' });
    await expect(adminService.updateDivision('KCO', { is_country_office: true, country_code: 'FRA' }))
      .rejects.toMatchObject({ status: 400 });
    expect(db.__chain.update).not.toHaveBeenCalled();
  });

  it('should clear the country when the unit stops being a country office', async () => {
    db.__chain.first.mockResolvedValueOnce({ code: 'KCO', is_country_office: 1, country_code: 'KEN' });
    await adminService.updateDivision('KCO', { is_country_office: false, country_code: 'KEN' });
    expect(db.__chain.update).toHaveBeenCalledWith(expect.objectContaining({ is_country_office: false, country_code: null }));
  });

  it('should reject an invalid level_type with 400', async () => {
    await expect(
      adminService.updateDivision('DPHI', { level_type: 'kingdom' })
    ).rejects.toMatchObject({
      message: expect.stringMatching(/level_type/i),
      status: 400,
    });
  });

  it('should accept level_type = null (clear the value)', async () => {
    db.__chain.first.mockResolvedValueOnce({ code: 'DPHI' });
    const row = await adminService.updateDivision('DPHI', { level_type: null });
    expect(row).toBeDefined();
    // Should have run the update inside transaction (db.transaction wraps trx)
    expect(db.__chain.update).toHaveBeenCalled();
  });

  it('should reject parent_code === code (self-parent) with 400', async () => {
    await expect(
      adminService.updateDivision('DPHI', { parent_code: 'DPHI' })
    ).rejects.toMatchObject({
      message: expect.stringMatching(/own parent/i),
      status: 400,
    });
  });

  it('should reject parent_code that creates a cycle with 400', async () => {
    // updateDivision walks: db('division_codes').where('code', cursor)...first()
    // Start cursor = 'CHILD'. It looks up CHILD → returns parent_code = 'DPHI'.
    // Then cursor = 'DPHI' which equals `code` → cycle.
    db.__chain.first.mockResolvedValueOnce({ parent_code: 'DPHI' });
    await expect(
      adminService.updateDivision('DPHI', { parent_code: 'CHILD' })
    ).rejects.toMatchObject({
      message: expect.stringMatching(/cycle/i),
      status: 400,
    });
  });

  it('should reject alias_of === code with 400', async () => {
    await expect(
      adminService.updateDivision('DPHI', { alias_of: 'DPHI' })
    ).rejects.toMatchObject({
      message: expect.stringMatching(/alias of itself/i),
      status: 400,
    });
  });

  it('should reject alias_of pointing at a missing row with 400', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    await expect(
      adminService.updateDivision('DPHI', { alias_of: 'NOPE' })
    ).rejects.toMatchObject({
      message: expect.stringMatching(/does not exist/i),
      status: 400,
    });
  });

  it('should reject alias chains (alias_of points at another alias)', async () => {
    db.__chain.first.mockResolvedValueOnce({ code: 'OTHER', alias_of: 'CANONICAL' });
    await expect(
      adminService.updateDivision('DPHI', { alias_of: 'OTHER' })
    ).rejects.toMatchObject({
      message: expect.stringMatching(/alias chains|canonical/i),
      status: 400,
    });
  });

  it('should reject aliasing a row that is canonical for other aliases', async () => {
    // First first() → target row (clean). Second first() → existing inbound
    // alias pointing AT us, which means we cannot become an alias.
    db.__chain.first
      .mockResolvedValueOnce({ code: 'CANONICAL', alias_of: null })
      .mockResolvedValueOnce({ code: 'CHILD_ALIAS' });

    await expect(
      adminService.updateDivision('DPHI', { alias_of: 'CANONICAL' })
    ).rejects.toMatchObject({
      message: expect.stringMatching(/canonical for other aliases/i),
      status: 400,
    });
  });

  it('should ignore focal_user_id: focal persons are user_divisions rows (D-20261106-09)', async () => {
    db.__chain.first.mockResolvedValueOnce({ code: 'DPHI' }); // getDivisionByCode
    const row = await adminService.updateDivision('DPHI', { focal_user_id: 5 });
    expect(row).toEqual(expect.objectContaining({ code: 'DPHI' }));
    expect(db.__chain.update).not.toHaveBeenCalled();
  });

  it('should reject m_and_e_user_id pointing at a missing user', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined); // users lookup
    await expect(
      adminService.updateDivision('DPHI', { m_and_e_user_id: 999 })
    ).rejects.toMatchObject({
      message: expect.stringMatching(/m_and_e_user_id 999.*not found/i),
      status: 400,
    });
  });

  it('should reject responsible_user_id when not a finite number', async () => {
    await expect(
      adminService.updateDivision('DPHI', { responsible_user_id: NaN })
    ).rejects.toMatchObject({
      message: expect.stringMatching(/responsible_user_id.*numeric/i),
      status: 400,
    });
  });

  it('should apply a bare update (sort_order only) and return the refreshed row', async () => {
    // first() → return value of getDivisionByCode() at the END
    db.__chain.first.mockResolvedValueOnce({ code: 'DPHI', sort_order: 5 });

    const row = await adminService.updateDivision('DPHI', { sort_order: 5 });
    expect(row).toEqual({ code: 'DPHI', sort_order: 5 });
    expect(db.__chain.update).toHaveBeenCalled();
    // The update payload should include only sort_order
    const updateArg = db.__chain.update.mock.calls[0][0];
    expect(updateArg).toEqual({ sort_order: 5 });
  });

  it('should accept null m_and_e_user_id (clear the assignment) through the shared assignment service', async () => {
    // first() #1 → division read inside divisionAssignmentService; first() #2 → getDivisionByCode at the end
    db.__chain.first
      .mockResolvedValueOnce({ code: 'DPHI', m_and_e_user_id: null })
      .mockResolvedValueOnce({ code: 'DPHI', m_and_e_user_id: null });
    const row = await adminService.updateDivision('DPHI', { m_and_e_user_id: null });
    expect(row).toBeDefined();
    expect(db.__chain.update).toHaveBeenCalledWith({ m_and_e_user_id: null });
  });
});

describe('adminService.createUser / updateUser — division membership (D-20261009-03)', () => {
  const divisionAssignmentService = require('../../src/services/divisionAssignmentService');

  it('createUser turns division_code into a primary MEMBER row through the assignment service', async () => {
    const spy = jest.spyOn(divisionAssignmentService, 'addDivisionRole').mockResolvedValue(undefined);
    db.__chain.insert.mockResolvedValueOnce([42]);
    db.__chain.first.mockResolvedValueOnce({ id: 42 });

    await adminService.createUser({ email: 'new@x.com', password: 'secret123', division_code: 'DPHI' });

    expect(spy).toHaveBeenCalledWith(expect.anything(), {
      userId: 42, code: 'DPHI', role: 'MEMBER', isPrimary: true,
    });
    spy.mockRestore();
  });

  it('createUser without division_code adds no membership', async () => {
    const spy = jest.spyOn(divisionAssignmentService, 'addDivisionRole').mockResolvedValue(undefined);
    db.__chain.insert.mockResolvedValueOnce([43]);
    db.__chain.first.mockResolvedValueOnce({ id: 43 });

    await adminService.createUser({ email: 'solo@x.com', password: 'secret123' });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('updateUser never writes users.division_code (memberships live in user_divisions)', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 7 });

    await adminService.updateUser(7, { title: 'Dr', division_code: 'STALE' });

    const patch = db.__chain.update.mock.calls[0][0];
    expect(patch).not.toHaveProperty('division_code');
    expect(patch.title).toBe('Dr');
  });

  it('updateUser with only division_code performs no users update', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 7 });

    await adminService.updateUser(7, { division_code: 'STALE' });

    expect(db.__chain.update).not.toHaveBeenCalled();
  });
});

describe('adminService.createDivision — country office (D-20261026-05)', () => {
  it('should refuse a country office without a valid country before inserting', async () => {
    await expect(adminService.createDivision({ code: 'KCO', division_name: 'Kenya CO', is_country_office: true }))
      .rejects.toMatchObject({ status: 400 });
    expect(db.__chain.insert).not.toHaveBeenCalled();
  });

  it('should store the country office with its country', async () => {
    // No office yet for Kenya, no code clash, then the created row.
    db.__chain.first.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockResolvedValueOnce({ code: 'KCO' });
    await adminService.createDivision({ code: 'KCO', division_name: 'Kenya CO', is_country_office: true, country_code: 'KEN' });
    expect(db.__chain.insert).toHaveBeenCalledWith(expect.objectContaining({ code: 'KCO', is_country_office: true, country_code: 'KEN' }));
  });
});

describe('adminService.createDivision — country office defaults (D-20261028-01)', () => {
  it('should generate the code, the name and the directorate level from the country', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockResolvedValueOnce({ code: 'COD-CO' });
    await adminService.createDivision({ is_country_office: true, country_code: 'COD' });
    expect(db.__chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      code: 'COD-CO', division_name: 'Congo (Democratic Republic) Country Office', level_type: ORG_LEVEL_TYPES.DIRECTORATE, country_code: 'COD',
    }));
  });

  it('should refuse a second country office for the same country with 409', async () => {
    db.__chain.first.mockResolvedValueOnce({ code: 'COD-CO' });
    await expect(adminService.createDivision({ is_country_office: true, country_code: 'COD' }))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/already has a country office/) });
    expect(db.__chain.insert).not.toHaveBeenCalled();
  });
});
