import httpClient from './api';

const BASE = '/country-workplan';

/**
 * Country workplan API (D-20261028-01). The api.js interceptor unwraps
 * `{ success, data }`, so `response.data` is the payload.
 *
 * @example const { data } = await countryWorkplanApi.countries();
 */
export const countryWorkplanApi = {
  countries: (fiscalYear) => httpClient.get(`${BASE}/countries`, { params: fiscalYear ? { fiscal_year: fiscalYear } : {} }),
  activities: (country, fiscalYear) => httpClient.get(BASE, { params: { country, fiscal_year: fiscalYear } }),
};
