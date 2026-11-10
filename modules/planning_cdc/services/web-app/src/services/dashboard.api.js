import httpClient from './api';

/**
 * Dashboard API. The api.js interceptor unwraps `{ success, data }`.
 *
 * @example const { data } = await dashboardApi.activityProgress({ fiscal_year: '2026' });
 */
export const dashboardApi = {
  activityProgress: (params) => httpClient.get('/dashboard/activity-progress', { params }),
};
