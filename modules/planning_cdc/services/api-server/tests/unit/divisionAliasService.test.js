/* eslint-disable no-restricted-syntax --
 * P-31: these are DB column-enum WIRE values in test fixtures/assertions
 * (plan_nodes.node_type = 'SPECIFIC_ACTIVITY'/'BROAD_ACTIVITY'/'OUTCOME_INDICATOR', etc.;
 * workplan_items.item_type = 'ACTIVITY'/'TASK'), NOT ENTITY_TYPES identifiers.
 * Literal wire values are intentional in tests so a column-enum rename is caught
 * by a failing test instead of masked by importing the enum. Mirrors the source
 * plan-nodes route files which carry the same documented P-31 exception.
 */
// ── divisionAliasService unit tests ──
//
// Tests: resolveAliases, sameDivision, getDirectorateChildren, getDirectoratesForUser
//
// Strategy: We do NOT use jest.resetModules() because the in-memory cache
// is module-level and resetting modules also resets the db mock reference.
// Instead, we invalidate the cache by calling invalidateAliasCache() and
// re-program db.__chain sequences for each test.

const db = require('../../src/config/db');

// Add schema.hasTable stub once — divisionAliasService.getDirectoratesForUser uses it
if (!db.schema) {
  db.schema = { hasTable: jest.fn().mockResolvedValue(true) };
}

function resetChain() {
  const c = db.__chain;
  c.first.mockReset().mockResolvedValue(undefined);
  c.insert.mockReset().mockResolvedValue([1]);
  c.update.mockReset().mockResolvedValue(1);
  c.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  c.where.mockReset().mockReturnValue(c);
  c.select.mockReset().mockReturnValue(c);
  c.whereNull.mockReset().mockReturnValue(c);
  c.orWhere.mockReset().mockReturnValue(c);
  c.andWhere.mockReset().mockReturnValue(c);
  c.join.mockReset().mockReturnValue(c);
  c.leftJoin.mockReset().mockReturnValue(c);
  c.andWhere.mockReset && c.andWhere.mockReset().mockReturnValue(c);
  db.schema.hasTable.mockResolvedValue(true);
}

const svc = require('../../src/services/divisionAliasService');

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  db.schema.hasTable.mockResolvedValue(true);
  // Invalidate the alias cache between tests so each test gets fresh DB reads
  svc.invalidateAliasCache();
});

// ── resolveAliases ────────────────────────────────────────────────────────────
describe('divisionAliasService.resolveAliases', () => {
  it('should return empty array for null code', async () => {
    const result = await svc.resolveAliases(null);
    expect(result).toEqual([]);
  });

  it('should return empty array for undefined code', async () => {
    const result = await svc.resolveAliases(undefined);
    expect(result).toEqual([]);
  });

  it('should return [code] when code has no alias in DB', async () => {
    db.__chain.then.mockImplementationOnce((r) =>
      Promise.resolve([{ code: 'DCM', alias_of: null }]).then(r)
    );
    const result = await svc.resolveAliases('DCM');
    expect(result.map((c) => c.toUpperCase())).toContain('DCM');
  });

  it('should include aliased code when alias_of is set', async () => {
    db.__chain.then.mockImplementationOnce((r) =>
      Promise.resolve([
        { code: 'DCM', alias_of: 'DCM2' },
        { code: 'DCM2', alias_of: null },
      ]).then(r)
    );
    const result = await svc.resolveAliases('DCM');
    const upper = result.map((c) => c.toUpperCase());
    expect(upper).toContain('DCM');
    expect(upper).toContain('DCM2');
  });

  it('should return [code] when code is not found in DB', async () => {
    db.__chain.then.mockImplementationOnce((r) =>
      Promise.resolve([]).then(r) // empty DB
    );
    const result = await svc.resolveAliases('GHOST');
    expect(result).toContain('GHOST');
  });
});

// ── sameDivision ──────────────────────────────────────────────────────────────
describe('divisionAliasService.sameDivision', () => {
  it('should return false for null inputs', async () => {
    expect(await svc.sameDivision(null, 'DCM')).toBe(false);
    expect(await svc.sameDivision('DCM', null)).toBe(false);
    expect(await svc.sameDivision(null, null)).toBe(false);
  });

  it('should return true when codes are equal (case-insensitive)', async () => {
    // Same string — short-circuits before DB query
    expect(await svc.sameDivision('DCM', 'dcm')).toBe(true);
  });

  it('should return false when codes are different and not aliased', async () => {
    db.__chain.then.mockImplementationOnce((r) =>
      Promise.resolve([
        { code: 'DCM', alias_of: null },
        { code: 'AMERT', alias_of: null },
      ]).then(r)
    );
    expect(await svc.sameDivision('DCM', 'AMERT')).toBe(false);
  });

  it('should return true when codes are aliased', async () => {
    db.__chain.then.mockImplementationOnce((r) =>
      Promise.resolve([
        { code: 'DCM', alias_of: 'DCM_ALIAS' },
        { code: 'DCM_ALIAS', alias_of: null },
      ]).then(r)
    );
    expect(await svc.sameDivision('DCM', 'DCM_ALIAS')).toBe(true);
  });
});

// ── invalidateAliasCache ──────────────────────────────────────────────────────
describe('divisionAliasService.invalidateAliasCache', () => {
  it('should force a fresh DB read after invalidation', async () => {
    // First call — populates cache
    db.__chain.then.mockImplementationOnce((r) =>
      Promise.resolve([{ code: 'DCM', alias_of: null }]).then(r)
    );
    await svc.resolveAliases('DCM');

    // Invalidate
    svc.invalidateAliasCache();

    // Second call — should hit DB again (new data)
    db.__chain.then.mockImplementationOnce((r) =>
      Promise.resolve([{ code: 'DCM', alias_of: 'X' }, { code: 'X', alias_of: null }]).then(r)
    );
    const result = await svc.resolveAliases('DCM');
    expect(result.map((c) => c.toUpperCase())).toContain('X');
  });
});

// ── getDirectorateChildren ─────────────────────────────────────────────────────
describe('divisionAliasService.getDirectorateChildren', () => {
  it('should return empty array for null directorateCode', async () => {
    const result = await svc.getDirectorateChildren(null);
    expect(result).toEqual([]);
  });

  it('should return at least the directorate itself', async () => {
    // getDirectorateChildren does two DB operations:
    // 1) db('division_codes').select('code','parent_code','alias_of') for the full tree
    // 2) resolveAliases for each member of the result set (which uses the alias cache)
    //    Since cache is empty, it re-fetches the alias map.
    const allRows = [
      { code: 'FMG', parent_code: null, alias_of: null },
      { code: 'DCM', parent_code: 'FMG', alias_of: null },
    ];
    // First then() = getDirectorateChildren's tree query
    // Second then() = resolveAliases rebuilds the alias map (per child in result set)
    db.__chain.then
      .mockImplementationOnce((r) => Promise.resolve(allRows).then(r)) // tree rows
      .mockImplementationOnce((r) => Promise.resolve(allRows).then(r)) // alias map for FMG
      .mockImplementationOnce((r) => Promise.resolve(allRows).then(r)); // alias map for DCM

    const result = await svc.getDirectorateChildren('FMG');
    expect(Array.isArray(result)).toBe(true);
    expect(result.map((c) => c.toUpperCase())).toContain('FMG');
  });
});

// ── getDirectoratesForUser ─────────────────────────────────────────────────────
describe('divisionAliasService.getDirectoratesForUser', () => {
  it('should return empty array for null userId', async () => {
    expect(await svc.getDirectoratesForUser(null)).toEqual([]);
  });

  it('should return empty array for userId=0', async () => {
    expect(await svc.getDirectoratesForUser(0)).toEqual([]);
  });

  it('should return directorate when user.division_code is a directorate', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 7, division_code: 'FMG' })          // users row
      .mockResolvedValueOnce({ code: 'FMG', level_type: 'directorate' }); // division_codes row

    // assigned directorates (responsible/focal) + user_divisions junction
    db.__chain.then
      .mockImplementationOnce((r) => Promise.resolve([]).then(r))  // assigned directorates
      .mockImplementationOnce((r) => Promise.resolve([]).then(r)); // user_divisions rows (hasUD=true)

    const result = await svc.getDirectoratesForUser(7);
    expect(result).toContain('FMG');
  });

  it('should return empty array when user has no directorate', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 5, division_code: 'DCM' })         // users row
      .mockResolvedValueOnce({ code: 'DCM', level_type: 'division' }); // not a directorate

    db.__chain.then
      .mockImplementationOnce((r) => Promise.resolve([]).then(r))  // no assigned directorates
      .mockImplementationOnce((r) => Promise.resolve([]).then(r)); // no user_divisions

    const result = await svc.getDirectoratesForUser(5);
    expect(result).toEqual([]);
  });

  it('should include directorates from responsible_user_id assignment', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 3, division_code: null }); // no direct div code

    db.__chain.then
      .mockImplementationOnce((r) => Promise.resolve([{ code: 'FMG' }]).then(r)) // assigned as responsible
      .mockImplementationOnce((r) => Promise.resolve([]).then(r));                // user_divisions

    const result = await svc.getDirectoratesForUser(3);
    expect(result).toContain('FMG');
  });
});
// ── getDirectorateOf / sameDirectorate (D-20260710-01) ───────────────────────
describe('getDirectorateOf / sameDirectorate', () => {
  const ORG = [
    { code: 'CLSN', parent_code: null, alias_of: null, level_type: 'directorate' },
    { code: 'CLDS', parent_code: 'CLSN', alias_of: null, level_type: 'division' },
    { code: 'PGI', parent_code: 'CLSN', alias_of: null, level_type: 'division' },
    { code: 'DG', parent_code: null, alias_of: null, level_type: 'directorate' },
    { code: 'PRA', parent_code: 'DG', alias_of: null, level_type: 'division' },
    { code: 'PIU', parent_code: 'DG', alias_of: null, level_type: 'division' },
    { code: 'PHE', parent_code: null, alias_of: null, level_type: 'directorate' },
    { code: 'SDI', parent_code: 'PHE', alias_of: null, level_type: 'division' },
  ];
  const armOrg = (times = 1) => {
    for (let i = 0; i < times; i++) {
      db.__chain.then.mockImplementationOnce((r) => Promise.resolve(ORG).then(r));
    }
  };

  it('should walk parents up to the directorate', async () => {
    armOrg();
    expect(await svc.getDirectorateOf('CLDS')).toBe('CLSN');
  });

  it('should return the code itself when it IS a directorate', async () => {
    armOrg();
    expect(await svc.getDirectorateOf('CLSN')).toBe('CLSN');
  });

  it('should return null for unknown codes', async () => {
    armOrg();
    expect(await svc.getDirectorateOf('NOPE')).toBeNull();
  });

  it('sameDirectorate: true for two divisions under the same thematic directorate', async () => {
    armOrg(2); // one org read per getDirectorateOf call
    expect(await svc.sameDirectorate('CLDS', 'PGI')).toBe(true);
  });

  it('sameDirectorate: false across directorates', async () => {
    armOrg(2);
    expect(await svc.sameDirectorate('CLDS', 'SDI')).toBe(false);
  });

  it('sameDirectorate: false for DG-grouped divisions (excluded family)', async () => {
    armOrg(2);
    expect(await svc.sameDirectorate('PIU', 'PRA')).toBe(false);
  });
});

// ── resolveHolderUpChain (D-20261009-03) ─────────────────────────────────────
describe('divisionAliasService.resolveHolderUpChain', () => {
  const { makeFakeKnex } = require('../helpers/fakeKnex');
  const ORG = [
    { code: 'CLSN', parent_code: null, alias_of: null, level_type: 'directorate', responsible_user_id: 31, m_and_e_user_id: 61 },
    { code: 'CLDS', parent_code: 'CLSN', alias_of: null, level_type: 'division', responsible_user_id: 7, m_and_e_user_id: null },
    { code: 'LABU', parent_code: 'CLDS', alias_of: null, level_type: 'unit', responsible_user_id: null, m_and_e_user_id: null },
    { code: 'NOHEAD', parent_code: 'CLSN', alias_of: null, level_type: 'division', responsible_user_id: null, m_and_e_user_id: null },
    { code: 'OLDCLDS', parent_code: null, alias_of: 'CLDS', level_type: null, responsible_user_id: null, m_and_e_user_id: null },
    { code: 'LOOP', parent_code: 'LOOP', alias_of: null, level_type: 'division', responsible_user_id: null, m_and_e_user_id: null },
  ];
  const fk = () => makeFakeKnex({ division_codes: ORG.map((r) => ({ ...r })) });

  it('returns the division own responsible when set', async () => {
    expect(await svc.resolveHolderUpChain(fk(), 'CLDS', 'responsible_user_id')).toBe(7);
  });

  it('a unit without a head resolves to its division head', async () => {
    expect(await svc.resolveHolderUpChain(fk(), 'LABU', 'responsible_user_id')).toBe(7);
  });

  it('a division without a head resolves to the directorate director', async () => {
    expect(await svc.resolveHolderUpChain(fk(), 'NOHEAD', 'responsible_user_id')).toBe(31);
  });

  it('follows an alias to its canonical row first', async () => {
    expect(await svc.resolveHolderUpChain(fk(), 'OLDCLDS', 'responsible_user_id')).toBe(7);
  });

  it('minLevel skips rows below the directorate (DIRECTOR steps)', async () => {
    expect(await svc.resolveHolderUpChain(fk(), 'LABU', 'responsible_user_id', { minLevel: 'directorate' })).toBe(31);
  });

  it('works for the M&E pointer', async () => {
    expect(await svc.resolveHolderUpChain(fk(), 'CLDS', 'm_and_e_user_id')).toBe(61);
  });

  it('returns null for unknown codes, empty codes and cycles', async () => {
    expect(await svc.resolveHolderUpChain(fk(), 'NOPE', 'responsible_user_id')).toBeNull();
    expect(await svc.resolveHolderUpChain(fk(), null, 'responsible_user_id')).toBeNull();
    expect(await svc.resolveHolderUpChain(fk(), 'LOOP', 'responsible_user_id')).toBeNull();
  });
});
