import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const KEYS = ['status', 'type', 'funding', 'arrangement', 'risk', 'q'];

/**
 * Filters of the Specific Activities list, kept in the URL so a filtered list
 * can be shared or bookmarked (D-20261105-05).
 *
 * @returns {{ filters: Record<string, string>, setFilter: (key: string, value: string) => void,
 *   clearAllFilters: () => void, activeFilterCount: number }}
 * @example const { filters, setFilter } = useSpecificsFilters(); setFilter('risk', 'HIGH');
 */
export function useSpecificsFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => Object.fromEntries(KEYS.map((k) => [k, params.get(k) || ''])), [params]);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'ALL') next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };
  const clearAllFilters = () => {
    const next = new URLSearchParams(params);
    KEYS.forEach((k) => next.delete(k));
    setParams(next, { replace: true });
  };
  const activeFilterCount = KEYS.filter((k) => k !== 'q' && filters[k]).length;

  return { filters, setFilter, clearAllFilters, activeFilterCount };
}
