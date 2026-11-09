import { useQuery } from '@tanstack/react-query';
import { referenceApi } from '@/services/reference.api';

const NS = 'reference';
const STALE_REF = 120_000;

/**
 * Suggestion list for a free-text combobox (funding sources, grants — H-3).
 * Returns a plain `string[]`; the combobox always allows free text on top.
 *
 * @param {string} type - a REFERENCE_TYPES value ('FUNDING_SOURCE' | 'GRANT')
 * @returns {import('@tanstack/react-query').UseQueryResult<string[]>}
 * @example
 * const { data: fundingSources = [] } = useReferenceValues(REFERENCE_TYPES.FUNDING_SOURCE);
 */
export function useReferenceValues(type) {
  return useQuery({
    queryKey: [NS, 'values', type],
    queryFn: async () => {
      // The api.js response interceptor unwraps `{success,data}` → `res.data`
      // is already the array. Fall back to `.data.data` for non-intercepted shapes.
      const res = await referenceApi.values(type);
      return Array.isArray(res.data) ? res.data : (res.data?.data || []);
    },
    enabled: Boolean(type),
    staleTime: STALE_REF,
  });
}
