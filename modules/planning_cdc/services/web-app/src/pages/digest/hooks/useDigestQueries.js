import { useQuery } from '@tanstack/react-query';
import { digestApi } from '@/services/digest.api';

/**
 * The directorates the user may read (reference data: 1 hour).
 *
 * @returns {import('@tanstack/react-query').UseQueryResult<Array<{ code: string, name: string }>>}
 * @example const { data: directorates = [] } = useDigestDirectorates();
 */
export function useDigestDirectorates() {
  return useQuery({
    queryKey: ['digest', 'directorates'],
    queryFn: async () => (await digestApi.directorates()).data,
    staleTime: 60 * 60_000,
  });
}

/**
 * The digest of one directorate (dashboard data: 5 minutes).
 *
 * @param {string|null} directorate
 * @returns {import('@tanstack/react-query').UseQueryResult<object>}
 * @example const { data } = useDigest('DSI');
 */
export function useDigest(directorate) {
  return useQuery({
    queryKey: ['digest', directorate],
    queryFn: async () => (await digestApi.get(directorate)).data,
    enabled: !!directorate,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
