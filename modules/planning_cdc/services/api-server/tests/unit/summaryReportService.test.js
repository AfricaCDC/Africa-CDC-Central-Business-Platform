// ── summaryReportService — aggregation + KPI + export-row unit tests ──
//
// getDivisionQuarterlySummary fans out across several tables (division_codes,
// reporting_periods, plan_nodes [owned], indicator_division_reports [contrib],
// activity_reports). We mock config/db with a per-table builder so
// each query resolves its own fixture, letting us assert KPI maths, achievement
// computation, role tagging and activity resolution deterministically.

jest.mock('../../src/config/db', () => {
  function makeBuilder(rows) {
    const b = {};
    for (const m of ['leftJoin', 'join', 'innerJoin', 'select', 'orderBy', 'where', 'whereIn', 'whereRaw']) {
      b[m] = jest.fn(() => b);
    }
    b.first = jest.fn(() => Promise.resolve(rows[0]));
    b.then = (resolve, reject) => Promise.resolve(rows).then(resolve, reject);
    return b;
  }
  const db = jest.fn((table) => {
    const key = String(table).split(' ')[0];
    return makeBuilder(db.__fixtures[key] || []);
  });
  db.raw = jest.fn((sql) => ({ __raw: sql }));
  db.__fixtures = {};
  return db;
});

const db = require('../../src/config/db');
const {
  getDivisionQuarterlySummary,
  buildDivisionSummaryRows,
  SUMMARY_HEADERS,
} = require('../../src/services/reporting/summaryReportService');

function seed({ owned = [], contrib = [], activity = [], period = [], div = [] } = {}) {
  db.__fixtures = {
    division_codes: div,
    reporting_periods: period,
    plan_nodes: owned,
    indicator_division_reports: contrib,
    activity_reports: activity,
  };
}

const DIV = [{ code: 'MIS', division_name: 'Division of MIS', directorate: 'Directorate of Administration' }];
const PERIOD = [{ id: 1, quarter: 'Q1', fiscal_year: 2026, status: 'CLOSED', label: 'Q1 FY2026' }];

beforeEach(() => { jest.clearAllMocks(); });

describe('getDivisionQuarterlySummary', () => {
  it('computes KPIs and achievement from owned indicators', async () => {
    seed({
      div: DIV,
      period: PERIOD,
      owned: [
        { id: 10, code: 'MIS.1', title: 'A', tier_id: 3, quarter_target: 10, actual_value: 8, status: 'APPROVED', narrative: 'ok' },
        { id: 11, code: 'MIS.2', title: 'B', tier_id: 4, quarter_target: 5, actual_value: null, status: null, narrative: null },
      ],
    });
    const s = await getDivisionQuarterlySummary({ divisionCode: 'mis', fiscalYear: 2026, quarter: 'q1' });
    expect(s.division).toEqual({ code: 'MIS', name: 'Division of MIS', directorate: 'Directorate of Administration' });
    expect(s.period).toMatchObject({ id: 1, quarter: 'Q1', label: 'Q1 FY2026' });
    expect(s.kpis).toEqual({
      total_indicators: 2,
      reported_count: 1,
      approved_count: 1,
      completion_pct: 50,
      achievement_pct: 80,
    });
    // owned[0] reported APPROVED → achievement 8/10*100 = 80
    expect(s.indicators[0]).toMatchObject({ code: 'MIS.1', role: 'OWNER', actual_value: 8, achievement_pct: 80, status: 'APPROVED' });
    // owned[1] unreported → actual + achievement null
    expect(s.indicators[1]).toMatchObject({ code: 'MIS.2', role: 'OWNER', actual_value: null, achievement_pct: null, status: null });
  });

  it('appends CONTRIB reports tagged with role CONTRIB', async () => {
    seed({
      div: DIV, period: PERIOD,
      owned: [{ id: 10, code: 'MIS.1', title: 'A', tier_id: 3, quarter_target: 10, actual_value: 8, status: 'APPROVED' }],
      contrib: [{ id: 20, code: 'OTH.1', title: 'C', tier_id: 3, quarter_target: 4, actual_value: 2, status: 'SUBMITTED' }],
    });
    const s = await getDivisionQuarterlySummary({ divisionCode: 'MIS', fiscalYear: '2026', quarter: 'Q1' });
    expect(s.indicators).toHaveLength(2);
    const contrib = s.indicators.find((i) => i.role === 'CONTRIB');
    expect(contrib).toMatchObject({ code: 'OTH.1', actual_value: 2, achievement_pct: 50, status: 'SUBMITTED' });
    // CONTRIB does NOT inflate the owner KPI denominator
    expect(s.kpis.total_indicators).toBe(1);
  });

  it('returns null achievement when the quarter target is missing or zero', async () => {
    seed({
      div: DIV, period: PERIOD,
      owned: [{ id: 10, code: 'MIS.1', title: 'A', tier_id: 3, quarter_target: null, actual_value: 2000, status: 'APPROVED' }],
    });
    const s = await getDivisionQuarterlySummary({ divisionCode: 'MIS', fiscalYear: '2026', quarter: 'Q1' });
    expect(s.indicators[0].achievement_pct).toBeNull();
    expect(s.kpis.achievement_pct).toBeNull();
    // still counts as reported / approved
    expect(s.kpis).toMatchObject({ reported_count: 1, approved_count: 1, completion_pct: 100 });
  });

  it('lists the activity reports of the division for the quarter, past draft', async () => {
    seed({
      div: DIV, period: PERIOD, owned: [],
      activity: [{ id: 5, plan_node_id: 61, code: '1.2.3.01', title: 'Workshop', status: 'SUBMITTED', achievements: 'a', challenges: 'c' }],
    });
    const s = await getDivisionQuarterlySummary({ divisionCode: 'MIS', fiscalYear: '2026', quarter: 'Q1' });
    expect(s.activities).toEqual([expect.objectContaining({ id: 5, code: '1.2.3.01', achievements: 'a' })]);
    const reports = db.mock.results.find((r, i) => String(db.mock.calls[i][0]).startsWith('activity_reports')).value;
    expect(reports.where).toHaveBeenCalledWith({ 'p.responsible_division_code': 'MIS', 'r.fiscal_year': '2026', 'r.quarter': 'Q1' });
    expect(reports.whereIn).toHaveBeenCalledWith('r.status', ['SUBMITTED', 'IN_REVIEW', 'APPROVED']);
  });

  it('returns no activity report and falls back to the code when the division is unknown', async () => {
    seed({ div: [], period: [], owned: [], activity: [] });
    const s = await getDivisionQuarterlySummary({ divisionCode: 'ZZZ', fiscalYear: '2026', quarter: 'Q1' });
    expect(s.division).toEqual({ code: 'ZZZ', name: 'ZZZ', directorate: null });
    expect(s.period).toBeNull();
    expect(s.activities).toEqual([]);
    expect(s.kpis.total_indicators).toBe(0);
  });
});

describe('buildDivisionSummaryRows', () => {
  it('flattens indicators into rows keyed by the canonical headers', async () => {
    seed({
      div: DIV, period: PERIOD,
      owned: [{ id: 10, code: 'MIS.1', title: 'A', tier_id: 3, quarter_target: 10, actual_value: 8, status: 'APPROVED' }],
    });
    const rows = await buildDivisionSummaryRows({ divisionCode: 'MIS', fiscalYear: '2026', quarter: 'Q1' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      'Indicator code': 'MIS.1', Indicator: 'A', Tier: 3, Role: 'OWNER',
      'Quarter target': 10, Actual: 8, 'Achievement %': 80, Status: 'APPROVED',
    });
    expect(Object.keys(rows[0])).toEqual(SUMMARY_HEADERS);
  });

  it('renders unreported indicators with empty cells (no nulls)', async () => {
    seed({
      div: DIV, period: PERIOD,
      owned: [{ id: 11, code: 'MIS.2', title: 'B', tier_id: 4, quarter_target: 5, actual_value: null, status: null }],
    });
    const rows = await buildDivisionSummaryRows({ divisionCode: 'MIS', fiscalYear: '2026', quarter: 'Q1' });
    expect(rows[0]).toMatchObject({ Actual: '', 'Achievement %': '', Status: '' });
  });
});
