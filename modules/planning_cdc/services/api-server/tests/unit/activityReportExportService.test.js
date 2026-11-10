/* eslint-disable no-restricted-syntax --
 * String literals ("Division", "Q3", …) are CSV column-header labels and
 * report fixtures, not ENTITY_TYPES references (CHARTER §11). */
// ── activityReportExportService — row mapping + scope filter unit tests ──
//
// buildActivityReportRows runs one joined query on activity_reports (the reports
// written on specific activities, D-20261013-02) and maps each row to the export
// shape. config/db is mocked with a chainable builder that records the clauses
// and resolves a fixture, so filters and cell mapping are asserted
// deterministically.

jest.mock('../../src/config/db', () => {
  const builder = {
    __rows: [],
    __calls: [],
  };
  for (const m of ['join', 'leftJoin', 'innerJoin', 'select', 'orderBy', 'where', 'whereIn']) {
    builder[m] = jest.fn((...args) => { builder.__calls.push([m, ...args]); return builder; });
  }
  builder.then = (resolve, reject) => Promise.resolve(builder.__rows).then(resolve, reject);
  const db = jest.fn(() => builder);
  db.raw = jest.fn((sql) => ({ __raw: sql }));
  db.__builder = builder;
  return db;
});

const db = require('../../src/config/db');
const {
  buildActivityReportRows,
  ACTIVITY_REPORT_HEADERS,
} = require('../../src/services/reporting/activityReportExportService');

const FIXTURE = [
  {
    fiscal_year: '2026', quarter: 'Q3', status: 'SUBMITTED', mission_type: 'EVENT',
    start_date: '2026-09-01T00:00:00.000Z', end_date: '2026-09-03T00:00:00.000Z',
    location: 'Addis Ababa', participants_count: 40, objectives: 'Train',
    achievements: 'Trained 40', narrative: 'old text', challenges: 'Late funds',
    lessons_learned: 'Plan earlier', next_steps: 'Scale up', findings_recommendations: 'More',
    actual_spend: 1200.5, total_budget: 2000, submitted_at: '2026-10-10T09:30:00.000Z',
    approved_at: null, rejection_reason: null,
    sa_code: '3.1.1.01.02', sa_title: 'Member State meetings', responsible_division_code: 'APPM',
    ba_code: '3.1.1.01', ba_title: 'Operationalise APPM',
    division_name: 'African Pooled Procurement Mechanism',
    first_name: 'Yared', last_name: 'Z', email: 'y@x.org',
  },
  {
    fiscal_year: '2026', quarter: 'Q3', status: 'DRAFT', mission_type: null,
    start_date: null, end_date: null, location: null, participants_count: null, objectives: null,
    achievements: null, narrative: 'only narrative', challenges: null, lessons_learned: null,
    next_steps: null, findings_recommendations: null, actual_spend: null, total_budget: null,
    submitted_at: null, approved_at: null, rejection_reason: null,
    sa_code: 'X.1', sa_title: null, responsible_division_code: 'EPR',
    ba_code: null, ba_title: null, division_name: null,
    first_name: null, last_name: null, email: 'e@x.org',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  db.__builder.__rows = FIXTURE;
  db.__builder.__calls = [];
});

describe('buildActivityReportRows', () => {
  it('should read activity_reports, not the legacy division_activity_reports', async () => {
    await buildActivityReportRows({ fiscalYear: '2026' });
    expect(db).toHaveBeenCalledWith('activity_reports as ar');
    expect(db).not.toHaveBeenCalledWith(expect.stringContaining('division_activity_reports'));
  });

  it('should map each report to the export shape', async () => {
    const rows = await buildActivityReportRows({ fiscalYear: '2026' });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      'Fiscal year': '2026',
      'Quarter': 'Q3',
      'Division': 'African Pooled Procurement Mechanism',
      'Broad activity': '3.1.1.01 — Operationalise APPM',
      'Specific activity': '3.1.1.01.02 — Member State meetings',
      'Reported by': 'Yared Z',
      'Status': 'SUBMITTED',
      'Start date': '2026-09-01',
      'Participants': 40,
      'Achievements': 'Trained 40',
      'Actual spend': 1200.5,
      'Submitted at': '2026-10-10 09:30',
      'Approved at': '',
    });
  });

  it('should fall back to code, email and narrative when fields are empty', async () => {
    const rows = await buildActivityReportRows({ fiscalYear: '2026' });
    expect(rows[1]).toMatchObject({
      'Division': 'EPR',
      'Broad activity': '',
      'Specific activity': 'X.1',
      'Reported by': 'e@x.org',
      'Achievements': 'only narrative',
      'Participants': '',
      'Start date': '',
    });
  });

  it('should flag a not-started activity with its expected start (D-20261013-08)', async () => {
    db.__builder.__rows = [{ ...FIXTURE[0], not_started: 1, expected_start_quarter: 'Q4', expected_start_year: '2026' }, FIXTURE[1]];
    const rows = await buildActivityReportRows({ fiscalYear: '2026' });
    expect(rows[0]['Not started (expected start)']).toBe('Yes (Q4 2026)');
    expect(rows[1]['Not started (expected start)']).toBe('');
  });

  it('should emit every header in order', async () => {
    const rows = await buildActivityReportRows({ fiscalYear: '2026' });
    expect(Object.keys(rows[0])).toEqual(ACTIVITY_REPORT_HEADERS);
  });

  it('should filter on fiscal year and upper-cased quarter', async () => {
    await buildActivityReportRows({ fiscalYear: '2026', quarter: 'q3' });
    const calls = db.__builder.__calls;
    expect(calls).toContainEqual(['where', 'ar.fiscal_year', '2026']);
    expect(calls).toContainEqual(['where', 'ar.quarter', 'Q3']);
  });

  it('should scope on the specific activity responsible division when divFilter is set', async () => {
    await buildActivityReportRows({ fiscalYear: '2026', divFilter: ['EPR'] });
    const scope = db.__builder.__calls.find((c) => c[0] === 'whereIn');
    expect(scope[1]).toEqual({ __raw: 'UPPER(sa.responsible_division_code)' });
    expect(scope[2]).toEqual(['EPR']);
  });

  it('should not scope when divFilter is empty', async () => {
    await buildActivityReportRows({ fiscalYear: '2026' });
    expect(db.__builder.__calls.some((c) => c[0] === 'whereIn')).toBe(false);
  });
});
