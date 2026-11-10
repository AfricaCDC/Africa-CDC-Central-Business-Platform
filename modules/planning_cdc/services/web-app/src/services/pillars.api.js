import api from './api';

/**
 * AHSS pillars reference API (D-20260714-03).
 *
 * @example const { data } = await pillarsApi.list();
 */
export const pillarsApi = {
  list: () => api.get('/pillars'),
};
