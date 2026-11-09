import { useQuery, useQueryClient } from '@tanstack/react-query';
import { activityPlanningApi } from '@/services/activityPlanning.api';

const KEY = 'activity-planning';

/**
 * Expense categories of the cost catalogue (reference data: cached for an hour).
 *
 * @returns {import('@tanstack/react-query').UseQueryResult<Array<{ id: number, name: string }>>}
 * @example const { data: categories = [] } = useExpenseCategories();
 */
export function useExpenseCategories() {
  return useQuery({
    queryKey: [KEY, 'expense-categories'],
    queryFn: async () => (await activityPlanningApi.expenseCategories()).data,
    staleTime: 60 * 60_000,
  });
}

/**
 * Cost lines, total and screening of a specific activity.
 *
 * @param {number|string|null} id
 * @returns {import('@tanstack/react-query').UseQueryResult<{ cost_lines: object[], total: number, screening: object|null }>}
 * @example const { data } = useActivityPlanning(4102);
 */
export function useActivityPlanning(id) {
  return useQuery({
    queryKey: [KEY, 'detail', String(id)],
    queryFn: async () => (await activityPlanningApi.planning(id)).data,
    staleTime: 2 * 60_000,
    enabled: !!id,
  });
}

/**
 * Approval trail of a specific activity and whom it waits for (D-20261103-02).
 * Decisions are taken on other pages, so the trail refetches on every visit.
 *
 * @param {number|string|null} id
 * @returns {import('@tanstack/react-query').UseQueryResult<{ events: object[], waiting_for: { step: string|null, name: string|null }|null }>}
 * @example const { data } = useActivityTrail(4102);
 */
export function useActivityTrail(id) {
  return useQuery({
    queryKey: [KEY, 'trail', String(id)],
    queryFn: async () => (await activityPlanningApi.trail(id)).data,
    staleTime: 0,
    enabled: !!id,
  });
}

/**
 * Save the screening (when answered) and the cost lines of an activity, then
 * refresh its planning.
 *
 * @returns {(id: number, payload: { screening: object|null, lines: object[] }) => Promise<void>}
 * @example await useSaveActivityPlanning()(4102, { screening, lines });
 */
export function useSaveActivityPlanning() {
  const qc = useQueryClient();
  return async (id, { screening, lines }) => {
    if (screening) await activityPlanningApi.saveScreening(id, screening);
    await activityPlanningApi.saveCostLines(id, lines);
    await qc.invalidateQueries({ queryKey: [KEY, 'detail', String(id)] });
  };
}
