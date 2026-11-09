import { useSearchParams } from 'react-router-dom';
import { NODE_TYPES } from '@rbm/lib/enums';

export const LINK_FILTERS = ['all', 'linked', 'unlinked'];
const DEFAULTS = { type: NODE_TYPES.BROAD_ACTIVITY, q: '', linked: 'all', page: '1' };

/**
 * Filters of /pirs/mapping in the URL: activity type, search, linked state, page.
 * Any change other than the page goes back to page 1.
 *
 * @returns {{ filters: { type: string, q: string, linked: string, page: number }, setFilter: (key: string, value: string|number) => void, clearAllFilters: () => void, activeFilterCount: number }}
 * @example const { filters, setFilter } = useMappingFilters();
 */
export function useMappingFilters() {
  const [params, setParams] = useSearchParams();
  const get = (key) => params.get(key) || DEFAULTS[key];
  const filters = { type: get('type'), q: get('q'), linked: get('linked'), page: Math.max(1, Number(get('page')) || 1) };

  const setFilter = (key, value) => setParams((p) => {
    const next = new URLSearchParams(p);
    if (!value || String(value) === DEFAULTS[key]) next.delete(key); else next.set(key, String(value));
    if (key !== 'page') next.delete('page');
    return next;
  }, { replace: true });
  const clearAllFilters = () => setParams((p) => {
    const next = new URLSearchParams();
    if (p.get('type')) next.set('type', p.get('type'));
    return next;
  }, { replace: true });
  const activeFilterCount = (filters.q ? 1 : 0) + (filters.linked !== 'all' ? 1 : 0);

  return { filters, setFilter, clearAllFilters, activeFilterCount };
}
