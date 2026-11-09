import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const DEFAULT_PAGE_SIZE = 15;

const DEFAULTS = Object.freeze({
  q: '',
  status: 'all',
  quarter: 'all',
  divisionId: 'all',
  directorateId: 'all',
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
});

const PARSE_INT = (raw, fallback) => {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const PARSERS = Object.freeze({
  page: (raw) => PARSE_INT(raw, DEFAULTS.page),
  pageSize: (raw) => PARSE_INT(raw, DEFAULTS.pageSize),
});

const isDefault = (key, value) => value === DEFAULTS[key] || value == null || value === '';

/**
 * URL-driven filter state for the Workplans module.
 *
 * Filters live on `useSearchParams` so they are shareable, bookmarkable,
 * and survive navigation. Any `setFilter` call that changes anything
 * other than `page` also resets `page` back to 1.
 *
 * Resolution order for each key:
 *   1. URL query param (coerced via `PARSERS` when present, raw string otherwise)
 *   2. Value from `DEFAULTS`
 *
 * `queryPayload` is already shaped for the API — values equal to their
 * defaults are omitted so the caller hits `GET /workplans?page=2` rather
 * than `GET /workplans?q=&status=all&quarter=all&page=2`.
 *
 * @returns {{
 *   filters: { q: string, status: string, quarter: string, divisionId: string, page: number, pageSize: number },
 *   queryPayload: Record<string, string|number>,
 *   setFilter: (key: string, value: unknown) => void,
 *   setFilters: (patch: Record<string, unknown>) => void,
 *   clearAllFilters: () => void,
 *   activeFilterCount: number,
 * }}
 * @example
 * const { filters, queryPayload, setFilter, activeFilterCount } = useWorkplanFilters();
 * const { data } = useWorkplans(queryPayload);
 * // <SearchInput value={filters.q} onChange={(v) => setFilter('q', v)} />
 */
export function useWorkplanFilters() {
  const [params, setParams] = useSearchParams();

  const filters = useMemo(() => {
    const out = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
      const raw = params.get(key);
      if (raw == null) continue;
      out[key] = PARSERS[key] ? PARSERS[key](raw) : raw;
    }
    return out;
  }, [params]);

  const setFilters = useCallback(
    (patch) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          let touchedNonPage = false;
          for (const [key, value] of Object.entries(patch)) {
            if (isDefault(key, value)) next.delete(key);
            else next.set(key, String(value));
            if (key !== 'page' && key !== 'pageSize') touchedNonPage = true;
          }
          // Any non-pagination change resets to page 1.
          if (touchedNonPage) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // Single-key convenience wrapper. Prefer `setFilters` when changing two or
  // more keys at once (e.g. picking a directorate also resets the division):
  // React Router does NOT chain functional `setSearchParams` updaters across
  // synchronous calls, so two `setFilter` calls would clobber one another.
  const setFilter = useCallback((key, value) => setFilters({ [key]: value }), [setFilters]);

  const clearAllFilters = useCallback(() => {
    setParams(new URLSearchParams(), { replace: true });
  }, [setParams]);

  const queryPayload = useMemo(() => {
    const out = { page: filters.page, pageSize: filters.pageSize };
    if (filters.q) out.q = filters.q;
    if (filters.status !== DEFAULTS.status) out.status = filters.status;
    if (filters.quarter !== DEFAULTS.quarter) out.quarter = filters.quarter;
    if (filters.divisionId !== DEFAULTS.divisionId) out.divisionId = filters.divisionId;
    if (filters.directorateId !== DEFAULTS.directorateId) out.directorateId = filters.directorateId;
    return out;
  }, [filters]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.q) n += 1;
    if (filters.status !== DEFAULTS.status) n += 1;
    if (filters.quarter !== DEFAULTS.quarter) n += 1;
    if (filters.divisionId !== DEFAULTS.divisionId) n += 1;
    if (filters.directorateId !== DEFAULTS.directorateId) n += 1;
    return n;
  }, [filters]);

  return { filters, queryPayload, setFilter, setFilters, clearAllFilters, activeFilterCount };
}
