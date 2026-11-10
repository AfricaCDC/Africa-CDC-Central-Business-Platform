import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { delegationsApi } from '@/services/delegations.api';

const KEY = 'delegations';

/**
 * The caller's delegations given and received that are not over yet.
 *
 * @returns {import('@tanstack/react-query').UseQueryResult<{ given: object[], received: object[] }>}
 * @example const { data } = useMyDelegations();
 */
export function useMyDelegations() {
  return useQuery({
    queryKey: [KEY, 'mine'],
    queryFn: async () => (await delegationsApi.mine()).data,
    staleTime: 60_000,
  });
}

/**
 * Active users the caller can delegate to (reference data: 1 hour).
 *
 * @returns {import('@tanstack/react-query').UseQueryResult<Array<{ id: number, name: string, email: string }>>}
 * @example const { data: users = [] } = useDelegateCandidates();
 */
export function useDelegateCandidates() {
  return useQuery({
    queryKey: [KEY, 'candidates'],
    queryFn: async () => (await delegationsApi.candidates()).data,
    staleTime: 60 * 60_000,
  });
}

/**
 * Create a delegation, then refresh the list.
 *
 * @returns {import('@tanstack/react-query').UseMutationResult}
 * @example useCreateDelegation().mutate({ delegate_id: 12, starts_on: '2026-11-10', ends_on: '2026-11-20' });
 */
export function useCreateDelegation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => delegationsApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, 'mine'] }),
  });
}

/**
 * End a delegation, then refresh the list.
 *
 * @returns {import('@tanstack/react-query').UseMutationResult}
 * @example useEndDelegation().mutate(3);
 */
export function useEndDelegation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => delegationsApi.end(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, 'mine'] }),
  });
}
