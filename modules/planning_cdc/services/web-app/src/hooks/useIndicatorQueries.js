import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { NODE_TYPES, ITEM_TYPES } from '@rbm/lib/enums';

const NS = 'ind';
const STALE = 60_000;

/** T3/T4 outcome indicators from plan_nodes. */
export function useT3T4Indicators(fiscalYear) {
  return useQuery({
    queryKey: [NS, 't3t4', fiscalYear],
    queryFn: async () => {
      const [t3, t4] = await Promise.all([
        api.get('/plan-nodes', { params: { node_type: NODE_TYPES.OUTCOME_INDICATOR, tier_id: 3, fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: NODE_TYPES.OUTCOME_INDICATOR, tier_id: 4, fiscal_year: fiscalYear } }),
      ]);
      return [...(t3.data || []), ...(t4.data || [])].map(i => ({
        ...i,
        indicator_code: i.code,
        indicator_name: i.title,
      })).sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    },
    staleTime: STALE,
  });
}

/** Plan-nodes for indicator mapping (broad or specific by itemType). */
export function useMappingPlanNodes(itemType, fiscalYear) {
  const nodeType = itemType === ITEM_TYPES.ACTIVITY ? NODE_TYPES.BROAD_ACTIVITY : NODE_TYPES.SPECIFIC_ACTIVITY;
  return useQuery({
    queryKey: [NS, 'mapping-nodes', itemType, fiscalYear],
    queryFn: async () => {
      const r = await api.get('/plan-nodes', { params: { node_type: nodeType, fiscal_year: fiscalYear } });
      return (Array.isArray(r.data) ? r.data : []).map(a => ({
        ...a,
        responsible_division: a.division?.name || a.responsible_division_code,
        indicator_id: a.linked_indicator_id,
        amert_code: a.code,
      }));
    },
    staleTime: STALE,
  });
}

