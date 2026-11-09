import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const DEFAULT_PAGE_SIZE = 15;

const DEFAULTS = Object.freeze({
  step: 'all',
  entityType: 'all',
  divisionCode: 'all',
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
 * URL-driven filter state for the approval inbox. Modelled on
 * `useWorkplanFilters` — CHARTER §4 requires filters to live on
 * `useSearchParams` so they survive navigation and stay shareable.
 *
 * `queryPayload` is already shaped for the API — keys equal to their default
 * are omitted so the backend gets `?step=1&page=2` rather than the noisy form.
 * Changing any filter other than `page`/`pageSize` resets `page` back to 1.
 *
 * @returns {{
 *   filters: { step: string, entityType: string, divisionCode: string, page: number, pageSize: number },
 *   queryPayload: Record<string, string|number>,
 *   setFilter: (key: string, value: unknown) => void,
 *   clearAllFilters: () => void,
 *   activeFilterCount: number,
 * }}
 * @example
 * const { filters, queryPayload, setFilter } = useApprovalInboxFilters();
 * const { data } = useApprovalInbox(queryPayload);
 */
export function useApprovalInboxFilters() {
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

  const setFilter = useCallback(
    (key, value) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (isDefault(key, value)) {
            next.delete(key);
          } else {
            next.set(key, String(value));
          }
          if (key !== 'page' && key !== 'pageSize') next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const clearAllFilters = useCallback(() => {
    setParams(new URLSearchParams(), { replace: true });
  }, [setParams]);

  const queryPayload = useMemo(() => {
    const out = { page: filters.page, pageSize: filters.pageSize };
    if (filters.step !== DEFAULTS.step) out.step = filters.step;
    if (filters.entityType !== DEFAULTS.entityType) out.entityType = filters.entityType;
    if (filters.divisionCode !== DEFAULTS.divisionCode) out.divisionCode = filters.divisionCode;
    return out;
  }, [filters]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.step !== DEFAULTS.step) n += 1;
    if (filters.entityType !== DEFAULTS.entityType) n += 1;
    if (filters.divisionCode !== DEFAULTS.divisionCode) n += 1;
    return n;
  }, [filters]);

  return { filters, queryPayload, setFilter, clearAllFilters, activeFilterCount };
}
