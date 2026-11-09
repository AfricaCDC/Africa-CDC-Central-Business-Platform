import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const KEYS = Object.freeze(['q', 'region']);

/**
 * Search text and region of the Member States page, kept in the URL so the
 * view can be shared. No pagination: the 55 member states fit on one page.
 *
 * @returns {{ filters: { q: string, region: string }, setFilter: (key: 'q'|'region', value: string) => void, clearAllFilters: () => void, activeFilterCount: number }}
 * @example const { filters, setFilter } = useMemberStateFilters();
 */
export function useMemberStateFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => ({ q: params.get('q') || '', region: params.get('region') || '' }), [params]);

  const update = useCallback((patch) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    return next;
  }, { replace: true }), [setParams]);

  const setFilter = useCallback((key, value) => update({ [key]: value }), [update]);
  const clearAllFilters = useCallback(() => update({ q: '', region: '' }), [update]);

  return { filters, setFilter, clearAllFilters, activeFilterCount: KEYS.filter((k) => filters[k]).length };
}
