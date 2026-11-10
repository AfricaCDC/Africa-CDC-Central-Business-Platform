// ── Review-Submissions page API service ──
// All URLs used by pages/ReviewSubmissionsPage.jsx live here. Components/hooks
// never call axios directly (CHARTER §8). Extracted from
// ReviewSubmissionsPage.jsx during the T-cohort migration (D-20260416-18,
// task #22).

import httpClient from './api';

export const reviewSubmissionsApi = {

  /**
   * Indicator-division reports awaiting the current user's approval step.
   * Non-admins see only reports they are the pending approver on.
   * Admins (QUARTERLY_REPORT:approve:all) see every IN_REVIEW report.
   */
  listIndicatorReviewQueue: (params) => httpClient.get('/reporting/indicator-division-reports/review-queue', { params }),

  /**
   * Admin / M&E oversight view: every indicator-division report for the
   * given (quarter, fiscal_year) regardless of status.
   */
  listAllIndicatorReports: (params) => httpClient.get('/reporting/indicator-division-reports/all', { params }),

  /**
   * Approve one indicator-division report (contributor-chain workflow).
   * Walks the next pending step forward; admins with reports:approve:all
   * may also use this to bypass-approve any pending step.
   */
  approveIndicatorDivisionReport: (reportId, comment) =>
    httpClient.post(`/reporting/indicator-division-reports/${reportId}/approve`, { comment }),

  /**
   * List plan_nodes filtered by node_type, fiscal_year, tier_id, scope. Used by
   * the page to load tier-3/tier-4 indicator metadata for the report table and
   * the awaiting-counts banner (specific-activity scope).
   *
   * @param {object} params
   * @returns {Promise<object>}
   */
  listPlanNodes: (params) => httpClient.get('/plan-nodes', { params }),

  /**
   * List activity reports for the page tabs. Used in three places: (1) global
   * dispute counts (NOT_APPLICABLE status), (2) lazy-loaded disputes table,
   * (3) ActivityReportsReviewTab (SUBMITTED status).
   *
   * @param {{ status?: string }} params
   * @returns {Promise<object>}
   */
  listActivityReports: (params) => httpClient.get('/reporting/activity-reports', { params }),

  /**
   * List division codes for the dispute reassign dropdown (admin only).
   *
   * @returns {Promise<object>}
   */
  listDivisionCodes: () => httpClient.get('/admin/division-codes'),

  /**
   * Approve one activity report. Used by ActivityReportsReviewTab.
   *
   * @param {string|number} id
   * @returns {Promise<object>}
   */
  approveActivityReport: (id) => httpClient.post(`/reporting/activity-reports/${id}/approve`),

  /**
   * Reject one activity report with a reason. Used by ActivityReportsReviewTab.
   *
   * @param {string|number} id
   * @param {string} reason
   * @returns {Promise<object>}
   */
  rejectActivityReport: (id, reason) =>
    httpClient.post(`/reporting/activity-reports/${id}/reject`, { reason }),

  /**
   * Reassign a specific activity to a different division. Used by the dispute
   * resolution modal (admin only).
   *
   * @param {string|number} planNodeId
   * @param {string} responsibleDivisionCode
   * @returns {Promise<object>}
   */
  reassignSpecificActivity: (planNodeId, responsibleDivisionCode) =>
    httpClient.patch(`/plan-nodes/specific-activity/${planNodeId}`, {
      responsible_division_code: responsibleDivisionCode,
    }),

  /**
   * Create a fresh DRAFT activity report record. Used by the reassign branch
   * of the dispute resolution modal to seed a report for the new division.
   * The dismiss branch uses `dismissActivityDispute` instead (POST is
   * create-only since D-20260818-01, so it can no longer flip the NA row).
   *
   * @param {{ plan_node_id: string|number, status: string, quarter: string, fiscal_year: string|number }} payload
   * @returns {Promise<object>}
   */
  createActivityReport: (payload) =>
    httpClient.post('/reporting/activity-reports', payload),

  /**
   * Dismiss an activity ownership dispute (admin only): voids every
   * NOT_APPLICABLE verdict on the activity so it returns to its current
   * division's queue. Replaces the old "POST a DRAFT and let the upsert flip
   * the NA row" trick, which POST create-only broke (D-20260818-01).
   *
   * @param {string|number} planNodeId — the specific activity, not a report id
   * @returns {Promise<object>}
   * @example await reviewSubmissionsApi.dismissActivityDispute(42);
   */
  dismissActivityDispute: (planNodeId) =>
    httpClient.post(`/reporting/activity-reports/${planNodeId}/dismiss-dispute`),

  /**
   * Admin override: force an indicator-division report to a new status.
   * Used by the Disputes tab's "Dismiss" action for indicator rows —
   * resets a NOT_APPLICABLE report back to DRAFT.
   *
   * @param {string|number} reportId
   * @param {string} status
   * @param {string} [comment]
   * @returns {Promise<object>}
   */
  adminSetIndicatorDivisionReportStatus: (reportId, status, comment) =>
    httpClient.post(`/reporting/indicator-division-reports/${reportId}/admin-set-status`, { status, comment }),

  /**
   * Email every user who holds DRAFT reports (admin). `dryRun: true` only
   * counts them for the preview.
   *
   * @param {{ fiscalYear?: string, quarter?: string, dryRun: boolean }} body
   * @returns {Promise<object>} `{ users_targeted, total_drafts, sample }` or `{ enqueued }`
   * @example
   * const res = await reviewSubmissionsApi.remindDrafts({ fiscalYear: '2026', quarter: 'Q4', dryRun: true });
   */
  remindDrafts: (body) => httpClient.post('/reporting/admin/remind-drafts', body),
};
