import { useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { RBAC_MODULES, RBAC_ACTIONS } from '@rbm/lib/rbac';
import { usePlanningYear } from '@/contexts/PlanningYearContext';
import { usePermissions } from '@/hooks/usePermissions';
import useNavItems from '@/components/layout/useNavItems';
import { useViewableCountries } from '@/pages/country-workplan/hooks/useCountryWorkplanQueries';
import { searchApi } from '@/services/search.api';
import { SEARCH_MIN_CHARS, SEARCH_MAX_CHARS, buildSections, matchPages } from '@/config/globalSearch';

/**
 * GET /api/search in the selected plan year (D-20261106-05), from 2
 * characters (list data: 2 minutes).
 *
 * @param {string} text
 * @param {number} limit - results per group
 * @returns {import('@tanstack/react-query').UseQueryResult<{ q: string, fiscal_year: string|null, groups: Array<{ group: string, items: object[] }> }>}
 * @example const { data } = useGlobalSearch('SDI.2', 6);
 */
export function useGlobalSearch(text, limit) {
  const { planningYear } = usePlanningYear();
  const q = String(text || '').trim().slice(0, SEARCH_MAX_CHARS);
  return useQuery({
    queryKey: ['search', q, planningYear, limit],
    queryFn: async () => (await searchApi.find({ q, fiscal_year: planningYear, limit })).data,
    enabled: q.length >= SEARCH_MIN_CHARS,
    placeholderData: keepPreviousData,
    staleTime: 2 * 60_000,
  });
}

/**
 * Search results as sections the user can open: menu pages (when asked),
 * then plan items, Business Units and member states. A Business Unit or a
 * member state is kept only when its page is open to the user.
 *
 * @param {string} text
 * @param {{ limit: number, withPages?: boolean }} options
 * @returns {{ sections: object[], isSearching: boolean, isError: boolean, hasTerm: boolean, planningYear: string, refetch: () => void }}
 * @example const { sections, isSearching } = useSearchSections(term, { limit: 6, withPages: true });
 */
export function useSearchSections(text, { limit, withPages = false }) {
  const nav = useNavItems();
  const { can, isAdmin } = usePermissions();
  const { planningYear } = usePlanningYear();
  const { data: countries = [] } = useViewableCountries(true);
  const search = useGlobalSearch(text, limit);
  const hasTerm = String(text || '').trim().length >= SEARCH_MIN_CHARS;
  // Same gate as the /reference routes (ProtectedRoute in App.jsx).
  const canOpenReference = isAdmin || can(RBAC_MODULES.AUDIT_LOG, RBAC_ACTIONS.READ);

  const sections = useMemo(() => buildSections({
    pages: withPages ? matchPages(nav, text || '') : [],
    groups: hasTerm ? search.data?.groups || [] : [],
    access: { countryCodes: countries.map((c) => c.code), canOpenReference },
  }), [withPages, nav, text, hasTerm, search.data, countries, canOpenReference]);

  return {
    sections,
    isSearching: hasTerm && search.isFetching,
    isError: hasTerm && search.isError,
    hasTerm,
    planningYear,
    refetch: search.refetch,
  };
}
