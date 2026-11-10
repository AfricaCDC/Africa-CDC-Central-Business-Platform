import api from './api';

/**
 * @example
 * const { data } = await budgetApi.getCodes({ fiscal_year: '2026' });
 */
export const budgetApi = {
  getCodes: (params) => api.get('/budget-codes', { params }),
  getSummary: (params) => api.get('/budget-codes/summary', { params }),
  updateCode: (id, data) => api.put(`/budget-codes/${id}`, data),
  deleteCode: (id) => api.delete(`/budget-codes/${id}`),
};
