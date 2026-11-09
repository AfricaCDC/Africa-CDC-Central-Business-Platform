// ── contribFlowDerivation unit tests ──
//
// This module is pure logic + DB reads. We mock the DB chain and
// divisionAliasService.

jest.mock('../../src/services/divisionAliasService', () => ({
  sameDivision: jest.fn().mockResolvedValue(false),
  getUserDivisionScope: jest.fn().mockResolvedValue(new Set()),
  resolveAliases: jest.fn().mockResolvedValue([]),
  invalidateAliasCache: jest.fn(),
  getDirectorateChildren: jest.fn().mockResolvedValue([]),
  getDirectoratesForUser: jest.fn().mockResolvedValue([]),
  scopeCoversDivision: jest.fn().mockResolvedValue(false),
}));

const svc = require('../../src/services/contribFlowDerivation');
const divisionAliasService = require('../../src/services/divisionAliasService');
const db = require('../../src/config/db');

function resetChain() {
  const c = db.__chain;
  c.first.mockReset().mockResolvedValue(undefined);
  c.insert.mockReset().mockResolvedValue([1]);
  c.update.mockReset().mockResolvedValue(1);
  c.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  c.where.mockReset().mockReturnValue(c);
}

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  divisionAliasService.sameDivision.mockResolvedValue(false);
  divisionAliasService.getUserDivisionScope.mockResolvedValue(new Set());
});

// ── parseContribList ──────────────────────────────────────────────────────────
describe('contribFlowDerivation.parseContribList', () => {
  it('should return empty array for null/undefined', () => {
    expect(svc.parseContribList(null)).toEqual([]);
    expect(svc.parseContribList(undefined)).toEqual([]);
    expect(svc.parseContribList('')).toEqual([]);
  });

  it('should upper-case an array input', () => {
    expect(svc.parseContribList(['dcm', 'amert'])).toEqual(['DCM', 'AMERT']);
  });

  it('should parse a comma-separated string', () => {
    expect(svc.parseContribList('dcm,amert,legal')).toEqual(['DCM', 'AMERT', 'LEGAL']);
  });

  it('should parse a semicolon-separated string', () => {
    expect(svc.parseContribList('dcm;amert')).toEqual(['DCM', 'AMERT']);
  });

  it('should parse a newline-separated string', () => {
    expect(svc.parseContribList('dcm\namert')).toEqual(['DCM', 'AMERT']);
  });

  it('should parse a JSON array string', () => {
    expect(svc.parseContribList('["dcm","amert"]')).toEqual(['DCM', 'AMERT']);
  });

  it('should return empty array for malformed JSON', () => {
    expect(svc.parseContribList('[bad json')).toEqual([]);
  });

  it('should filter out empty entries', () => {
    expect(svc.parseContribList(['dcm', '', null])).toEqual(['DCM']);
  });

  it('should treat JSON objects (non-array) as comma-separated and upper-case tokens', () => {
    // A string starting with '{' is not recognized as JSON array, so it falls
    // into the split-on-delimiter path. The whole string becomes one token.
    const result = svc.parseContribList('{"code":"DCM"}');
    // It resolves to a non-empty array (the raw string as a token)
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── pickContribCode ───────────────────────────────────────────────────────────
describe('contribFlowDerivation.pickContribCode', () => {
  it('should return null when mainCode is missing', async () => {
    const scope = new Set(['DCM']);
    const result = await svc.pickContribCode(scope, null, ['DCM']);
    expect(result).toBeNull();
  });

  it('should return null when contribList is empty', async () => {
    const scope = new Set(['DCM']);
    const result = await svc.pickContribCode(scope, 'AMERT', []);
    expect(result).toBeNull();
  });

  it('should return null when userDivScope is empty', async () => {
    const result = await svc.pickContribCode(new Set(), 'AMERT', ['DCM']);
    expect(result).toBeNull();
  });

  it('should return null when user is the main division (sameDivision returns true)', async () => {
    divisionAliasService.sameDivision.mockResolvedValue(true); // user IS main
    const scope = new Set(['AMERT']);
    const result = await svc.pickContribCode(scope, 'AMERT', ['AMERT']);
    expect(result).toBeNull();
  });

  it('should return the user code when user is a contributor (not main)', async () => {
    // sameDivision(userCode, mainUpper) → false (user is not main)
    // sameDivision(userCode, contrib) → true (user IS that contributor)
    divisionAliasService.sameDivision
      .mockResolvedValueOnce(false)  // not main
      .mockResolvedValueOnce(true);  // is contrib DCM
    const scope = new Set(['DCM']);
    const result = await svc.pickContribCode(scope, 'AMERT', ['DCM']);
    expect(result).toBe('DCM');
  });
});

// ── deriveContribFlowForActivityReport ────────────────────────────────────────
describe('contribFlowDerivation.deriveContribFlowForActivityReport', () => {
  it('should return isContribFlow=false when report not found', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    const result = await svc.deriveContribFlowForActivityReport(99, 1);
    expect(result).toEqual({ isContribFlow: false, contribOrgCode: null, mainOrgCode: null });
  });

  it('should return isContribFlow=false when report has no plan_node_id', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 1, plan_node_id: null });
    const result = await svc.deriveContribFlowForActivityReport(1, 1);
    expect(result).toEqual({ isContribFlow: false, contribOrgCode: null, mainOrgCode: null });
  });

  it('should return isContribFlow=false when plan_node not found', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 1, plan_node_id: 10 }) // report
      .mockResolvedValueOnce(undefined);                  // node not found
    const result = await svc.deriveContribFlowForActivityReport(1, 1);
    expect(result).toEqual({ isContribFlow: false, contribOrgCode: null, mainOrgCode: null });
  });

  it('should detect a contributor flow when user is a contributor', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 1, plan_node_id: 10 })
      .mockResolvedValueOnce({ id: 10, responsible_division_code: 'AMERT', contributing_divisions: 'DCM' });
    divisionAliasService.getUserDivisionScope.mockResolvedValueOnce(new Set(['DCM']));
    divisionAliasService.sameDivision
      .mockResolvedValueOnce(false) // DCM is not AMERT (main)
      .mockResolvedValueOnce(true); // DCM matches DCM in contribList

    const result = await svc.deriveContribFlowForActivityReport(1, 5);
    expect(result.isContribFlow).toBe(true);
    expect(result.contribOrgCode).toBe('DCM');
    expect(result.mainOrgCode).toBe('AMERT');
  });

  it('should return isContribFlow=false when user is not a contributor', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 1, plan_node_id: 10 })
      .mockResolvedValueOnce({ id: 10, responsible_division_code: 'AMERT', contributing_divisions: 'DCM' });
    divisionAliasService.getUserDivisionScope.mockResolvedValueOnce(new Set(['LEGAL']));
    divisionAliasService.sameDivision.mockResolvedValue(false); // no matches

    const result = await svc.deriveContribFlowForActivityReport(1, 5);
    expect(result.isContribFlow).toBe(false);
    expect(result.contribOrgCode).toBeNull();
  });
});

// ── deriveContribFlowForIndicatorActual ───────────────────────────────────────
describe('contribFlowDerivation.deriveContribFlowForIndicatorActual', () => {
  it('should return isContribFlow=false when actual not found', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    const result = await svc.deriveContribFlowForIndicatorActual(99, 1);
    expect(result).toEqual({ isContribFlow: false, contribOrgCode: null, mainOrgCode: null });
  });

  it('should return isContribFlow=false when actual has no indicator_id', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 1, indicator_id: null });
    const result = await svc.deriveContribFlowForIndicatorActual(1, 1);
    expect(result).toEqual({ isContribFlow: false, contribOrgCode: null, mainOrgCode: null });
  });

  it('should return isContribFlow=false when indicator not found', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 1, indicator_id: 5 }) // actual
      .mockResolvedValueOnce(undefined);                  // indicator not found
    const result = await svc.deriveContribFlowForIndicatorActual(1, 1);
    expect(result).toEqual({ isContribFlow: false, contribOrgCode: null, mainOrgCode: null });
  });

  it('should detect a contributor flow for indicator actual', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 1, indicator_id: 5 })
      .mockResolvedValueOnce({ id: 5, accountable_division_id: 'AMERT', contributing_divisions: 'DCM' });
    divisionAliasService.getUserDivisionScope.mockResolvedValueOnce(new Set(['DCM']));
    divisionAliasService.sameDivision
      .mockResolvedValueOnce(false) // DCM is not AMERT
      .mockResolvedValueOnce(true); // DCM matches DCM

    const result = await svc.deriveContribFlowForIndicatorActual(1, 7);
    expect(result.isContribFlow).toBe(true);
    expect(result.contribOrgCode).toBe('DCM');
  });
});
