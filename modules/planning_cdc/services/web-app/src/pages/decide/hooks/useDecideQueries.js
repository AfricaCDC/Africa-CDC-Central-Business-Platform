import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { decideApi } from '@/services/decide.api';

const KEY = 'decide';

/**
 * One approval step: what it is about and whether the caller can decide it.
 * Always fresh: somebody else may have decided it since the email.
 *
 * @param {number|string} stepId
 * @returns {import('@tanstack/react-query').UseQueryResult<object>}
 * @example const { data: step } = useApprovalStep(311);
 */
export function useApprovalStep(stepId) {
  return useQuery({
    queryKey: [KEY, 'step', String(stepId)],
    queryFn: async () => (await decideApi.step(stepId)).data,
    staleTime: 0,
    enabled: !!stepId,
    retry: false,
  });
}

/**
 * Approve or reject the step's item, then refresh the step and the review queues.
 *
 * @returns {import('@tanstack/react-query').UseMutationResult}
 * @example useDecideStep().mutate({ entityType, entityId, decision: 'approve' });
 */
export function useDecideStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args) => decideApi.decide(args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, 'step'] });
      // Review Submissions queues and counters all key on 'review-…'.
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('review-') });
      qc.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}
