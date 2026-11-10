// ── Plan-nodes API service ──
// URLs belong here, never in a component or a hook (CHARTER §8).

import httpClient from './api';

export const planNodesApi = {
  /**
   * Fiscal years that actually hold a plan, newest first.
   *
   * @returns {Promise<import('axios').AxiosResponse>} `{success,data:[{fiscal_year,node_count}]}`
   * @example const res = await planNodesApi.listFiscalYears();
   */
  listFiscalYears: () => httpClient.get('/plan-nodes/fiscal-years'),

  /**
   * Create a specific activity (same body as the form).
   *
   * @param {object} payload
   * @returns {Promise<import('axios').AxiosResponse>} the created node
   * @example await planNodesApi.createSpecific({ title, parent_id, location: 'Kenya' });
   */
  createSpecific: (payload) => httpClient.post('/plan-nodes/specific-activity', payload),

  /**
   * Submit a specific activity for approval.
   *
   * @param {number} id
   * @returns {Promise<import('axios').AxiosResponse>}
   * @example await planNodesApi.submitSpecific(42);
   */
  submitSpecific: (id) => httpClient.post(`/plan-nodes/specific-activity/${id}/submit`),
};

export default planNodesApi;
