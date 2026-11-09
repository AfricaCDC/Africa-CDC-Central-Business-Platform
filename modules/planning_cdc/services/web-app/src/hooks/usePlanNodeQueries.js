/* eslint-disable no-restricted-syntax, max-lines */
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';

export function useShortTermOutcomeData(fiscalYear) {
  return useQuery({
    queryKey: ['plan-nodes', 'short-term-outcome', fiscalYear],
    queryFn: async () => {
      const [t3Res, t4Res, broadRes, specRes, divRes] = await Promise.all([
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_INDICATOR', tier_id: 3, fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_INDICATOR', tier_id: 4, fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'BROAD_ACTIVITY', fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'SPECIFIC_ACTIVITY', fiscal_year: fiscalYear } }),
        api.get('/admin/division-codes').catch(() => ({ data: [] })),
      ]);
      return {
        t3: Array.isArray(t3Res.data) ? t3Res.data : [],
        t4: Array.isArray(t4Res.data) ? t4Res.data : [],
        broads: Array.isArray(broadRes.data) ? broadRes.data : [],
        specifics: Array.isArray(specRes.data) ? specRes.data : [],
        divisions: Array.isArray(divRes.data) ? divRes.data : [],
      };
    },
    staleTime: 120_000,
  });
}

export function useFullPlanData(fiscalYear) {
  return useQuery({
    queryKey: ['plan-nodes', 'full-plan', fiscalYear],
    queryFn: async () => {
      const [impactRes, t1Res, areasRes, t2Res, t3Res, t4Res, broadRes, specRes] = await Promise.all([
        api.get('/plan-nodes', { params: { node_type: 'IMPACT', fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'IMPACT_INDICATOR', fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_AREA', fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_INDICATOR', tier_id: 2, fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_INDICATOR', tier_id: 3, fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_INDICATOR', tier_id: 4, fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'BROAD_ACTIVITY', fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'SPECIFIC_ACTIVITY', fiscal_year: fiscalYear } }),
      ]);
      return {
        impact: (Array.isArray(impactRes.data) ? impactRes.data : [])[0] || null,
        t1: Array.isArray(t1Res.data) ? t1Res.data : [],
        areas: Array.isArray(areasRes.data) ? areasRes.data : [],
        t2: Array.isArray(t2Res.data) ? t2Res.data : [],
        t3: Array.isArray(t3Res.data) ? t3Res.data : [],
        t4: Array.isArray(t4Res.data) ? t4Res.data : [],
        broads: Array.isArray(broadRes.data) ? broadRes.data : [],
        specifics: Array.isArray(specRes.data) ? specRes.data : [],
      };
    },
    staleTime: 120_000,
  });
}

export function useActivityBrowseData(fiscalYear) {
  return useQuery({
    queryKey: ['plan-nodes', 'activity-browse', fiscalYear],
    queryFn: async () => {
      const [b, i, d] = await Promise.all([
        api.get('/plan-nodes', { params: { node_type: 'BROAD_ACTIVITY', fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_INDICATOR', fiscal_year: fiscalYear } }),
        api.get('/admin/division-codes').catch(() => ({ data: [] })),
      ]);
      const divisionsList = Array.isArray(d.data) ? d.data : [];
      // ActivityPage reads { activities, outcomeIndicators, divCodes }; keep the
      // legacy { broads, indicators, divisions } keys too so other consumers
      // don't break.
      const divCodes = {};
      divisionsList.forEach((dc) => { if (dc?.code) divCodes[dc.code] = dc.division_name || dc.code; });
      return {
        broads: b.data || [], indicators: i.data || [], divisions: divisionsList,
        activities: b.data || [], outcomeIndicators: i.data || [], divCodes,
      };
    },
    staleTime: 120_000,
  });
}

export function useAMERTTree(fiscalYear) {
  return useQuery({
    queryKey: ['plan-nodes', 'amert-tree', fiscalYear],
    queryFn: async () => {
      const results = await Promise.all([
        api.get('/plan-nodes', { params: { node_type: 'IMPACT', fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'IMPACT_INDICATOR', fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_AREA', fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_INDICATOR', tier_id: 2, fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_INDICATOR', tier_id: 3, fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_INDICATOR', tier_id: 4, fiscal_year: fiscalYear } }),
      ]);
      const arr = (r) => Array.isArray(r.data) ? r.data : [];
      const impacts = arr(results[0]);
      const t1 = arr(results[1]);
      const areas = arr(results[2]);
      const t2 = arr(results[3]);
      const t3 = arr(results[4]);
      const t4 = arr(results[5]);
      // AMERTPage walks tree.children[*].outcomes[*].{t2,t3,t4}. Build the
      // nested shape via parent_id linkage. Each Impact Indicator (T1) hangs
      // off the IMPACT root; Outcomes hang off T1; OUTCOME_INDICATOR (T2/T3/T4)
      // hang off Outcomes.
      const impactRoot = impacts[0] || null;
      const t2ByOutcome = groupBy(t2, 'parent_id');
      const t3ByOutcome = groupBy(t3, 'parent_id');
      const t4ByOutcome = groupBy(t4, 'parent_id');
      const outcomesByT1 = groupBy(areas, 'parent_id');
      const t1Children = (impactRoot ? t1.filter((x) => x.parent_id === impactRoot.id) : t1).map((ii) => ({
        ...ii,
        outcomes: (outcomesByT1[ii.id] || []).map((o) => ({
          ...o,
          t2: t2ByOutcome[o.id] || [],
          t3: t3ByOutcome[o.id] || [],
          t4: t4ByOutcome[o.id] || [],
        })),
      }));
      // AMERTPage destructures `data: tree` and reads `tree.children`, so the
      // hook returns the impact node directly with `children` attached.
      // Flat arrays are exposed as non-enumerable-style extras for callers
      // that need them.
      return impactRoot
        ? { ...impactRoot, children: t1Children, _flat: { impacts, t1, areas, t2, t3, t4 } }
        : { id: null, title: 'No Impact configured', children: t1Children, budget_total_2026: 0, _flat: { impacts, t1, areas, t2, t3, t4 } };
    },
    staleTime: 120_000,
  });
}

function groupBy(list, key) {
  const m = {};
  for (const item of list) {
    const k = item[key];
    if (!m[k]) m[k] = [];
    m[k].push(item);
  }
  return m;
}

export function useFocalDashboardRaw(fiscalYear) {
  return useQuery({
    queryKey: ['plan-nodes', 'focal-dashboard', fiscalYear],
    queryFn: async () => {
      const [b, s, t2, t3, t4, a, bc, d] = await Promise.all([
        api.get('/plan-nodes', { params: { node_type: 'BROAD_ACTIVITY', fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'SPECIFIC_ACTIVITY', fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_INDICATOR', tier_id: 2, fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_INDICATOR', tier_id: 3, fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_INDICATOR', tier_id: 4, fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_AREA', fiscal_year: fiscalYear } }),
        api.get('/budget-codes').catch(() => ({ data: [] })),
        api.get('/admin/division-codes').catch(() => ({ data: [] })),
      ]);
      return { broads: b.data||[], specifics: s.data||[], t2: t2.data||[], t3: t3.data||[], t4: t4.data||[], areas: a.data||[], budgetCodes: bc.data||[], divisions: d.data||[] };
    },
    staleTime: 120_000,
  });
}

export function useImpactData(fiscalYear) {
  return useQuery({
    queryKey: ['plan-nodes', 'impact', fiscalYear],
    queryFn: async () => {
      const [i, t1] = await Promise.all([
        api.get('/plan-nodes', { params: { node_type: 'IMPACT', fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'IMPACT_INDICATOR', tier_id: 1, fiscal_year: fiscalYear } }),
      ]);
      const impacts = Array.isArray(i.data) ? i.data : [];
      const indicators = Array.isArray(t1.data) ? t1.data : [];
      // ImpactPage reads { outcome, indicators }; keep flat keys for legacy callers.
      return { impacts, t1: indicators, outcome: impacts[0] || null, indicators };
    },
    staleTime: 120_000,
  });
}

export function useLogframeData(fiscalYear) {
  return useFullPlanData(fiscalYear);
}

export function useMyBroadActivities(fiscalYear) {
  return useQuery({
    queryKey: ['plan-nodes', 'my-broads', fiscalYear],
    queryFn: () => api.get('/plan-nodes', { params: { node_type: 'BROAD_ACTIVITY', fiscal_year: fiscalYear } }).then(r => r.data || []),
    staleTime: 120_000,
  });
}

export function useMyIndicatorsData(fiscalYear) {
  return useQuery({
    queryKey: ['plan-nodes', 'my-indicators', fiscalYear],
    queryFn: async () => {
      const [b, s, t3, t4, d] = await Promise.all([
        api.get('/plan-nodes', { params: { node_type: 'BROAD_ACTIVITY', fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'SPECIFIC_ACTIVITY', fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_INDICATOR', tier_id: 3, fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_INDICATOR', tier_id: 4, fiscal_year: fiscalYear } }),
        api.get('/admin/division-codes').catch(() => ({ data: [] })),
      ]);
      return { broads: b.data||[], specifics: s.data||[], t3: t3.data||[], t4: t4.data||[], divisions: d.data||[] };
    },
    staleTime: 120_000,
  });
}

/**
 * The specific activities list of the user: the published activities plus the
 * user's own drafts, activities in review and rejected ones (`mine=true`),
 * which the public list leaves out.
 *
 * @param {string} fiscalYear
 * @returns {import('@tanstack/react-query').UseQueryResult<object>}
 * @example const { data } = useMySpecificActivities('2027');
 */
export function useMySpecificActivities(fiscalYear) {
  return useQuery({
    queryKey: ['plan-nodes', 'specific-activity', 'mine', fiscalYear],
    queryFn: async () => {
      const [base, mine] = await Promise.all([
        fetchSpecificActivityData(fiscalYear),
        api.get('/plan-nodes', { params: { node_type: 'SPECIFIC_ACTIVITY', fiscal_year: fiscalYear, mine: 'true' } }),
      ]);
      const byId = new Map([...base.specifics, ...(mine.data || [])].map((r) => [r.id, r]));
      return { ...base, specifics: [...byId.values()] };
    },
    staleTime: 120_000,
  });
}

export function useMyWorkplanData(fiscalYear) {
  return useQuery({
    queryKey: ['plan-nodes', 'my-workplan', fiscalYear],
    queryFn: async () => {
      const [b, s, t3, t4, a] = await Promise.all([
        api.get('/plan-nodes', { params: { node_type: 'BROAD_ACTIVITY', fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'SPECIFIC_ACTIVITY', fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_INDICATOR', tier_id: 3, fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_INDICATOR', tier_id: 4, fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_AREA', fiscal_year: fiscalYear } }),
      ]);
      return { broads: b.data||[], specifics: s.data||[], t3: t3.data||[], t4: t4.data||[], areas: a.data||[] };
    },
    staleTime: 120_000,
  });
}

export function useOutcomePageData(fiscalYear) {
  return useQuery({
    queryKey: ['plan-nodes', 'outcome-page', fiscalYear],
    queryFn: async () => {
      const [i, t1, a] = await Promise.all([
        api.get('/plan-nodes', { params: { node_type: 'IMPACT', fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'IMPACT_INDICATOR', fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_AREA', fiscal_year: fiscalYear } }),
      ]);
      const impacts = Array.isArray(i.data) ? i.data : [];
      const impactIndicators = Array.isArray(t1.data) ? t1.data : [];
      const outcomeList = Array.isArray(a.data) ? a.data : [];
      // OutcomePage reads { impact, impactIndicators, outcomes }.
      return {
        impacts, t1: impactIndicators, areas: outcomeList,
        impact: impacts[0] || null, impactIndicators, outcomes: outcomeList,
      };
    },
    staleTime: 120_000,
  });
}

export function usePIRSIndicators(fiscalYear) {
  return useQuery({
    queryKey: ['plan-nodes', 'pirs-indicators', fiscalYear],
    queryFn: async () => {
      const [t3, t4] = await Promise.all([
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_INDICATOR', tier_id: 3, fiscal_year: fiscalYear } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_INDICATOR', tier_id: 4, fiscal_year: fiscalYear } }),
      ]);
      return [...(Array.isArray(t3.data) ? t3.data : []), ...(Array.isArray(t4.data) ? t4.data : [])];
    },
    staleTime: 120_000,
  });
}

export function usePlanOutcomeData() {
  return useQuery({
    queryKey: ['plan-nodes', 'plan-outcome'],
    queryFn: async () => {
      const [o, t1] = await Promise.all([
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME' } }),
        api.get('/plan-nodes', { params: { node_type: 'OUTCOME_INDICATOR', tier_id: 1 } }),
      ]);
      return { outcomes: o.data||[], t1: t1.data||[] };
    },
    staleTime: 120_000,
  });
}

async function fetchSpecificActivityData(fiscalYear) {
  const [s, b, t3, t4, d] = await Promise.all([
    api.get('/plan-nodes', { params: { node_type: 'SPECIFIC_ACTIVITY', fiscal_year: fiscalYear } }),
    api.get('/plan-nodes', { params: { node_type: 'BROAD_ACTIVITY', fiscal_year: fiscalYear } }),
    api.get('/plan-nodes', { params: { node_type: 'OUTCOME_INDICATOR', tier_id: 3, fiscal_year: fiscalYear } }),
    api.get('/plan-nodes', { params: { node_type: 'OUTCOME_INDICATOR', tier_id: 4, fiscal_year: fiscalYear } }),
    api.get('/admin/division-codes').catch(() => ({ data: [] })),
  ]);
  return { specifics: s.data||[], broads: b.data||[], t3: t3.data||[], t4: t4.data||[], divisions: d.data||[] };
}

export function useSpecificActivityData(fiscalYear) {
  return useQuery({
    queryKey: ['plan-nodes', 'specific-activity', fiscalYear],
    queryFn: () => fetchSpecificActivityData(fiscalYear),
    staleTime: 120_000,
  });
}
