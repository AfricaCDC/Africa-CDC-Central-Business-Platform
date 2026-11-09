import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

const NS = 'misc';
const STALE_REF = 120_000;

/** Division codes reference data (used by multiple pages). */
export function useDivisionCodes() {
  return useQuery({
    queryKey: [NS, 'division-codes'],
    queryFn: async () => {
      const res = await api.get('/admin/division-codes');
      return Array.isArray(res.data) ? res.data : (res.data?.data || []);
    },
    staleTime: STALE_REF,
  });
}

/** Implementing and funding partners (reference data). */
export function usePartners() {
  return useQuery({
    queryKey: [NS, 'partners'],
    queryFn: async () => {
      const res = await api.get('/admin/partners');
      return Array.isArray(res.data) ? res.data : (res.data?.data || []);
    },
    staleTime: 60 * 60_000,
  });
}

/** Priorities and enablers of the Africa CDC Strategic Plan (reference data). */
export function useStrategicPlan() {
  return useQuery({
    queryKey: [NS, 'strategic-plan'],
    queryFn: async () => {
      const res = await api.get('/admin/strategic-plan');
      return Array.isArray(res.data) ? res.data : (res.data?.data || []);
    },
    staleTime: 60 * 60_000,
  });
}
