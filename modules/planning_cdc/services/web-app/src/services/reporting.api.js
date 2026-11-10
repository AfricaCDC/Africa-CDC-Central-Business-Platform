// ── Reporting API service ──
// Endpoints for reporting-cluster pages NOT already covered by
// reportingService.js or reviewSubmissions.api.js. Hooks in
// pages/reporting/hooks/useReportingQueries.js consume this file.
// (D-20260416-18+, useEffect migration — reporting cluster)

import httpClient from './api';

/**
 * @example
 * const res = await reportingApi.getPlanNode(42);
 */
export const reportingApi = {
  /** @param {string|number} id */
  getPlanNode: (id) => httpClient.get(`/plan-nodes/${id}`),

  /** @param {string|number} reportId */
  getActivityReport: (reportId) =>
    httpClient.get(`/reporting/activity-reports/${reportId}`),

  /** @param {string|number} reportId */
  submitActivityReport: (reportId) =>
    httpClient.post(`/reporting/activity-reports/${reportId}/submit`),

  /**
   * Create an activity report (always a DRAFT — the backend ignores any
   * `status` in the payload). Distinct from reviewSubmissions.api.createActivityReport
   * which seeds a minimal DRAFT row during dispute resolution.
   *
   * @param {object} payload
   */
  saveActivityReport: (payload) =>
    httpClient.post('/reporting/activity-reports', payload),

  /**
   * Update an existing activity report by primary key (author, DRAFT/REJECTED only).
   *
   * @param {string|number} reportId
   * @param {object} payload
   */
  updateActivityReport: (reportId, payload) =>
    httpClient.put(`/reporting/activity-reports/${reportId}`, payload),

  /** Active users a report can be given to (admin / M&E, D-20261013-03). */
  listReportPreparers: () =>
    httpClient.get('/reporting/activity-report-preparers'),

  /**
   * Give a report to another preparer; the previous one stays on record.
   *
   * @param {string|number} reportId
   * @param {{ user_id: number, reason: string }} payload
   */
  changeActivityReportPreparer: (reportId, payload) =>
    httpClient.post(`/reporting/activity-reports/${reportId}/preparer`, payload),

  /**
   * Indicator reports of one or more divisions for a fiscal year (statuses of the division page).
   * @param {string[]} divisionCodes @param {string} fiscalYear
   */
  listIndicatorDivisionReports: (divisionCodes, fiscalYear) =>
    httpClient.get('/reporting/indicator-division-reports', {
      params: { division_code: divisionCodes.join(','), fiscal_year: fiscalYear },
    }),

  /** N/A set by the main division of each indicator (D-20261013-10). @param {string} fiscalYear */
  listOwnerNotApplicable: (fiscalYear) =>
    httpClient.get('/reporting/indicator-division-reports/owner-not-applicable', { params: { fiscal_year: fiscalYear } }),
  /** Approved activity reports of the quarter behind an indicator, for one unit (D-20261105-12). */
  getActivityEvidence: (indicatorId, { quarter, fiscalYear, divisionCode }) =>
    httpClient.get(`/reporting/indicator-division-reports/${indicatorId}/activity-evidence`, {
      params: { quarter, fiscal_year: fiscalYear, division_code: divisionCode },
    }),

  /** Delete a DRAFT activity report (author or admin). @param {string|number} reportId */
  deleteActivityReport: (reportId) => httpClient.delete(`/reporting/activity-reports/${reportId}`),

  /** @param {string|number} reportId */
  approveActivityReport: (reportId) =>
    httpClient.post(`/reporting/activity-reports/${reportId}/approve`),

  /** @param {{ fiscal_year?: string|number }} [params] */
  listReportingPeriods: (params) =>
    httpClient.get('/reporting/periods', { params }),

  /**
   * Quarterly dashboard — per-division reporting completeness.
   * @param {{ fiscal_year?: string|number, quarter?: string }} [params]
   */
  getQuarterlyDashboard: (params) =>
    httpClient.get('/reporting/quarterly-dashboard', { params }),

  /**
   * Division quarterly summary — owned + contributed indicators, KPIs and the
   * narrative activity report for one division × fiscal year × quarter (VH-6).
   *
   * @param {string} divisionCode
   * @param {{ fiscal_year?: string|number, quarter?: string }} [params]
   */
  getDivisionQuarterlySummary: (divisionCode, params) =>
    httpClient.get(`/reporting/division-quarterly-reports/${divisionCode}`, { params }),
};
