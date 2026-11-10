import httpClient from './api';
import { APPROVAL_ENTITIES } from '@rbm/lib/enums';

// Each entity keeps its own approve / reject endpoint, so its rules and
// emails apply when the decision comes from the « decide » page.
const DECIDE = Object.freeze({
  [APPROVAL_ENTITIES.PLAN_NODE]: {
    approve: (id) => httpClient.post(`/plan-nodes/specific-activity/${id}/approve`),
    reject: (id, reason) => httpClient.post(`/plan-nodes/specific-activity/${id}/reject`, { rejection_reason: reason }),
  },
  [APPROVAL_ENTITIES.ACTIVITY_REPORT]: {
    approve: (id) => httpClient.post(`/reporting/activity-reports/${id}/approve`),
    reject: (id, reason) => httpClient.post(`/reporting/activity-reports/${id}/reject`, { reason }),
  },
  [APPROVAL_ENTITIES.INDICATOR_DIVISION_REPORT]: {
    approve: (id) => httpClient.post(`/reporting/indicator-division-reports/${id}/approve`, {}),
    reject: (id, reason) => httpClient.post(`/reporting/indicator-division-reports/${id}/reject`, { reason }),
  },
});

/**
 * « Decide from the email » API (D-20261105-10): read a step, then approve
 * or reject its item through the item's own endpoint.
 *
 * @example const { data } = await decideApi.step(311);
 */
export const decideApi = {
  step: (id) => httpClient.get(`/approvals/steps/${id}`),
  /** `decision` is 'approve' or 'reject' (reason required to reject). */
  decide: ({ entityType, entityId, decision, reason }) => {
    const route = DECIDE[entityType];
    if (!route) return Promise.reject(new Error('This item cannot be decided from this page'));
    return decision === 'reject' ? route.reject(entityId, reason) : route.approve(entityId);
  },
};
