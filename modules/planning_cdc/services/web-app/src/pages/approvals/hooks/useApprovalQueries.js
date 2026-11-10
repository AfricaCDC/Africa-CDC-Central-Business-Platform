import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { approvalsApi } from '../../../services/approvals.api';

const INBOX_KEY = ['approvals', 'inbox'];
const HISTORY_KEY = (entityType, entityId) => ['approvals', 'history', entityType, entityId];

const STALE_INBOX = 2 * 60 * 1000;
const STALE_HISTORY = 60 * 1000;

/**
 * Paginated approval inbox. `queryPayload` is produced by
 * `useApprovalInboxFilters` — already shaped for the API.
 *
 * @param {object} queryPayload
 * @returns {import('@tanstack/react-query').UseQueryResult}
 * @example
 * const { data } = useApprovalInbox({ page: 1, pageSize: 15 });
 */
export function useApprovalInbox(queryPayload) {
  return useQuery({
    queryKey: [...INBOX_KEY, queryPayload],
    queryFn: () => approvalsApi.inbox(queryPayload).then((r) => r.data),
    placeholderData: keepPreviousData,
    staleTime: STALE_INBOX,
  });
}

/**
 * Approval history for a single report. Disabled until both ids are present.
 *
 * @param {string} entityType
 * @param {string|number} entityId
 * @returns {import('@tanstack/react-query').UseQueryResult}
 * @example
 * const { data } = useApprovalHistory('ACTIVITY_REPORT', 42);
 */
export function useApprovalHistory(entityType, entityId) {
  return useQuery({
    queryKey: HISTORY_KEY(entityType, entityId),
    queryFn: () => approvalsApi.history(entityType, entityId).then((r) => r.data),
    enabled: Boolean(entityType) && Boolean(entityId),
    staleTime: STALE_HISTORY,
  });
}

/**
 * Approve a pending step. Invalidates inbox + the related history cache.
 *
 * @param {{ stepId: string|number, entityType?: string, entityId?: string|number }} args
 * @returns {import('@tanstack/react-query').UseMutationResult}
 * @example
 * const mutation = useApproveStep({ stepId: 7, entityType: 'ACTIVITY_REPORT', entityId: 42 });
 */
export function useApproveStep({ stepId, entityType, entityId }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => approvalsApi.approveStep(stepId, payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INBOX_KEY });
      if (entityType && entityId) {
        queryClient.invalidateQueries({ queryKey: HISTORY_KEY(entityType, entityId) });
      }
    },
  });
}

/**
 * Reject a pending step. `reason` is required per spec §2.
 *
 * @param {{ stepId: string|number, entityType?: string, entityId?: string|number }} args
 * @returns {import('@tanstack/react-query').UseMutationResult}
 * @example
 * const mutation = useRejectStep({ stepId: 7, entityType: 'ACTIVITY_REPORT', entityId: 42 });
 */
export function useRejectStep({ stepId, entityType, entityId }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => approvalsApi.rejectStep(stepId, payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INBOX_KEY });
      if (entityType && entityId) {
        queryClient.invalidateQueries({ queryKey: HISTORY_KEY(entityType, entityId) });
      }
    },
  });
}

/**
 * Admin bypass — short-circuit to APPROVED_FINAL.
 *
 * @param {{ instanceId: string|number, entityType?: string, entityId?: string|number }} args
 * @returns {import('@tanstack/react-query').UseMutationResult}
 * @example
 * const mutation = useAdminBypass({ instanceId: 99 });
 */
export function useAdminBypass({ instanceId, entityType, entityId }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => approvalsApi.adminBypass(instanceId, payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INBOX_KEY });
      if (entityType && entityId) {
        queryClient.invalidateQueries({ queryKey: HISTORY_KEY(entityType, entityId) });
      }
    },
  });
}
