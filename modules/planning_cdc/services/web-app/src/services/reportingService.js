import api from './api';
const unwrap = (p) => p.then((r) => r.data);

/**
 * API client for reporting periods and the per-division indicator reports.
 *
 * @example
 * const periods = await reportingService.getPeriods({ fiscal_year: '2026' });
 */
export const reportingService = {
  getPeriods: (params) => unwrap(api.get('/reporting/periods', { params })),

  // Indicator Division Reports (multi-division indicator reporting)
  getIndicatorDivisionReport: (planNodeId, params) =>
    unwrap(api.get(`/reporting/indicator-division-reports/${planNodeId}`, { params })).then((r) => r?.data || r),
  saveIndicatorDivisionReport: (data) => unwrap(api.post('/reporting/indicator-division-reports', data)),
  submitIndicatorDivisionReport: (id) => unwrap(api.post(`/reporting/indicator-division-reports/${id}/submit`)),
  approveIndicatorDivisionReport: (id, comment) =>
    unwrap(api.post(`/reporting/indicator-division-reports/${id}/approve`, { comment })),
};
