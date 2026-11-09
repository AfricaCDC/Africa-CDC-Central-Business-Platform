import { useQuery } from '@tanstack/react-query';
import { planNodesApi } from '@/services/planNodes.api';

/**
 * The fiscal years that actually hold a plan, newest first.
 *
 * MUST NOT run while the user is unauthenticated. A 401 here is not harmless:
 * the response interceptor in services/api.js tries to refresh the token and,
 * when there is none, calls forceLogout() — which wipes the session and
 * redirects to /login. Firing this query on the login page therefore loops:
 * request, 401, redirect to /login, request again. Production logged 15 453
 * such 401s in 72 hours, peaking at 300 requests per minute.
 *
 * Reference data: it only changes when a new plan generation is loaded, so it
 * is cached for an hour. The switcher offers exactly what the server returns —
 * never a range derived from the clock, which is what made the platform blind
 * to FY2027 until it was loaded.
 *
 * @param {{enabled?: boolean}} [options] — pass `enabled: false` until the user is authenticated
 * @returns {import('@tanstack/react-query').UseQueryResult<{fiscal_year:string,node_count:number}[]>}
 * @example const { data: years = [] } = useFiscalYears({ enabled: !!user });
 */
export function useFiscalYears({ enabled = true } = {}) {
  return useQuery({
    enabled,
    queryKey: ['plan-nodes', 'fiscal-years'],
    queryFn: async () => {
      const res = await planNodesApi.listFiscalYears();
      // The response interceptor in services/api.js unwraps the canonical
      // {success,data} envelope, so res.data IS the array. The envelope branch
      // stays as a guard in case a cached or legacy response slips through.
      if (Array.isArray(res.data)) return res.data;
      return Array.isArray(res.data?.data) ? res.data.data : [];
    },
    staleTime: 3_600_000,
    // Reference data behind an auth gate: a failure will not fix itself by
    // being repeated, and every retry is another chance to trip forceLogout.
    retry: false,
    refetchOnWindowFocus: false,
  });
}
