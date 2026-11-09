import httpClient from './api';

/**
 * Data health API (D-20261105-11). The api.js interceptor unwraps
 * `{ success, data }`, so `response.data` is the report.
 *
 * @example const { data } = await dataHealthApi.get('2027');
 */
export const dataHealthApi = {
  get: (fiscalYear) => httpClient.get('/admin/data-health', { params: { fiscal_year: fiscalYear } }),
};
