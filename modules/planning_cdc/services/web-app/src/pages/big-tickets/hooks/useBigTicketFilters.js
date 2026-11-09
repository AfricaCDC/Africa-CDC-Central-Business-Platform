import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const DEFAULTS = Object.freeze({
  fy: String(new Date().getFullYear()),
  quarter: '',
  pillar: 'all',
  progress: 'all',
  q: '',
});

const isDefault = (key, value) => value == null || value === '' || value === DEFAULTS[key];

/**
 * URL-driven filters of the Big Tickets list (D-20261015-02): year, quarter,
 * pillar, progress status, search. An empty quarter lets the server pick the
 * latest quarter with reports. No pagination: the ~40 tickets are grouped by pillar.
 *
 * @returns {{
 *   filters: { fy: string, quarter: string, pillar: string, progress: string, q: string },
 *   queryPayload: Record<string, string>,
 *   setFilter: (key: string, value: string) => void,
 *   clearAllFilters: () => void,
 *   activeFilterCount: number,
 * }}
 * @example const { filters, queryPayload, setFilter } = useBigTicketFilters();
 */
export function useBigTicketFilters() {
  const [params, setParams] = useSearchParams();

  const filters = useMemo(() => {
    const out = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
      const raw = params.get(key);
      if (raw != null && raw !== '') out[key] = raw;
    }
    return out;
  }, [params]);

  const queryPayload = useMemo(() => {
    const p = { fiscal_year: filters.fy };
    if (filters.quarter) p.quarter = filters.quarter;
    if (filters.pillar !== 'all') p.pillar_id = filters.pillar;
    if (filters.progress !== 'all') p.progress = filters.progress;
    if (filters.q) p.q = filters.q;
    return p;
  }, [filters]);

  const setFilter = useCallback((key, value) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (isDefault(key, value)) next.delete(key);
      else next.set(key, String(value));
      return next;
    }, { replace: true });
  }, [setParams]);

  const clearAllFilters = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams();
      if (prev.get('fy')) next.set('fy', prev.get('fy'));
      return next;
    }, { replace: true });
  }, [setParams]);

  const activeFilterCount = ['pillar', 'progress', 'q'].filter((k) => !isDefault(k, filters[k])).length;

  return { filters, queryPayload, setFilter, clearAllFilters, activeFilterCount };
}
