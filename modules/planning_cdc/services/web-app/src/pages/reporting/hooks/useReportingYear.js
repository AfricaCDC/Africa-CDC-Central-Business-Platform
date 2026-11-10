import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePlanningYear } from '@/contexts/PlanningYearContext';
import { openReportingYear } from '../activity-report/reportingQuarter';

const YEAR_RE = /^\d{4}$/;

/**
 * Fiscal year a reporting page shows and writes (D-20261106-01): the `?fy=`
 * of the URL when there is one (the year selector writes it), else the year
 * of the open reporting period, never the clock alone (a Q4 report written
 * in January belongs to the previous year). That year is pinned into the URL
 * so the year selector shows the same year as the page; a year the selector
 * does not know (no plan) is not pinned, the selected year is kept.
 *
 * @param {object[]} periods - reporting periods
 * @param {boolean} isPeriodsLoading
 * @returns {{ fiscalYear: string, isResolvingYear: boolean }}
 * @example const { fiscalYear } = useReportingYear(periods, periodsLoading);
 */
export function useReportingYear(periods, isPeriodsLoading) {
  const { planningYear, years = [], isLoading: isYearsLoading } = usePlanningYear();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasUrlYear = YEAR_RE.test(searchParams.get('fy') || '');
  const openYear = openReportingYear(periods, new Date().getFullYear());
  const target = years.includes(openYear) ? openYear : String(planningYear);
  const isResolvingYear = !hasUrlYear && (isPeriodsLoading || isYearsLoading);

  useEffect(() => {
    if (hasUrlYear || isResolvingYear) return;
    const next = new URLSearchParams(searchParams);
    next.set('fy', target);
    setSearchParams(next, { replace: true });
  }, [hasUrlYear, isResolvingYear, target, searchParams, setSearchParams]);

  return { fiscalYear: hasUrlYear ? String(planningYear) : target, isResolvingYear };
}
