import { describe, it, expect } from 'vitest';
import { openReportingYear, quarterlyReportPath, resolveQuarter } from '../reportingQuarter';

const P = (quarter, fiscal_year, status, end_date) => ({ quarter, fiscal_year, status, end_date });

describe('openReportingYear', () => {
  it('should give the year of last year\'s Q4 while its window is open in January', () => {
    expect(openReportingYear([P('Q4', 2026, 'OPEN', '2027-01-30'), P('Q3', 2026, 'CLOSED', '2026-10-30')], 2027)).toBe('2026');
  });

  it('should take the oldest open period when two are open', () => {
    expect(openReportingYear([P('Q1', '2027', 'OPEN', '2027-04-30'), P('Q4', '2026', 'OPEN', '2027-01-30')], 2027)).toBe('2026');
  });

  it('should fall back when no period is open', () => {
    expect(openReportingYear([P('Q3', 2026, 'CLOSED', '2026-10-30')], 2027)).toBe('2027');
    expect(openReportingYear(undefined, 2026)).toBe('2026');
  });
});

describe('quarterlyReportPath', () => {
  it('should carry the quarter, the unit and the year', () => {
    expect(quarterlyReportPath(41, { quarter: 'Q4', division: 'SDI', fiscalYear: 2026 })).toBe('/quarterly-report/41?q=Q4&division=SDI&fy=2026');
  });

  it('should leave out what is not known', () => {
    expect(quarterlyReportPath(41, { quarter: 'Q2' })).toBe('/quarterly-report/41?q=Q2');
  });
});

describe('resolveQuarter', () => {
  it('should prefer the open period of the year over the calendar', () => {
    expect(resolveQuarter(null, [P('Q4', '2026', 'OPEN')], '2026')).toBe('Q4');
    expect(resolveQuarter('Q2', [P('Q4', '2026', 'OPEN')], '2026')).toBe('Q2');
  });
});
