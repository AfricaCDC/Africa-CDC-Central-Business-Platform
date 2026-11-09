import httpClient from './api';

/**
 * Onboarding tour state of the signed-in user (D-20261105-16). The api.js
 * interceptor unwraps `{ success, data }`.
 *
 * @example const { data } = await tourApi.get(); // { seen_version: '1.3' }
 */
export const tourApi = {
  get: () => httpClient.get('/me/tour'),
  save: (version, outcome) => httpClient.put('/me/tour', { version, outcome }),
};
