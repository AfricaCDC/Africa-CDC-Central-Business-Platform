import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { dataHealthApi } from '@/services/dataHealth.api';

/**
 * The data health checks of one plan year (dashboard data: 5 minutes).
 *
 * @param {string} fiscalYear
 * @returns {import('@tanstack/react-query').UseQueryResult<{ fiscal_year: string, checks: object[] }>}
 * @example const { data } = useDataHealth('2027');
 */
export function useDataHealth(fiscalYear) {
  return useQuery({
    queryKey: ['data-health', fiscalYear],
    queryFn: async () => (await dataHealthApi.get(fiscalYear)).data,
    enabled: !!fiscalYear,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}
