import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { governanceService } from '@/services/governanceService';

const NS = 'governance';
const STALE = 2 * 60_000; // inbox/drafts/notifications: 2 min per CHARTER §3

/**
 * Items pending the current user's review.
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 */
export function useGovernanceInbox() {
  return useQuery({
    queryKey: [NS, 'inbox'],
    queryFn: async () => (await governanceService.getInbox())?.data || [],
    staleTime: STALE,
  });
}

/**
 * The current user's draft governance artifacts.
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 */
export function useMyDrafts() {
  return useQuery({
    queryKey: [NS, 'my-drafts'],
    queryFn: async () => (await governanceService.getMyDrafts())?.data || [],
    staleTime: STALE,
  });
}

/**
 * Recent notifications (with unread count) for the current user.
 * @returns {import('@tanstack/react-query').UseQueryResult<{ data: object[], unread_count: number }>}
 */
export function useGovernanceNotifications() {
  return useQuery({
    queryKey: [NS, 'notifications'],
    queryFn: async () =>
      (await governanceService.getNotifications({ limit: 20 }))?.data || { data: [], unread_count: 0 },
    staleTime: STALE,
  });
}

/**
 * Mutations to mark one / all notifications read; both invalidate the
 * notifications query so the badge and list refresh.
 *
 * @returns {{ markRead: (id: number) => void, markAllRead: () => void }}
 */
export function useNotificationMutations() {
  const queryClient = useQueryClient();

  const markRead = useMutation({
    mutationFn: (id) => governanceService.markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [NS, 'notifications'] }),
  });
  const markAllRead = useMutation({
    mutationFn: () => governanceService.markAllNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [NS, 'notifications'] }),
  });

  return {
    markRead: markRead.mutate,
    markAllRead: markAllRead.mutate,
  };
}
