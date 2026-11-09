import httpClient from './api';

/**
 * Adoption of the platform, for administrators (D-20261106-03). The api.js
 * interceptor unwraps `{ success, data }`.
 *
 * @example const { data } = await adoptionApi.get({ filter: 'NEVER_SIGNED_IN', page: 1 });
 */
export const adoptionApi = {
  get: (params) => httpClient.get('/admin/adoption', { params }),
};
