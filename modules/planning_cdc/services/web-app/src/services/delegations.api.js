import httpClient from './api';

/**
 * Out-of-office delegation API (D-20261105-09). The api.js interceptor
 * unwraps `{ success, data }`, so `response.data` is the payload.
 *
 * @example const { data } = await delegationsApi.mine();
 */
export const delegationsApi = {
  mine: () => httpClient.get('/delegations'),
  candidates: () => httpClient.get('/delegations/candidates'),
  create: (payload) => httpClient.post('/delegations', payload),
  end: (id) => httpClient.delete(`/delegations/${id}`),
};
