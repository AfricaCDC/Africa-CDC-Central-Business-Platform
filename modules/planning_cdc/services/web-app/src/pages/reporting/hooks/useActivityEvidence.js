import { useQuery } from '@tanstack/react-query';
import { reportingApi } from '@/services/reporting.api';

/**
 * Approved activity reports of the quarter behind an indicator, for one
 * unit (D-20261105-12). Lists change as reports are approved: 2 minutes.
 *
 * @param {{ indicatorId: string|number, quarter: string, fiscalYear: string, divisionCode: string|null, enabled?: boolean }} q
 * @returns {import('@tanstack/react-query').UseQueryResult<Array<{ id: number, code: string, title: string, text: string, link: string }>>}
 * @example const { data: reports = [] } = useActivityEvidence({ indicatorId: 40, quarter: 'Q4', fiscalYear: '2026', divisionCode: 'EPR' });
 */
export function useActivityEvidence({ indicatorId, quarter, fiscalYear, divisionCode, enabled = true }) {
  return useQuery({
    queryKey: ['activity-evidence', String(indicatorId), quarter, fiscalYear, divisionCode],
    queryFn: async () => (await reportingApi.getActivityEvidence(indicatorId, { quarter, fiscalYear, divisionCode })).data,
    enabled: enabled && !!indicatorId && !!divisionCode,
    staleTime: 2 * 60_000,
  });
}
