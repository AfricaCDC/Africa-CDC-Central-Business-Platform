import httpClient from './api';

const BASE = '/big-tickets';

/**
 * Big Tickets API (D-20261015-02). The api.js interceptor unwraps
 * `{ success, data }`, so `response.data` is the payload.
 *
 * @example const { data } = await bigTicketsApi.list({ fiscal_year: '2026', quarter: 'Q2' });
 */
export const bigTicketsApi = {
  list: (params) => httpClient.get(BASE, { params }),
  getById: (id, fiscalYear) => httpClient.get(`${BASE}/${id}`, { params: { fiscal_year: fiscalYear } }),
  indicatorOptions: (fiscalYear, q) => httpClient.get(`${BASE}/indicator-options`, { params: { fiscal_year: fiscalYear, q } }),
  create: (payload) => httpClient.post(BASE, payload),
  update: (id, payload) => httpClient.put(`${BASE}/${id}`, payload),
  remove: (id) => httpClient.delete(`${BASE}/${id}`),
  getReport: (id, quarter, fiscalYear) => httpClient.get(`${BASE}/${id}/reports/${quarter}`, { params: { fiscal_year: fiscalYear } }),
  saveReport: (id, quarter, payload) => httpClient.put(`${BASE}/${id}/reports/${quarter}`, payload),
  approveReport: (id, quarter, fiscalYear) => httpClient.post(`${BASE}/${id}/reports/${quarter}/approve`, { fiscal_year: fiscalYear }),
  exportFile: (fiscalYear, quarter, format = 'xlsx') => httpClient.get(`${BASE}/export`, {
    params: { fiscal_year: fiscalYear, quarter, format }, responseType: 'blob',
  }),
  rejectReport: (id, quarter, fiscalYear, reason) => httpClient.post(`${BASE}/${id}/reports/${quarter}/reject`, { fiscal_year: fiscalYear, reason }),
};
