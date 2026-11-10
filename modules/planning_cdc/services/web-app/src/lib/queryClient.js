import { QueryClient } from '@tanstack/react-query';

/**
 * Shared TanStack Query client for the web-app.
 *
 * Defaults are intentionally conservative so list/detail pages don't hammer
 * the API: 2 minute stale window, no refetch on window focus, one retry.
 * Per-query overrides (`staleTime`, `keepPreviousData`, `enabled`) live in
 * the `use<Module>Queries.js` hooks — see `reports/phase2/per-service/web-app.md`.
 *
 * @type {QueryClient}
 * @example
 * import { queryClient } from '@/lib/queryClient';
 * queryClient.invalidateQueries({ queryKey: ['workplans'] });
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 5-min stale window (up from 2) — repeated navigations reuse the
      // cached response instead of triggering a refetch. The backend
      // Cache-Control (60-300 s) + strong ETag means even a forced
      // refetch usually returns a zero-byte 304.
      staleTime: 5 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
