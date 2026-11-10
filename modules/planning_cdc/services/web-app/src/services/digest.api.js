import httpClient from './api';

/**
 * Monthly digest API (D-20261105-15). The api.js interceptor unwraps
 * `{ success, data }`, so `response.data` is the payload.
 *
 * @example const { data } = await digestApi.get('DSI');
 */
export const digestApi = {
  directorates: () => httpClient.get('/digest/directorates'),
  get: (directorate) => httpClient.get('/digest', { params: { directorate } }),
};
