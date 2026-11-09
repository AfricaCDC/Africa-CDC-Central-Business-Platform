import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/services/dashboard.api';

/**
 * Specific activities by activity-report state (approved, in review, draft,
 * no report) for a year, optionally one business unit.
 *
 * @param {string} fiscalYear
 * @param {string} [division] - division or directorate code
 * @returns {import('@tanstack/react-query').UseQueryResult<{ total: number, approved: number, in_review: number, draft: number, not_reported: number, reported_pct: number|null }>}
 * @example const { data: progress } = useActivityProgress('2026', 'EPR');
 */
export function useActivityProgress(fiscalYear, division) {
  return useQuery({
    queryKey: ['dashboard', 'activity-progress', String(fiscalYear), division || ''],
    queryFn: async () => (await dashboardApi.activityProgress({ fiscal_year: String(fiscalYear), ...(division ? { division } : {}) })).data,
    enabled: !!fiscalYear,
    staleTime: 5 * 60_000,
  });
}
