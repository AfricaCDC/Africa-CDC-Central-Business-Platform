import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NODE_TYPES, STATUSES } from '@rbm/lib/enums';
import { workplansApi } from '../../../services/workplans.api';

const ROWS_KEY = (fy) => ['workplan-rows', String(fy)];
const STALE_ROWS = 60 * 1000;

/**
 * Compose the workplan browse-page row set: BROAD activities (with their
 * SPECIFIC children grafted as `tasks`) bucketed under their parent OUTCOME
 * area, for one fiscal year.
 *
 * Returns `{ activities, outcomesList, indicatorsByArea }`. `outcomesList[]`
 * carries the `strategicPlan` (P1/EA/… chip, server-enriched) and `impact`
 * (nearest T1 ancestor) so the browse page can show the full chain —
 * strategic priority area, impact, outcome indicator/tier 3-4, broad
 * activity, specific activity. `activities[].status` and `percent_complete`
 * are seeded to local-only defaults (no API yet).
 *
 * @param {string|number} fiscalYear
 * @returns {import('@tanstack/react-query').UseQueryResult}
 * @example
 * const { data, isLoading } = useWorkplanRows('2026');
 */
export function useWorkplanRows(fiscalYear) {
  return useQuery({
    queryKey: ROWS_KEY(fiscalYear),
    queryFn: async () => {
      const fyParam = { fiscal_year: fiscalYear };
      const [broadRes, specRes, areasRes, impactRes, t2Res, t3Res, t4Res] = await Promise.all([
        workplansApi.listPlanNodes({ node_type: NODE_TYPES.BROAD_ACTIVITY, ...fyParam }),
        workplansApi.listPlanNodes({ node_type: NODE_TYPES.SPECIFIC_ACTIVITY, ...fyParam }),
        workplansApi.listPlanNodes({ node_type: NODE_TYPES.OUTCOME_AREA, ...fyParam }),
        workplansApi.listPlanNodes({ node_type: NODE_TYPES.IMPACT_INDICATOR, ...fyParam }),
        workplansApi.listPlanNodes({ node_type: NODE_TYPES.OUTCOME_INDICATOR, tier_id: 2, ...fyParam }),
        workplansApi.listPlanNodes({ node_type: NODE_TYPES.OUTCOME_INDICATOR, tier_id: 3, ...fyParam }),
        workplansApi.listPlanNodes({ node_type: NODE_TYPES.OUTCOME_INDICATOR, tier_id: 4, ...fyParam }),
      ]);

      const broads = Array.isArray(broadRes.data) ? broadRes.data : [];
      const specifics = Array.isArray(specRes.data) ? specRes.data : [];
      const areas = Array.isArray(areasRes.data) ? areasRes.data : [];
      const impacts = Array.isArray(impactRes.data) ? impactRes.data : [];
      const impactById = {};
      impacts.forEach((i) => { impactById[i.id] = { id: i.id, code: i.code, title: i.title }; });
      const allInds = [
        ...(Array.isArray(t2Res.data) ? t2Res.data : []),
        ...(Array.isArray(t3Res.data) ? t3Res.data : []),
        ...(Array.isArray(t4Res.data) ? t4Res.data : []),
      ];

      const indToArea = {};
      allInds.forEach((i) => { indToArea[i.id] = i.parent_id; });

      const tasksByBroad = {};
      specifics.forEach((s) => {
        if (!tasksByBroad[s.parent_id]) tasksByBroad[s.parent_id] = [];
        tasksByBroad[s.parent_id].push({
          ...s,
          budget_total: s.budget_total_2026,
          responsible_division: s.division?.name || s.responsible_division_code,
          percent_complete: 0,
          status: STATUSES.NOT_STARTED,
        });
      });

      const activities = broads.map((b) => ({
        ...b,
        budget_total: b.budget_total_2026,
        responsible_division: b.division?.name || b.responsible_division_code,
        percent_complete: 0,
        status: STATUSES.NOT_STARTED,
        result_id: indToArea[b.parent_id] || null,
        tasks: tasksByBroad[b.id] || [],
      }));

      const outcomesList = areas.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.title,
        amert_index: a.code,
        // Enriched server-side (attachStrategicPlan) — {sp_code, sp_type, short_name}.
        strategicPlan: a.strategic_plan || null,
        // Nearest T1 ancestor (OUTCOME_AREA.parent_id → IMPACT_INDICATOR).
        impact: impactById[a.parent_id] || null,
      }));

      // H-7: surface the indicator tiers (T2/T3/T4) in the workplan — they were
      // fetched only to map activities to outcome areas and never shown, so the
      // "Project ▸ Workplan" view skipped tiers 3 & 4 entirely. All indicator
      // tiers hang directly off their OUTCOME_AREA (verified live); broad
      // activities hang off their T2 indicator. We group indicators per area and
      // nest each indicator's broad activities under it so the embedding shows.
      const broadsByIndicator = {};
      activities.forEach((a) => {
        if (!broadsByIndicator[a.parent_id]) broadsByIndicator[a.parent_id] = [];
        broadsByIndicator[a.parent_id].push(a);
      });

      const indicatorsByArea = {};
      allInds.forEach((ind) => {
        const areaId = ind.parent_id;
        if (!areaId) return;
        if (!indicatorsByArea[areaId]) indicatorsByArea[areaId] = [];
        indicatorsByArea[areaId].push({
          ...ind,
          // T2 → indent 0, T3 → 1, T4 → 2 (logframe roll-up reads top→bottom).
          level: Math.max(0, (Number(ind.tier_id) || 2) - 2),
          activities: broadsByIndicator[ind.id] || [],
        });
      });
      Object.keys(indicatorsByArea).forEach((k) => {
        indicatorsByArea[k].sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
      });

      return { activities, outcomesList, indicatorsByArea };
    },
    enabled: Boolean(fiscalYear),
    staleTime: STALE_ROWS,
  });
}

/**
 * Returns a patch function `(id, patch) => void` that immutably updates one
 * activity or task row in the cached `useWorkplanRows(fiscalYear)` payload.
 * Used by the inline status-dropdown / progress-input controls — no API call
 * yet, matches existing local-only behaviour.
 *
 * @param {string|number} fiscalYear
 * @returns {(id: string|number, patch: object) => void}
 */
export function useUpdateWorkplanRow(fiscalYear) {
  const queryClient = useQueryClient();
  return (id, patch) => {
    queryClient.setQueryData(ROWS_KEY(fiscalYear), (prev) => {
      if (!prev) return prev;
      const activities = prev.activities.map((a) => {
        if (a.id === id) return { ...a, ...patch };
        if (a.tasks?.length) {
          const tasks = a.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
          return { ...a, tasks };
        }
        return a;
      });
      return { ...prev, activities };
    });
  };
}
