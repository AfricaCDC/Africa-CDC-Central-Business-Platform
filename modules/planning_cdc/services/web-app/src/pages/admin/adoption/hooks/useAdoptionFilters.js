import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

// URL key `bu` = Business Unit code, sent to the API as `unit`.
const FILTER_KEYS = ['filter', 'q', 'bu'];
// The name search reaches the API after a typing pause: one request per
// keystroke ran into the admin rate limit (60 a minute) and failed the page.
const SEARCH_DEBOUNCE_MS = 300;

/**
 * URL-driven filters of the adoption page (D-20261106-03): `filter`
 * (ADOPTION_FILTERS), `q` (name or email), `bu` (Business Unit), `page`.
 * Changing anything but the page goes back to page 1. `q` reaches
 * `queryPayload` after a 300 ms typing pause.
 *
 * @returns {{ filters: { filter: string, q: string, bu: string, page: number }, queryPayload: object,
 *   setFilter: (key: string, value: unknown) => void, clearAllFilters: () => void, activeFilterCount: number }}
 * @example const { filters, queryPayload, setFilter } = useAdoptionFilters();
 */
export function useAdoptionFilters() {
  const [params, setParams] = useSearchParams();

  const filters = useMemo(() => ({
    filter: params.get('filter') || '',
    q: params.get('q') || '',
    bu: params.get('bu') || '',
    page: Math.max(1, parseInt(params.get('page') || '1', 10) || 1),
  }), [params]);

  const q = useDebouncedValue(filters.q.trim(), SEARCH_DEBOUNCE_MS);
  const queryPayload = useMemo(() => {
    const payload = { filter: filters.filter, q, unit: filters.bu, page: filters.page > 1 ? filters.page : null };
    return Object.fromEntries(Object.entries(payload).filter(([, v]) => v));
  }, [filters.filter, filters.bu, filters.page, q]);

  const setFilter = useCallback((key, value) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === null || value === undefined || value === '' || (key === 'page' && Number(value) === 1)) next.delete(key);
      else next.set(key, String(value));
      if (key !== 'page') next.delete('page');
      return next;
    }, { replace: true });
  }, [setParams]);

  const clearAllFilters = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  const activeFilterCount = FILTER_KEYS.filter((k) => filters[k]).length;

  return { filters, queryPayload, setFilter, clearAllFilters, activeFilterCount };
}
