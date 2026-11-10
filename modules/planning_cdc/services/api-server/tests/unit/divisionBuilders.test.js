/* eslint-disable no-restricted-syntax --
 * P-31: these are DB column-enum WIRE values in test fixtures/assertions
 * (plan_nodes.node_type = 'SPECIFIC_ACTIVITY'/'BROAD_ACTIVITY'/'OUTCOME_INDICATOR', etc.;
 * workplan_items.item_type = 'ACTIVITY'/'TASK'), NOT ENTITY_TYPES identifiers.
 * Literal wire values are intentional in tests so a column-enum rename is caught
 * by a failing test instead of masked by importing the enum. Mirrors the source
 * plan-nodes route files which carry the same documented P-31 exception.
 */
// ── divisionBuilders unit tests ──
//
// Covers: buildReasonMap, fetchDivisionRows, hydrateDivisionRow, sortDivisions

const db = require('../../src/config/db');
const chain = db.__chain;

// Mock divisionAliasService to avoid real DB calls via require() inside builders
jest.mock('../../src/services/divisionAliasService', () => ({
  scopeCoversDivision: jest.fn().mockResolvedValue(true),
  sameDivision: jest.fn().mockResolvedValue(false),
  getDirectoratesForUser: jest.fn().mockResolvedValue([]),
  getDirectorateChildren: jest.fn().mockResolvedValue([]),
}));

function resetChain() {
  chain.first.mockReset().mockResolvedValue(undefined);
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  chain.insert.mockReset().mockResolvedValue([1]);
  chain.update.mockReset().mockResolvedValue(1);
  chain.del.mockReset().mockResolvedValue(1);
  ['select', 'where', 'whereIn', 'orderBy', 'leftJoin', 'join',
    'andWhere', 'orWhere', 'limit'].forEach((m) => {
    if (chain[m]) chain[m].mockReset().mockReturnValue(chain);
    else chain[m] = jest.fn().mockReturnValue(chain);
  });
  db.raw = jest.fn().mockReturnValue(chain);
}

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  const { getDirectoratesForUser, getDirectorateChildren } = require('../../src/services/divisionAliasService');
  getDirectoratesForUser.mockResolvedValue([]);
  getDirectorateChildren.mockResolvedValue([]);
});

const svc = require('../../src/routes/me/divisionBuilders');

// ── buildReasonMap ────────────────────────────────────────────────────────────
describe('buildReasonMap()', () => {
  it('should return empty reasons and junctionData when user has no assignments', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r)); // udRows = []
    // No contributing indicators
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));

    const result = await svc.buildReasonMap({ id: 1, division_code: null });
    expect(result.reasons.size).toBe(0);
    expect(result.junctionData.size).toBe(0);
  });

  it('should add attached reason from legacy division_code when no user_divisions', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r)); // udRows = []
    // Contributing indicators
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));

    const result = await svc.buildReasonMap({ id: 1, division_code: 'DCM' });
    expect(result.reasons.has('DCM')).toBe(true);
    expect(Array.from(result.reasons.get('DCM'))).toContain('attached');
  });

  it('should map user_divisions roles to reasons', async () => {
    const udRows = [
      { division_code: 'DCM', role: 'FOCAL_PERSON', is_primary: true },
      { division_code: 'WHC', role: 'HEAD_OF_DIVISION', is_primary: false },
    ];
    chain.then.mockImplementationOnce((r) => Promise.resolve(udRows).then(r));
    // contributing indicators
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));

    const result = await svc.buildReasonMap({ id: 1, division_code: 'DCM' });
    expect(result.reasons.has('DCM')).toBe(true);
    expect(result.reasons.has('WHC')).toBe(true);
    const dcmReasons = Array.from(result.reasons.get('DCM'));
    expect(dcmReasons).toContain('focal');
    const whcReasons = Array.from(result.reasons.get('WHC'));
    expect(whcReasons).toContain('responsible');
    expect(result.junctionData.has('DCM')).toBe(true);
  });

  it('should add directorate child reasons', async () => {
    const { getDirectoratesForUser, getDirectorateChildren } = require('../../src/services/divisionAliasService');
    getDirectoratesForUser.mockResolvedValueOnce(['DIR-DCPH']);
    getDirectorateChildren.mockResolvedValueOnce(['DCM', 'WHC']);

    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r)); // udRows
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r)); // contribs

    const result = await svc.buildReasonMap({ id: 1, division_code: null });
    expect(result.reasons.has('DCM')).toBe(true);
    expect(Array.from(result.reasons.get('DCM'))).toContain('directorate_child');
  });

  it('should add contributing indicator reason for own division', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r)); // udRows
    // Indicators where myDiv contributes
    chain.then.mockImplementationOnce((r) => Promise.resolve([
      { responsible_division_code: 'WHC', contributing_divisions: JSON.stringify(['DCM', 'XYZ']) },
    ]).then(r));

    const result = await svc.buildReasonMap({ id: 1, division_code: 'DCM' });
    // Should have added indicator_main_for_my_contribution for WHC
    expect(result.reasons.has('WHC')).toBe(true);
  });
});

// ── sortDivisions ─────────────────────────────────────────────────────────────
describe('sortDivisions()', () => {
  it('should sort directorates before non-directorates', () => {
    const divs = [
      { code: 'DCM', division_name: 'Disease Control', level_type: 'division' },
      { code: 'DIR-DCPH', division_name: 'DCPH', level_type: 'directorate' },
    ];
    svc.sortDivisions(divs);
    expect(divs[0].level_type).toBe('directorate');
  });

  it('should sort alphabetically within same level_type', () => {
    const divs = [
      { code: 'WHC', division_name: 'Women Health', level_type: 'division' },
      { code: 'DCM', division_name: 'Disease Control', level_type: 'division' },
    ];
    svc.sortDivisions(divs);
    expect(divs[0].division_name).toBe('Disease Control');
  });
});

// ── hydrateDivisionRow ────────────────────────────────────────────────────────
describe('hydrateDivisionRow()', () => {
  it('should return hydrated row with inherited focal_name from parent', async () => {
    const row = {
      code: 'DCM',
      division_name: 'Disease Control',
      level_type: 'division',
      parent_code: 'DIR-DCPH',
      alias_of: null,
      focal_name: '',
      focal_email: null,
      responsible_name: 'Alice Smith',
      responsible_email: 'alice@africacdc.org',
      m_and_e_name: '',
      m_and_e_email: null,
    };
    const reasons = new Map([['DCM', new Set(['focal'])]]);
    const byCode = new Map([
      ['DIR-DCPH', {
        code: 'DIR-DCPH',
        parent_code: null,
        focal_name: 'Bob Jones',
        focal_email: 'bob@africacdc.org',
      }],
    ]);
    // lookupParentAssignment — not called because byCode has it
    const result = await svc.hydrateDivisionRow(row, {
      byCode,
      reasons,
      primaryCode: 'DCM',
      junctionData: new Map([['DCM', [{ role: 'FOCAL_PERSON', is_primary: true }]]]),
    });
    expect(result.code).toBe('DCM');
    expect(result.responsible_name).toBe('Alice Smith');
    expect(result.is_primary).toBe(true);
    expect(result.junction_roles).toContain('FOCAL_PERSON');
    expect(result.reasons).toContain('focal');
  });

  it('should return null focal when no local or inherited name', async () => {
    const row = {
      code: 'WHC',
      division_name: 'Women Health',
      level_type: 'division',
      parent_code: null,
      alias_of: null,
      focal_name: '',
      focal_email: null,
      responsible_name: '',
      responsible_email: null,
      m_and_e_name: '',
      m_and_e_email: null,
    };
    const result = await svc.hydrateDivisionRow(row, {
      byCode: new Map(),
      reasons: new Map(),
      primaryCode: '',
      junctionData: new Map(),
    });
    expect(result.focal_name).toBeNull();
    expect(result.is_primary).toBe(false);
    expect(result.junction_roles).toEqual([]);
    expect(result.is_country_office).toBe(false);
    expect(result.country_code).toBeNull();
  });

  it('should flag a country office with its country', async () => {
    const row = { code: 'CO-KEN', division_name: 'Kenya Country Office', parent_code: null, is_country_office: 1, country_code: 'KEN' };
    const result = await svc.hydrateDivisionRow(row, {
      byCode: new Map(), reasons: new Map(), primaryCode: '', junctionData: new Map(),
    });
    expect(result.is_country_office).toBe(true);
    expect(result.country_code).toBe('KEN');
  });

  it('should resolve focal_name from parent via DB lookup when not in byCode', async () => {
    const row = {
      code: 'SUB',
      division_name: 'Sub Division',
      level_type: 'division',
      parent_code: 'PARENT',
      alias_of: null,
      focal_name: '',
      focal_email: null,
      responsible_name: '',
      responsible_email: null,
      m_and_e_name: '',
      m_and_e_email: null,
    };
    // chain.first for lookupParentAssignment
    chain.first
      .mockResolvedValueOnce({ parent_code: null, focal_name: 'Parent Focal', focal_email: 'fp@test.com' }) // focal lookup
      .mockResolvedValueOnce({ parent_code: null, responsible_name: '', responsible_email: null }) // responsible
      .mockResolvedValueOnce({ parent_code: null, m_and_e_name: '', m_and_e_email: null }); // m_and_e

    const result = await svc.hydrateDivisionRow(row, {
      byCode: new Map(),
      reasons: new Map(),
      primaryCode: '',
      junctionData: new Map(),
    });
    expect(result.focal_name).toBe('Parent Focal');
    expect(result.focal_inherited_from).toBe('PARENT');
  });
});
describe('fetchDivisionRows — focal team (D-20261106-09)', () => {
  beforeEach(() => { resetChain(); db.raw.mockClear(); });

  it('should name the focal persons from user_divisions on the canonical code, not a division column', async () => {
    await svc.fetchDivisionRows(['DCM']);
    const focalSql = db.raw.mock.calls.map(([sql]) => sql).filter((sql) => sql.includes('as focal_'));
    expect(focalSql).toHaveLength(2);
    focalSql.forEach((sql) => expect(sql).toContain('ud.division_code = COALESCE(d.alias_of, d.code)'));
    expect(db.raw).toHaveBeenCalledWith(expect.stringContaining('as focal_name'), ['FOCAL_PERSON']);
    expect(chain.leftJoin).not.toHaveBeenCalledWith('users as fu', 'd.focal_user_id', 'fu.id');
  });
});
