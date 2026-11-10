import httpClient from './api';

/**
 * Global search of the top bar (D-20261106-05). The api.js interceptor
 * unwraps `{ success, data }`.
 *
 * @example const { data } = await searchApi.find({ q: 'SDI.2', fiscal_year: '2026', limit: 6 });
 */
export const searchApi = {
  find: (params) => httpClient.get('/search', { params }),
};
