import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { countryWorkplanApi } from '@/services/countryWorkplan.api';

const KEY = ['country-workplan'];

/**
 * Countries whose workplan the user may open (empty for a user outside any
 * country office). With a fiscal year, a reader of every country only gets
 * the countries that have activities that year. Cached one hour.
 *
 * @param {boolean} [enabled=true]
 * @param {string|null} [fiscalYear=null] - omit for the full access list (nav)
 * @returns {import('@tanstack/react-query').UseQueryResult<Array<{ code: string, name: string }>>}
 * @example const { data: countries = [] } = useViewableCountries(true, '2026');
 */
export function useViewableCountries(enabled = true, fiscalYear = null) {
  return useQuery({
    queryKey: [...KEY, 'countries', fiscalYear],
    queryFn: () => countryWorkplanApi.countries(fiscalYear).then((r) => r.data || []),
    staleTime: 60 * 60 * 1000,
    enabled,
  });
}

/**
 * Specific activities of a year planned in a country.
 *
 * @param {string|null} country - ISO alpha-3 code
 * @param {string} fiscalYear
 * @returns {import('@tanstack/react-query').UseQueryResult<{ country: object, activities: object[] }>}
 * @example const { data } = useCountryWorkplan('COD', '2027');
 */
export function useCountryWorkplan(country, fiscalYear) {
  return useQuery({
    queryKey: [...KEY, country, fiscalYear],
    queryFn: () => countryWorkplanApi.activities(country, fiscalYear).then((r) => r.data),
    enabled: !!country && !!fiscalYear,
    staleTime: 3 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
