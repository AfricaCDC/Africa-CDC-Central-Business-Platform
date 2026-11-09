import httpClient from './api';

const BASE = '/budget-execution';

/**
 * Budget execution API (D-20261015-04). The api.js interceptor unwraps
 * `{ success, data }`, so `response.data` is the payload.
 *
 * @example const { data } = await budgetExecutionApi.summary({ fiscal_year: '2026' });
 */
export const budgetExecutionApi = {
  summary: (params) => httpClient.get(`${BASE}/summary`, { params }),
  activities: (params) => httpClient.get(`${BASE}/activities`, { params }),
  activity: (id, params) => httpClient.get(`${BASE}/activities/${id}`, { params }),
  importStatus: () => httpClient.get(`${BASE}/import-status`),
  imports: (fiscalYear) => httpClient.get(`${BASE}/imports`, { params: { fiscal_year: fiscalYear } }),
  importExport: (formData) => httpClient.post(`${BASE}/imports`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteImport: (id) => httpClient.delete(`${BASE}/imports/${id}`),
  unlinked: (params) => httpClient.get(`${BASE}/unlinked`, { params }),
  link: (payload) => httpClient.post(`${BASE}/links`, payload),
};
