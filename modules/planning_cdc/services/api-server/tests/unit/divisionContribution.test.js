// ── divisionContribution unit tests ──

jest.mock('../../src/services/divisionAliasService', () => ({
  sameDivision: jest.fn().mockResolvedValue(false),
  getDirectorateChildren: jest.fn().mockResolvedValue([]),
}));

const svc = require('../../src/services/reporting/divisionContribution');
const { sameDivision, getDirectorateChildren } = require('../../src/services/divisionAliasService');
const db = require('../../src/config/db');

function resetChain() {
  const c = db.__chain;
  c.first.mockReset().mockResolvedValue(undefined);
  c.insert.mockReset().mockResolvedValue([1]);
  c.update.mockReset().mockResolvedValue(1);
  c.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  c.where.mockReset().mockReturnValue(c);
  c.select.mockReset().mockReturnValue(c);
}

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  sameDivision.mockResolvedValue(false);
  getDirectorateChildren.mockResolvedValue([]);
});

// ── isOwnerDivision ───────────────────────────────────────────────────────────
describe('divisionContribution.isOwnerDivision', () => {
  it('should return false when planNodeId is null', async () => {
    const result = await svc.isOwnerDivision(null, 'DCM');
    expect(result).toBe(false);
  });

  it('should return false when divisionCode is null', async () => {
    const result = await svc.isOwnerDivision(1, null);
    expect(result).toBe(false);
  });

  it('should return false when plan_node has no responsible_division_code', async () => {
    db.__chain.first.mockResolvedValueOnce({ responsible_division_code: null });
    const result = await svc.isOwnerDivision(1, 'DCM');
    expect(result).toBe(false);
  });

  it('should return false when plan_node is not found', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    const result = await svc.isOwnerDivision(1, 'DCM');
    expect(result).toBe(false);
  });

  it('should return true when sameDivision returns true', async () => {
    db.__chain.first.mockResolvedValueOnce({ responsible_division_code: 'DCM' });
    sameDivision.mockResolvedValueOnce(true);
    const result = await svc.isOwnerDivision(1, 'DCM');
    expect(result).toBe(true);
  });

  it('should return false when sameDivision returns false', async () => {
    db.__chain.first.mockResolvedValueOnce({ responsible_division_code: 'AMERT' });
    sameDivision.mockResolvedValueOnce(false);
    const result = await svc.isOwnerDivision(1, 'DCM');
    expect(result).toBe(false);
  });
});

// ── isContributorDivision ─────────────────────────────────────────────────────
describe('divisionContribution.isContributorDivision', () => {
  it('should return false when planNodeId is null', async () => {
    const result = await svc.isContributorDivision(null, 'DCM');
    expect(result).toBe(false);
  });

  it('should return false when no contributing_divisions exist', async () => {
    db.__chain.first.mockResolvedValueOnce({ contributing_divisions: null });
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    const result = await svc.isContributorDivision(1, 'DCM');
    expect(result).toBe(false);
  });

  it('should return true when division is in contributing_divisions JSON', async () => {
    db.__chain.first.mockResolvedValueOnce({ contributing_divisions: '["DCM","AMERT"]' });
    sameDivision.mockResolvedValueOnce(true); // DCM matches
    const result = await svc.isContributorDivision(1, 'DCM');
    expect(result).toBe(true);
  });
});

// ── getReportRole ─────────────────────────────────────────────────────────────
describe('divisionContribution.getReportRole', () => {
  it('should return OWNER when division is the responsible division', async () => {
    // isOwnerDivision: true
    db.__chain.first.mockResolvedValueOnce({ responsible_division_code: 'DCM' });
    sameDivision.mockResolvedValueOnce(true);
    const result = await svc.getReportRole(1, 'DCM');
    expect(result).toBe('OWNER');
  });

  it('should return null when division has no relation to the indicator', async () => {
    // isOwnerDivision: false (no match)
    db.__chain.first.mockResolvedValueOnce({ responsible_division_code: 'AMERT' });
    sameDivision.mockResolvedValueOnce(false); // isOwnerDivision
    // isContributorDivision: no contributing_divisions, no specific activities
    db.__chain.first.mockResolvedValueOnce({ contributing_divisions: null });
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r)); // specific activities

    const result = await svc.getReportRole(1, 'DCM');
    expect(result).toBeNull();
  });

  it('should return CONTRIB when division is a contributor but not owner', async () => {
    // isOwnerDivision: false
    db.__chain.first.mockResolvedValueOnce({ responsible_division_code: 'AMERT' });
    sameDivision.mockResolvedValueOnce(false); // isOwnerDivision

    // isContributorDivision: listed
    db.__chain.first
      .mockResolvedValueOnce({ contributing_divisions: '["DCM"]' })
      // isCoveredByOwner
      .mockResolvedValueOnce({ responsible_division_code: 'AMERT' });
    sameDivision
      .mockResolvedValueOnce(true)  // DCM matches in contributor list
      .mockResolvedValueOnce(false); // AMERT != DCM (not covered by owner)
    getDirectorateChildren.mockResolvedValueOnce(['AMERT']); // ownerSubtree
    getDirectorateChildren.mockResolvedValueOnce(['DCM']);   // contribSubtree

    const result = await svc.getReportRole(1, 'DCM');
    expect(result).toBe('CONTRIB');
  });
});

// ── isCoveredByOwner ──────────────────────────────────────────────────────────
describe('divisionContribution.isCoveredByOwner', () => {
  it('should return false when plan_node is not found', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    const result = await svc.isCoveredByOwner(1, 'DCM');
    expect(result).toBe(false);
  });

  it('should return false when divisionCode equals ownerCode (it IS the owner)', async () => {
    db.__chain.first.mockResolvedValueOnce({ responsible_division_code: 'DCM' });
    sameDivision.mockResolvedValueOnce(true); // same division = it IS the owner
    const result = await svc.isCoveredByOwner(1, 'DCM');
    expect(result).toBe(false);
  });

  it('should return true when divisionCode is in ownerSubtree', async () => {
    db.__chain.first.mockResolvedValueOnce({ responsible_division_code: 'AMERT' });
    sameDivision.mockResolvedValueOnce(false); // DCM != AMERT (not same)
    getDirectorateChildren
      .mockResolvedValueOnce(['DCM', 'AMERT']) // ownerSubtree includes DCM
      .mockResolvedValueOnce([]);              // contribSubtree
    const result = await svc.isCoveredByOwner(1, 'DCM');
    expect(result).toBe(true);
  });
});
