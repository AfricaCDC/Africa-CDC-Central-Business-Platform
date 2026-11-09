import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { adoptionApi } from '@/services/adoption.api';

/**
 * One page of the adoption list with the summary (list data: 2 minutes).
 *
 * @param {{ filter?: string, q?: string, unit?: string, page?: number }} queryPayload
 * @returns {import('@tanstack/react-query').UseQueryResult<{ summary: object, rows: object[], total: number, page: number, page_size: number, recent_days: number }>}
 * @example const { data } = useAdoption({ filter: 'NO_TOUR', page: 1 });
 */
export function useAdoption(queryPayload) {
  return useQuery({
    queryKey: ['admin', 'adoption', queryPayload],
    queryFn: async () => (await adoptionApi.get(queryPayload)).data,
    placeholderData: keepPreviousData,
    staleTime: 2 * 60_000,
  });
}
