import httpClient from './api';

const BASE = '/indicator-mapping';

/**
 * Activity → T3/T4 indicator mapping API (D-20261016-04). The api.js
 * interceptor unwraps `{ success, data }`, so `response.data` is the payload.
 *
 * @example const { data } = await indicatorMappingApi.list({ fiscal_year: '2026', node_type: 'BROAD_ACTIVITY' });
 */
export const indicatorMappingApi = {
  list: (params) => httpClient.get(BASE, { params }),
  setLinks: (id, indicatorIds) => httpClient.put(`${BASE}/${id}`, { indicator_ids: indicatorIds }),
};
