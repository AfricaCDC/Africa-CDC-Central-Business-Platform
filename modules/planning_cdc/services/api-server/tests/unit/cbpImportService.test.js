// ── cbpImportService unit tests (D-20260713-01) ──
//
// Covers: domain filtering + dedup, insert of missing users, backfill-only
// updates (never overwrite), skip of complete accounts, and dryRun.

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/services/cbpService', () => ({
  fetchAllStaff: jest.fn(),
}));
jest.mock('../../src/services/divisionAssignmentService', () => ({
  addDivisionRole: jest.fn().mockResolvedValue(undefined),
}));
const divisionAssignmentService = require('../../src/services/divisionAssignmentService');

const { fetchAllStaff } = require('../../src/services/cbpService');
const { importCbpUsers } = require('../../src/services/cbpImportService');
const chain = sharedDb.__chain;

const STAFF = [
  { staffId: '101', firstName: 'Ada', lastName: 'K', workEmail: 'ada@africacdc.org' },
  { staffId: '102', firstName: 'Ben', lastName: 'M', workEmail: 'Ben@AFRICACDC.ORG' }, // case-insensitive
  { staffId: '103', firstName: 'Eve', lastName: 'X', workEmail: 'eve@gmail.com' },     // filtered out
  { staffId: '104', firstName: '', lastName: '', workEmail: 'ada@africacdc.org' },     // duplicate email
];

beforeEach(() => {
  jest.clearAllMocks();
  chain.first.mockReset().mockResolvedValue(undefined);
  chain.insert.mockReset().mockResolvedValue([1]);
  chain.update.mockReset().mockResolvedValue(1);
  divisionAssignmentService.addDivisionRole.mockClear();
  ['where', 'whereRaw', 'whereNull'].forEach((m) => {
    if (!chain[m]) chain[m] = jest.fn().mockReturnValue(chain);
    else chain[m].mockReset().mockReturnValue(chain);
  });
  fetchAllStaff.mockResolvedValue(STAFF);
});

describe('importCbpUsers', () => {
  it('should insert missing domain users only, deduped and lower-cased', async () => {
    const s = await importCbpUsers();
    expect(s).toMatchObject({ fetched: 4, eligible: 2, inserted: 2, updated: 0, skipped: 0 });
    const emails = chain.insert.mock.calls.map((c) => c[0].email);
    expect(emails).toEqual(['ada@africacdc.org', 'ben@africacdc.org']);
    expect(chain.insert.mock.calls[0][0]).toMatchObject({
      status: 'ACTIVE', user_type: 'STAFF', cbp_id: '101', full_name: 'Ada K',
    });
  });

  it('should backfill cbp_id on existing users without overwriting anything else', async () => {
    chain.first
      .mockResolvedValueOnce({ id: 7, email: 'ada@africacdc.org', cbp_id: null, full_name: 'Ada Existing' })
      // Ada has no cbp_id yet, so the import checks nobody else holds '101'
      // before backfilling it (the UNIQUE index guard added in D-20260902-01).
      .mockResolvedValueOnce(undefined)
      // Ben already carries a cbp_id, so no holder check is needed for him.
      .mockResolvedValueOnce({ id: 8, email: 'ben@africacdc.org', cbp_id: '102', full_name: 'Ben M', first_name: 'Ben', last_name: 'M' });
    const s = await importCbpUsers();
    expect(s).toMatchObject({ inserted: 0, updated: 1, skipped: 1 });
    expect(chain.update).toHaveBeenCalledTimes(1);
    const patch = chain.update.mock.calls[0][0];
    expect(patch.cbp_id).toBe('101');
    expect(patch.full_name).toBeUndefined(); // existing name never touched
  });

  it('dryRun should count without writing', async () => {
    const s = await importCbpUsers({ dryRun: true });
    expect(s).toMatchObject({ inserted: 2, dryRun: true });
    expect(chain.insert).not.toHaveBeenCalled();
    expect(chain.update).not.toHaveBeenCalled();
  });

  it('should respect a custom domain', async () => {
    const s = await importCbpUsers({ domain: 'gmail.com', dryRun: true });
    expect(s).toMatchObject({ eligible: 1, inserted: 1 });
  });
});

// ── Email corrected upstream (D-20260902-01) ──
//
// Regression: CBP fixed a typo in a work email ("Clmpumpu" → "Cimpumpu").
// The email lookup missed, the import tried to INSERT, and the row collided
// with the existing account on the UNIQUE index uq_users_cbp_id. The SQL
// error aborted the whole run and the route reported it as an unreachable
// CBP directory, which sent debugging in the wrong direction for days.
describe('importCbpUsers — upstream email corrections', () => {
  const RENAMED = [
    { staffId: '725', firstName: 'Raissa', lastName: 'Cimpumpu', workEmail: 'cimpumpu@africacdc.org' },
  ];

  it('should update the existing account when cbp_id matches another email, never insert', async () => {
    fetchAllStaff.mockResolvedValue(RENAMED);
    // 1st lookup: by email → nothing. 2nd lookup: by cbp_id → the old account.
    chain.first
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 469, email: 'clmpumpu@africacdc.org', cbp_id: '725', full_name: 'Raissa Clmpumpu' });

    const s = await importCbpUsers();

    expect(chain.insert).not.toHaveBeenCalled();
    expect(chain.update).toHaveBeenCalledTimes(1);
    expect(chain.update.mock.calls[0][0]).toMatchObject({ email: 'cimpumpu@africacdc.org' });
    expect(s).toMatchObject({ inserted: 0, updated: 1, failed: 0 });
  });

  it('should keep going and report the failure when one record cannot be written', async () => {
    fetchAllStaff.mockResolvedValue([
      { staffId: '900', firstName: 'A', lastName: 'A', workEmail: 'a@africacdc.org' },
      { staffId: '901', firstName: 'B', lastName: 'B', workEmail: 'b@africacdc.org' },
    ]);
    chain.first.mockResolvedValue(undefined);
    chain.insert
      .mockRejectedValueOnce(Object.assign(new Error('ER_DUP_ENTRY'), { code: 'ER_DUP_ENTRY' }))
      .mockResolvedValueOnce([2]);

    const s = await importCbpUsers();

    // The second record still lands — one bad row must not sink the run.
    expect(s).toMatchObject({ inserted: 1, failed: 1 });
    expect(s.failures[0]).toMatchObject({ email: 'a@africacdc.org' });
  });
});

// ── In-flight guard: one import per process ──
describe('importCbpUsers — in-flight guard', () => {
  it('should reject a second concurrent run with IMPORT_IN_PROGRESS and let the first finish', async () => {
    let release;
    fetchAllStaff.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(STAFF); }));
    const first = importCbpUsers({ dryRun: true });
    await expect(importCbpUsers({ dryRun: true })).rejects.toMatchObject({ code: 'IMPORT_IN_PROGRESS' });
    release();
    await expect(first).resolves.toMatchObject({ eligible: 2 });
  });

  it('should release the lock after a failed run so the next run can start', async () => {
    fetchAllStaff.mockRejectedValueOnce(new Error('CBP down'));
    await expect(importCbpUsers({ dryRun: true })).rejects.toThrow('CBP down');
    await expect(importCbpUsers({ dryRun: true })).resolves.toMatchObject({ eligible: 2 });
  });
});

// ── Duplicate person: cbp_id already held by another account ──
//
// The mirror of the email-correction case. Backfilling cbp_id onto the
// email-matched account collides with a second, CBP-created account for the
// same person. Merging is a human decision (which row keeps the roles), so the
// import must report it in terms an admin can act on, not "ER_DUP_ENTRY".
describe('importCbpUsers — duplicate accounts for one person', () => {
  it('should report the conflicting account instead of failing on a raw SQL error', async () => {
    fetchAllStaff.mockResolvedValue([
      { staffId: '624', firstName: 'Stephano', lastName: 'Patrick', workEmail: 'patricks@africacdc.org' },
    ]);
    chain.first
      // matched by email: the real account, no cbp_id yet
      .mockResolvedValueOnce({ id: 328, email: 'patricks@africacdc.org', cbp_id: null, full_name: 'Stephano Patrick' })
      // that cbp_id is already held by the duplicate account
      .mockResolvedValueOnce({ id: 479, email: 'stephanoj@africacdc.org', cbp_id: '624' });

    const s = await importCbpUsers();

    expect(chain.update).not.toHaveBeenCalled();
    expect(s).toMatchObject({ failed: 1, updated: 0 });
    expect(s.failures[0].reason).toMatch(/stephanoj@africacdc\.org/);
    expect(s.failures[0].reason).toMatch(/479/);
  });
});

// ── Structured name fields (staff modal bug) ──
//
// Regression: users imported from CBP were written with full_name only, so the
// admin edit modal showed empty first / last name fields. The import now writes
// and backfills first / middle / last name, never overwriting populated values.

describe('importCbpUsers — structured name fields', () => {
  it('should insert first, middle and last name alongside full_name', async () => {
    fetchAllStaff.mockResolvedValue([
      { staffId: '201', firstName: 'Ada', otherName: 'Kwame', lastName: 'Mensah', workEmail: 'ada.m@africacdc.org' },
    ]);
    await importCbpUsers();
    expect(chain.insert.mock.calls[0][0]).toMatchObject({
      full_name: 'Ada Mensah', first_name: 'Ada', middle_name: 'Kwame', last_name: 'Mensah',
    });
  });

  it('should backfill empty structured name fields on an existing user', async () => {
    fetchAllStaff.mockResolvedValue([{ staffId: '202', firstName: 'Ben', lastName: 'M', workEmail: 'ben@africacdc.org' }]);
    chain.first.mockResolvedValueOnce({
      id: 8, email: 'ben@africacdc.org', cbp_id: '202', full_name: 'Ben M',
      first_name: null, middle_name: null, last_name: null,
    });
    const s = await importCbpUsers();
    expect(s).toMatchObject({ updated: 1 });
    expect(chain.update.mock.calls[0][0]).toMatchObject({ first_name: 'Ben', last_name: 'M' });
    expect(chain.update.mock.calls[0][0].middle_name).toBeUndefined();
  });

  it('should never overwrite populated structured name fields', async () => {
    fetchAllStaff.mockResolvedValue([{ staffId: '203', firstName: 'Ben', lastName: 'M', workEmail: 'ben@africacdc.org' }]);
    chain.first.mockResolvedValueOnce({
      id: 9, email: 'ben@africacdc.org', cbp_id: '203', full_name: 'Ben M',
      first_name: 'Benjamin', middle_name: null, last_name: 'Mwangi',
    });
    const s = await importCbpUsers();
    expect(s).toMatchObject({ updated: 0, skipped: 1 });
    expect(chain.update).not.toHaveBeenCalled();
  });
});

describe('importCbpUsers — division from CBP (D-20261009-03)', () => {
  const WITH_DIV = [
    { staffId: '201', firstName: 'Ada', lastName: 'K', workEmail: 'ada@africacdc.org', divisionId: '12' },
  ];

  beforeEach(() => {
    fetchAllStaff.mockResolvedValue(WITH_DIV);
  });

  it('should place a user with no division at all as primary MEMBER of the division bound to the CBP id', async () => {
    chain.first
      .mockResolvedValueOnce({ id: 7, email: 'ada@africacdc.org', cbp_id: '201', full_name: 'Ada K', first_name: 'Ada', last_name: 'K', division_code: null })
      .mockResolvedValueOnce(undefined)          // no user_divisions row
      .mockResolvedValueOnce({ code: 'DPHI' });  // division_codes.division_cbp_id = '12'
    const s = await importCbpUsers();
    expect(s).toMatchObject({ skipped: 1, divisions_filled: 1 });
    expect(divisionAssignmentService.addDivisionRole).toHaveBeenCalledWith(expect.anything(), {
      userId: 7, code: 'DPHI', role: 'MEMBER', isPrimary: true,
    });
    expect(chain.update).toHaveBeenCalledWith({ division_code: 'DPHI' });
  });

  it('should never touch a user who already has a user_divisions row', async () => {
    chain.first
      .mockResolvedValueOnce({ id: 7, email: 'ada@africacdc.org', cbp_id: '201', full_name: 'Ada K', first_name: 'Ada', last_name: 'K', division_code: null })
      .mockResolvedValueOnce({ id: 3 }); // existing membership somewhere
    const s = await importCbpUsers();
    expect(s.divisions_filled).toBe(0);
    expect(divisionAssignmentService.addDivisionRole).not.toHaveBeenCalled();
  });

  it('should never touch a user whose legacy users.division_code is set', async () => {
    chain.first
      .mockResolvedValueOnce({ id: 7, email: 'ada@africacdc.org', cbp_id: '201', full_name: 'Ada K', first_name: 'Ada', last_name: 'K', division_code: 'CLDS' });
    const s = await importCbpUsers();
    expect(s.divisions_filled).toBe(0);
    expect(divisionAssignmentService.addDivisionRole).not.toHaveBeenCalled();
    expect(chain.first).toHaveBeenCalledTimes(1);
  });

  it('should do nothing when no division carries that CBP id (no name matching)', async () => {
    chain.first
      .mockResolvedValueOnce({ id: 7, email: 'ada@africacdc.org', cbp_id: '201', full_name: 'Ada K', first_name: 'Ada', last_name: 'K', division_code: null })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined); // unmapped CBP division
    const s = await importCbpUsers();
    expect(s.divisions_filled).toBe(0);
    expect(divisionAssignmentService.addDivisionRole).not.toHaveBeenCalled();
  });

  it('should skip alias rows when looking the division up', async () => {
    chain.first
      .mockResolvedValueOnce({ id: 7, email: 'ada@africacdc.org', cbp_id: '201', full_name: 'Ada K', first_name: 'Ada', last_name: 'K', division_code: null })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ code: 'DPHI' });
    await importCbpUsers();
    expect(chain.whereNull).toHaveBeenCalledWith('alias_of');
    expect(chain.where).toHaveBeenCalledWith('division_cbp_id', '12');
  });

  it('should place a newly inserted account too', async () => {
    chain.insert.mockResolvedValueOnce([42]);
    chain.first
      .mockResolvedValueOnce(undefined)          // no user by email
      .mockResolvedValueOnce(undefined)          // no user by cbp_id
      .mockResolvedValueOnce(undefined)          // no user_divisions row
      .mockResolvedValueOnce({ code: 'DPHI' });
    const s = await importCbpUsers();
    expect(s).toMatchObject({ inserted: 1, divisions_filled: 1 });
    expect(divisionAssignmentService.addDivisionRole).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: 42, code: 'DPHI' }));
  });

  it('dryRun should count the placement without writing', async () => {
    chain.first
      .mockResolvedValueOnce({ id: 7, email: 'ada@africacdc.org', cbp_id: '201', full_name: 'Ada K', first_name: 'Ada', last_name: 'K', division_code: null })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ code: 'DPHI' });
    const s = await importCbpUsers({ dryRun: true });
    expect(s.divisions_filled).toBe(1);
    expect(divisionAssignmentService.addDivisionRole).not.toHaveBeenCalled();
    expect(chain.update).not.toHaveBeenCalled();
  });
});
