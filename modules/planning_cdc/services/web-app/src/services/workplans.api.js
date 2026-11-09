// ── Workplans browse-page API service ──
// All URLs used by pages/Workplans.jsx live here. Components/hooks never
// call axios directly (CHARTER §8). Extracted from Workplans.jsx during the
// T-cohort migration (D-20260416-16, task #22).

import httpClient from './api';

export const workplansApi = {
  /**
   * List plan_nodes filtered by node_type / fiscal_year / tier_id. The browse
   * page issues 6 calls in parallel (broads, specifics, outcome areas, T2/T3/T4
   * indicators) — the hook composes the result.
   *
   * @param {{ node_type: string, fiscal_year: string|number, tier_id?: 1|2|3|4 }} params
   * @returns {Promise<object>}
   * @example
   * const res = await workplansApi.listPlanNodes({ node_type: NODE_TYPES.BROAD_ACTIVITY, fiscal_year: '2026' });
   */
  listPlanNodes: (params) => httpClient.get('/plan-nodes', { params }),
};
