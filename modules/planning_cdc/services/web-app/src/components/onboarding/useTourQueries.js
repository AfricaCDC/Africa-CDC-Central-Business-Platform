import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tourApi } from '@/services/tour.api';

const KEY = ['me', 'tour'];

/**
 * The last tour version the user finished or skipped (null = never).
 *
 * @param {boolean} enabled - only once signed in
 * @returns {import('@tanstack/react-query').UseQueryResult<string|null>}
 * @example const { data: seen, isSuccess } = useTourSeen(!!user);
 */
export function useTourSeen(enabled) {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await tourApi.get()).data.seen_version,
    enabled,
    staleTime: 60 * 60_000,
    retry: false,
  });
}

/**
 * Record the tour version and how the tour ended (TOUR_OUTCOMES).
 *
 * @returns {import('@tanstack/react-query').UseMutationResult}
 * @example useSaveTourSeen().mutate({ version: '1.3', outcome: TOUR_OUTCOMES.FINISHED });
 */
export function useSaveTourSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ version, outcome }) => tourApi.save(version, outcome),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
