// ── quarterlyDashboardService unit tests ──
//
// Tests: getQuarterlyDashboard — period resolution, empty result, division aggregation

jest.mock('../../src/services/reporting/periodsService', () => ({
  getActivePeriod: jest.fn().mockResolvedValue(undefined),
}));

const svc = require('../../src/services/reporting/quarterlyDashboardService');
const { getActivePeriod } = require('../../src/services/reporting/periodsService');
const db = require('../../src/config/db');

// Add schema mock for db.schema.hasTable
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
  c.whereIn.mockReset().mockReturnValue(c);
  c.select.mockReset().mockReturnValue(c);
  c.orderBy.mockReset().mockReturnValue(c);
  c.leftJoin.mockReset().mockReturnValue(c);
  c.join.mockReset().mockReturnValue(c);
  if (c.andOn && c.andOn.mockReset) c.andOn.mockReset().mockReturnValue(c);
  db.schema.hasTable.mockResolvedValue(true);
}

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  getActivePeriod.mockResolvedValue(undefined);
  db.schema.hasTable.mockResolvedValue(true);
  db.raw = jest.fn().mockReturnValue('raw_expr');
});

// ── getQuarterlyDashboard ─────────────────────────────────────────────────────
describe('quarterlyDashboardService.getQuarterlyDashboard', () => {
  it('should return empty divisions when plan_node_active_periods table missing', async () => {
    db.schema.hasTable.mockResolvedValueOnce(false); // plan_node_active_periods missing
    getActivePeriod.mockResolvedValueOnce(undefined);
    // period fetch → undefined
    db.__chain.first.mockResolvedValueOnce(undefined);

    const result = await svc.getQuarterlyDashboard({});
    expect(result).toHaveProperty('period');
    expect(result).toHaveProperty('divisions');
    expect(result).toHaveProperty('summary');
    expect(result.divisions).toEqual([]);
    expect(result.summary.total_divisions).toBe(0);
  });

  it('should resolve active period when no filters given', async () => {
    const period = { id: 1, quarter: 'Q1', fiscal_year: 2026, status: 'OPEN' };
    getActivePeriod.mockResolvedValueOnce(period);
    db.schema.hasTable
      .mockResolvedValueOnce(true)  // plan_node_active_periods
      .mockResolvedValueOnce(true); // indicator_division_reports
    // rows query → empty
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));

    const result = await svc.getQuarterlyDashboard({});
    expect(result.period).toMatchObject({ id: 1, quarter: 'Q1' });
    expect(result.divisions).toEqual([]);
  });

  it('should fall back to latest period when no active period found', async () => {
    getActivePeriod.mockResolvedValueOnce(undefined);
    // fallback → latest period
    db.__chain.first.mockResolvedValueOnce({ id: 2, quarter: 'Q4', fiscal_year: 2025, status: 'CLOSED' });
    db.schema.hasTable
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));

    const result = await svc.getQuarterlyDashboard({});
    expect(result.period).toMatchObject({ id: 2, quarter: 'Q4' });
  });

  it('should query with provided fiscal_year and quarter filters', async () => {
    // When both fiscal_year+quarter given, skip active period lookup
    db.__chain.first.mockResolvedValueOnce({ id: 3, quarter: 'Q2', fiscal_year: 2026, status: 'OPEN' });
    db.schema.hasTable
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));

    const result = await svc.getQuarterlyDashboard({ fiscal_year: 2026, quarter: 'Q2' });
    expect(result).toHaveProperty('divisions');
  });

  it('should aggregate rows into division summary', async () => {
    getActivePeriod.mockResolvedValueOnce({ id: 1, quarter: 'Q1', fiscal_year: 2026, status: 'OPEN' });
    db.schema.hasTable
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    // Rows: DCM division with 2 indicators — one submitted, one draft
    const rows = [
      {
        indicator_id: 10, responsible_division_code: 'DCM', division_name: 'DCM', directorate: 'FMG',
        baseline_numeric: 0, quarter_target: 100,
        actual_id: 1, actual_status: 'SUBMITTED', actual_value: 90,
      },
      {
        indicator_id: 11, responsible_division_code: 'DCM', division_name: 'DCM', directorate: 'FMG',
        baseline_numeric: null, quarter_target: 50,
        actual_id: null, actual_status: null, actual_value: null,
      },
    ];
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));

    const result = await svc.getQuarterlyDashboard({});
    expect(result.divisions).toHaveLength(1);
    expect(result.divisions[0].code).toBe('DCM');
    expect(result.divisions[0].total_indicators).toBe(2);
    expect(result.divisions[0].reported_count).toBe(1);
    expect(result.summary.total_divisions).toBe(1);
  });

  it('should handle fully reported division (all submitted)', async () => {
    getActivePeriod.mockResolvedValueOnce({ id: 1, quarter: 'Q1', fiscal_year: 2026, status: 'OPEN' });
    db.schema.hasTable
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    const rows = [
      {
        indicator_id: 10, responsible_division_code: 'DCM', division_name: 'DCM', directorate: 'FMG',
        baseline_numeric: 0, quarter_target: 100,
        actual_id: 1, actual_status: 'VALIDATED', actual_value: 100,
      },
    ];
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));

    const result = await svc.getQuarterlyDashboard({});
    expect(result.divisions[0].status).toBe('fully_approved');
    expect(result.summary.fully_approved).toBe(1);
  });

  it('should handle indicators with missing targets (skip from count)', async () => {
    getActivePeriod.mockResolvedValueOnce({ id: 1, quarter: 'Q1', fiscal_year: 2026, status: 'OPEN' });
    db.schema.hasTable
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    // Row with null target AND no actual → should NOT appear as total_indicator
    const rows = [
      {
        indicator_id: 20, responsible_division_code: 'AMERT', division_name: 'AMERT', directorate: null,
        baseline_numeric: null, quarter_target: null,
        actual_id: null, actual_status: null, actual_value: null,
      },
    ];
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));

    const result = await svc.getQuarterlyDashboard({});
    // Division excluded because total_indicators = 0
    expect(result.divisions).toHaveLength(0);
  });

  it('should return null period when no period found', async () => {
    getActivePeriod.mockResolvedValueOnce(undefined);
    db.__chain.first.mockResolvedValueOnce(undefined); // no fallback period either
    db.schema.hasTable
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));

    const result = await svc.getQuarterlyDashboard({});
    expect(result.period).toBeNull();
  });
});
