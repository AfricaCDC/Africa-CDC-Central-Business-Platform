import httpClient from './api';

const BASE = '/activity-planning';

/**
 * Specific activity planning API (D-20261026-01): expense categories, cost
 * lines, Decision Complexity Screening. The api.js interceptor unwraps
 * `{ success, data }`, so `response.data` is the payload.
 *
 * @example const { data } = await activityPlanningApi.planning(4102);
 */
export const activityPlanningApi = {
  expenseCategories: () => httpClient.get(`${BASE}/expense-categories`),
  planning: (id) => httpClient.get(`${BASE}/${id}`),
  saveCostLines: (id, lines) => httpClient.put(`${BASE}/${id}/cost-lines`, { lines }),
  saveScreening: (id, screening) => httpClient.put(`${BASE}/${id}/screening`, screening),
  trail: (id) => httpClient.get(`${BASE}/${id}/trail`),
};
