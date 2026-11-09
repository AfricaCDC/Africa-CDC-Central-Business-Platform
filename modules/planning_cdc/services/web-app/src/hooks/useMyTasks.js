import { useQuery } from '@tanstack/react-query';
import { myTasksApi } from '@/services/myTasks.api';

const ONE_MINUTE = 60_000;

/**
 * The to-do inbox of the top bar bell: pending decisions, rejected items to
 * fix, reports to validate. Refreshed every minute while the tab is visible
 * (React Query pauses the interval in a background tab) and on demand.
 *
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>} tasks
 * @example const { data: tasks = [], refetch } = useMyTasks();
 */
export function useMyTasks() {
  return useQuery({
    queryKey: ['me', 'tasks'],
    queryFn: async () => {
      const { data } = await myTasksApi.list();
      return Array.isArray(data?.tasks) ? data.tasks : [];
    },
    refetchInterval: ONE_MINUTE,
    staleTime: ONE_MINUTE / 2,
  });
}
