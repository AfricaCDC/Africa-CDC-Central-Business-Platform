import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { indicatorMappingApi } from '@/services/indicatorMapping.api';

const KEY = 'indicator-mapping';
const STALE = 2 * 60_000;

/**
 * Activities of a year (broad or specific) with their linked indicator ids.
 *
 * @param {{ fiscal_year: string, node_type: string }} params
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 * @example const { data } = useMappingActivities({ fiscal_year: '2026', node_type: 'BROAD_ACTIVITY' });
 */
export function useMappingActivities(params) {
  return useQuery({
    queryKey: [KEY, 'list', params],
    queryFn: async () => (await indicatorMappingApi.list(params)).data,
    staleTime: STALE,
    placeholderData: keepPreviousData,
    enabled: !!params.fiscal_year && !!params.node_type,
  });
}

/**
 * Replace the indicators of one activity; refreshes the lists and the indicator pages.
 *
 * @returns {import('@tanstack/react-query').UseMutationResult}
 * @example useSetIndicatorLinks().mutateAsync({ id: 68, indicatorIds: [412] });
 */
export function useSetIndicatorLinks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, indicatorIds }) => (await indicatorMappingApi.setLinks(id, indicatorIds)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['plan-nodes'] });
    },
  });
}
