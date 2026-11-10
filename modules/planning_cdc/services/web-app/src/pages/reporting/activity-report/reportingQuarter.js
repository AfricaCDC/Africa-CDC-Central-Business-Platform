import { STATUSES } from '@rbm/lib/enums';

export const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

/** Calendar quarter of today, the last fallback. */
export const calendarQuarter = () => 'Q' + (Math.floor(new Date().getMonth() / 3) + 1);

/**
 * The OPEN reporting period of a fiscal year, if any.
 *
 * @param {Array<{quarter: string, fiscal_year: string|number, status: string}>} periods
 * @param {string} fiscalYear
 * @returns {object|null}
 * @example openPeriodFor(periods, '2026'); // { quarter: 'Q3', end_date: '2026-10-30', ... }
 */
export function openPeriodFor(periods, fiscalYear) {
  return (periods || []).find((p) => String(p.fiscal_year) === String(fiscalYear) && p.status === STATUSES.OPEN) || null;
}

/**
 * Fiscal year of the reporting period being collected: the year of the OPEN
 * period (the oldest when several are open), else `fallback`. In January the
 * Q4 window of the previous year is still open, so the clock is not enough.
 *
 * @param {Array<{fiscal_year: string|number, status: string, end_date?: string}>} periods
 * @param {string|number} fallback - used when no period is open
 * @returns {string}
 * @example openReportingYear([{ quarter: 'Q4', fiscal_year: 2026, status: 'OPEN' }], 2027); // '2026'
 */
export function openReportingYear(periods, fallback) {
  const open = (periods || [])
    .filter((p) => p.status === STATUSES.OPEN)
    .sort((a, b) => String(a.end_date || '').localeCompare(String(b.end_date || '')));
  return String(open.length ? open[0].fiscal_year : fallback);
}

/**
 * In-app path of a quarterly indicator report, with its quarter, unit and year.
 *
 * @param {number|string} indicatorId
 * @param {{ quarter?: string, division?: string, fiscalYear?: string|number }} [opts]
 * @returns {string}
 * @example quarterlyReportPath(41, { quarter: 'Q4', division: 'SDI', fiscalYear: '2026' }); // '/quarterly-report/41?q=Q4&division=SDI&fy=2026'
 */
export function quarterlyReportPath(indicatorId, { quarter, division, fiscalYear } = {}) {
  const params = [
    quarter && `q=${encodeURIComponent(quarter)}`,
    division && `division=${encodeURIComponent(division)}`,
    fiscalYear && `fy=${encodeURIComponent(fiscalYear)}`,
  ].filter(Boolean);
  return `/quarterly-report/${indicatorId}?${params.join('&')}`;
}

/**
 * Quarter an activity report is shown or written for: `?q=` when valid, else
 * the OPEN reporting period of the year, else the calendar quarter. The open
 * period wins over the calendar because a window runs past its quarter (the
 * Q3 window closes on 30 October).
 *
 * @param {string|null} urlQuarter
 * @param {Array<object>} periods
 * @param {string} fiscalYear
 * @returns {string}
 * @example resolveQuarter(null, [{ quarter: 'Q3', fiscal_year: '2026', status: 'OPEN' }], '2026'); // 'Q3'
 */
export function resolveQuarter(urlQuarter, periods, fiscalYear) {
  if (QUARTERS.includes(urlQuarter)) return urlQuarter;
  return openPeriodFor(periods, fiscalYear)?.quarter || calendarQuarter();
}
