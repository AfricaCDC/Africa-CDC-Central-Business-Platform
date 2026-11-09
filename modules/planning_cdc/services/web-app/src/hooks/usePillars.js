import { useQuery } from '@tanstack/react-query';
import { pillarsApi } from '@/services/pillars.api';

/**
 * AHSS pillars reference list (D-20260714-03). Migration-seeded, so a long
 * staleTime is safe.
 *
 * @returns {import('@tanstack/react-query').UseQueryResult<Array<{id:number,name:string,sort_order:number}>>}
 * @example const { data: pillars = [] } = usePillars();
 */
export function usePillars() {
  return useQuery({
    queryKey: ['reference', 'pillars'],
    queryFn: async () => {
      const { data } = await pillarsApi.list();
      // api.js unwraps { success, data }: data is the array (older shape kept).
      if (Array.isArray(data)) return data;
      return Array.isArray(data?.data) ? data.data : [];
    },
    staleTime: 3_600_000,
  });
}

/**
 * pillar_id → name resolver built on usePillars.
 *
 * @returns {(id: number|null|undefined) => string|null}
 * @example const pillarName = usePillarNameById(); pillarName(ind.pillar_id);
 */
export function usePillarNameById() {
  const { data: pillars = [] } = usePillars();
  return (id) => (id ? (pillars.find((p) => p.id === id)?.name || null) : null);
}
