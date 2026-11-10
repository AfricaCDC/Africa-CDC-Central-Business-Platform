// ── Approvals API service ──
// All URLs for the contributor approval chain live here. Components/hooks
// never call axios directly (CHARTER §8). Paths target
// `/api/governance/workflows/*` per spec §5 (D-20260415-05, chunk 6).

import httpClient from './api';

const BASE = '/governance/workflows';

export const approvalsApi = {
  /**
   * List pending approval steps the caller can act on.
   *
   * @param {object} [params]
   * @param {(1|2|3|'all')} [params.step]
   * @param {string} [params.entityType]
   * @param {string} [params.division]
   * @param {number} [params.page]
   * @param {number} [params.pageSize]
   * @returns {Promise<object>}
   */
  inbox: (params) => httpClient.get(`${BASE}/inbox`, { params }),

  /**
   * Full approval history (completed + in-flight steps) for one report.
   *
   * @param {string} entityType — `ACTIVITY_REPORT`|`INDICATOR_ACTUAL`|`DIVISION_ACTIVITY_REPORT`.
   * @param {string|number} entityId
   * @returns {Promise<object>}
   */
  history: (entityType, entityId) =>
    httpClient.get(`${BASE}/${entityType}/${entityId}/history`),

  /**
   * Approve a pending step. `payload.comment` is optional.
   *
   * @param {string|number} stepId
   * @param {{ comment?: string }} payload
   * @returns {Promise<object>}
   */
  approveStep: (stepId, payload) =>
    httpClient.post(`${BASE}/steps/${stepId}/approve`, payload),

  /**
   * Reject a pending step. `payload.reason` is REQUIRED per spec §2.
   *
   * @param {string|number} stepId
   * @param {{ reason: string }} payload
   * @returns {Promise<object>}
   */
  rejectStep: (stepId, payload) =>
    httpClient.post(`${BASE}/steps/${stepId}/reject`, payload),

  /**
   * Admin bypass — short-circuit to approved/final. Requires `reports.approve`
   * with scope `all` on the backend; `payload.reason` is REQUIRED per spec §2.
   *
   * @param {string|number} instanceId
   * @param {{ reason: string }} payload
   * @returns {Promise<object>}
   */
  adminBypass: (instanceId, payload) =>
    httpClient.post(`${BASE}/${instanceId}/admin-bypass`, payload),
};
