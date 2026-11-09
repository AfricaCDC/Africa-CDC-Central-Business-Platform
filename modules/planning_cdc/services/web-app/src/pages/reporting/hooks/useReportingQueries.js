/* eslint-disable complexity -- composite queryFn in useDivisionIndicatorsData (pre-existing) */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NODE_TYPES } from '@rbm/lib/enums';
import { reportingApi } from '../../../services/reporting.api';
import { reviewSubmissionsApi } from '../../../services/reviewSubmissions.api';
import { reportingService } from '../../../services/reportingService';
import { staffService } from '../../../services/staffService';

const QUARTERLY_DASHBOARD_KEY = (fy, q) => ['quarterly-dashboard', fy, q];
const ACTIVITY_REPORTS_KEY = (q, fy) => ['activity-reports', q, fy];
const DIV_INDICATORS_KEY = (fy, div) => ['division-indicators', fy, div || null];
const IND_REPORT_FORM_KEY = (id, q, fy) => ['indicator-report-form', String(id), q, fy];

const STALE_LIST = 60_000;

// ── Queries ────────────────────────────────────────────────────────

/**
 * ReportingPage — all reporting periods (for the period selector).
 *
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 */
export function useReportingPeriods() {
  return useQuery({
    queryKey: ['reporting-periods'],
    queryFn: async () => {
      const periods = await reportingService.getPeriods();
      return Array.isArray(periods) ? periods : [];
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * QuarterlyDashboardPage — per-division reporting completeness for a quarter.
 *
 * @param {{ fiscalYear: string, quarter: string }} p
 */
export function useQuarterlyDashboard({ fiscalYear, quarter }) {
  return useQuery({
    queryKey: QUARTERLY_DASHBOARD_KEY(fiscalYear, quarter || '__active__'),
    queryFn: async () => {
      const params = {};
      if (fiscalYear) params.fiscal_year = fiscalYear;
      if (quarter) params.quarter = quarter;
      const res = await reportingApi.getQuarterlyDashboard(params);
      return res.data || res;
    },
    enabled: Boolean(fiscalYear),
    staleTime: 5 * 60_000,
    keepPreviousData: true,
  });
}

/**
 * DivisionQuarterlySummaryPage — owned + contributed indicators, KPIs and the
 * narrative activity report for one division × fiscal year × quarter (VH-6).
 *
 * @param {{ divisionCode: string, fiscalYear: string, quarter: string }} p
 */
export function useDivisionQuarterlySummary({ divisionCode, fiscalYear, quarter }) {
  return useQuery({
    queryKey: ['division-quarterly-summary', divisionCode || null, fiscalYear, quarter],
    queryFn: async () => {
      const params = {};
      if (fiscalYear) params.fiscal_year = fiscalYear;
      if (quarter) params.quarter = quarter;
      const res = await reportingApi.getDivisionQuarterlySummary(divisionCode, params);
      return res.data || res;
    },
    enabled: Boolean(divisionCode && fiscalYear),
    staleTime: 5 * 60_000,
    keepPreviousData: true,
  });
}

/**
 * ActivityReportPage — broads + specifics + activity-reports for one quarter.
 * Division scoping is done in the page via useMemo (not here).
 *
 * @param {{ quarter: string, fiscalYear: string }} p
 */
export function useActivityReportsData({ quarter, fiscalYear }) {
  return useQuery({
    queryKey: ACTIVITY_REPORTS_KEY(quarter, fiscalYear),
    queryFn: async () => {
      const [bRes, sRes, rRes] = await Promise.all([
        reviewSubmissionsApi.listPlanNodes({ node_type: NODE_TYPES.BROAD_ACTIVITY, fiscal_year: fiscalYear }),
        reviewSubmissionsApi.listPlanNodes({ node_type: NODE_TYPES.SPECIFIC_ACTIVITY, fiscal_year: fiscalYear }),
        reviewSubmissionsApi.listActivityReports({ quarter, fiscal_year: fiscalYear }),
      ]);
      return {
        broads: Array.isArray(bRes.data) ? bRes.data : [],
        specifics: Array.isArray(sRes.data) ? sRes.data : [],
        reports: Array.isArray(rRes.data) ? rRes.data : [],
      };
    },
    enabled: Boolean(quarter && fiscalYear),
    staleTime: STALE_LIST,
  });
}

/**
 * ActivityReportFormPage — activity + staff, and (edit mode) the report.
 *
 * @param {{ activityId: string|number, reportId?: string|number|null }} p
 */
export function useActivityReportForm({ activityId, reportId }) {
  return useQuery({
    queryKey: ['activity-report-form', String(activityId), reportId ? String(reportId) : 'new'],
    queryFn: async () => {
      const [actRes, reportRes, staffRes] = await Promise.all([
        reportingApi.getPlanNode(activityId),
        reportId
          ? reportingApi.getActivityReport(reportId).catch(() => ({ data: null }))
          : Promise.resolve({ data: null }),
        staffService.getAll({ limit: 500 }).catch(() => ({ data: [] })),
      ]);
      const staff = Array.isArray(staffRes?.data) ? staffRes.data : (Array.isArray(staffRes) ? staffRes : []);
      return { activity: actRes.data || null, report: reportRes.data || null, staff };
    },
    enabled: Boolean(activityId),
    staleTime: STALE_LIST,
  });
}

/**
 * DivisionActivityReportPage — T3+T4 indicators, reporting periods and the
 * division-codes reference. The reports come from indicator_division_reports
 * (useIndicatorDivisionReportsList). Division scoping and main/contrib
 * detection are done in the page.
 *
 * @param {{ fiscalYear: string }} p
 */
export function useDivisionIndicatorsData({ fiscalYear }) {
  return useQuery({
    queryKey: DIV_INDICATORS_KEY(fiscalYear, null),
    queryFn: async () => {
      const [bRes, sRes, t3Res, t4Res, pRes, dRes] = await Promise.all([
        reviewSubmissionsApi.listPlanNodes({ node_type: NODE_TYPES.BROAD_ACTIVITY, fiscal_year: fiscalYear }),
        reviewSubmissionsApi.listPlanNodes({ node_type: NODE_TYPES.SPECIFIC_ACTIVITY, fiscal_year: fiscalYear }),
        reviewSubmissionsApi.listPlanNodes({ node_type: NODE_TYPES.OUTCOME_INDICATOR, tier_id: 3, fiscal_year: fiscalYear }),
        reviewSubmissionsApi.listPlanNodes({ node_type: NODE_TYPES.OUTCOME_INDICATOR, tier_id: 4, fiscal_year: fiscalYear }),
        reportingApi.listReportingPeriods({ fiscal_year: fiscalYear }).catch(() => ({ data: [] })),
        reviewSubmissionsApi.listDivisionCodes().catch(() => ({ data: [] })),
      ]);
      return {
        broads: Array.isArray(bRes.data) ? bRes.data : [],
        specifics: Array.isArray(sRes.data) ? sRes.data : [],
        t3: Array.isArray(t3Res.data) ? t3Res.data : [],
        t4: Array.isArray(t4Res.data) ? t4Res.data : [],
        periods: Array.isArray(pRes.data) ? pRes.data : (pRes.data?.data || []),
        divisions: Array.isArray(dRes.data) ? dRes.data : (dRes.data?.data || dRes.data || []),
      };
    },
    enabled: Boolean(fiscalYear),
    staleTime: STALE_LIST,
  });
}

/**
 * QuarterlyReportFormPage — load the indicator (its report comes from useDivisionReport).
 *
 * @param {{ indicatorId: string|number, quarter: string, fiscalYear: string }} p
 */
export function useIndicatorReportForm({ indicatorId, quarter, fiscalYear }) {
  return useQuery({
    queryKey: IND_REPORT_FORM_KEY(indicatorId, quarter, fiscalYear),
    queryFn: async () => {
      const indRes = await reportingApi.getPlanNode(indicatorId);
      return { indicator: indRes.data || null };
    },
    enabled: Boolean(indicatorId && quarter && fiscalYear),
    staleTime: STALE_LIST,
  });
}

// ── Mutations ──────────────────────────────────────────────────────

/** ActivityReportFormPage — create (POST) or update (PUT /:id). */
export function useSaveActivityReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, payload }) => (reportId
      ? reportingApi.updateActivityReport(reportId, payload)
      : reportingApi.saveActivityReport(payload)),
    onSuccess: () => {
      // The ['activity-report-form'] prefix already covers every per-activity key.
      qc.invalidateQueries({ queryKey: ['activity-report-form'] });
      qc.invalidateQueries({ queryKey: ['activity-reports'] });
    },
  });
}

/** ActivityReportFormPage — submit for approval (engine-first backend). */
export function useSubmitActivityReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reportId) => reportingApi.submitActivityReport(reportId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activity-report-form'] });
      qc.invalidateQueries({ queryKey: ['activity-reports'] });
    },
  });
}

/** ActivityReportFormPage — reviewer approves a submitted report. */
export function useApproveActivityReportFromForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reportId) => reportingApi.approveActivityReport(reportId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activity-report-form'] });
      qc.invalidateQueries({ queryKey: ['activity-reports'] });
    },
  });
}

/**
 * Users a report can be given to (admin / M&E only, D-20261013-03).
 *
 * @param {boolean} enabled — only fetch when the change dialog is open
 * @returns {import('@tanstack/react-query').UseQueryResult<Array<{id:number,name:string,email:string}>>}
 */
export function useReportPreparers(enabled) {
  return useQuery({
    queryKey: ['activity-report-preparers'],
    queryFn: async () => {
      const res = await reportingApi.listReportPreparers();
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: Boolean(enabled),
    staleTime: 5 * 60_000,
  });
}

/** ActivityReportFormPage — give a report to another preparer (history kept). */
export function useChangeActivityReportPreparer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, userId, reason }) =>
      reportingApi.changeActivityReportPreparer(reportId, { user_id: userId, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activity-report-form'] });
      qc.invalidateQueries({ queryKey: ['activity-reports'] });
    },
  });
}

/**
 * Indicator reports (indicator_division_reports) of the divisions on the
 * division page. A query, not an effect: a slow answer for a previous
 * selection can no longer overwrite the current one.
 *
 * @param {string[]} divisionCodes
 * @param {string} fiscalYear
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 */
export function useIndicatorDivisionReportsList(divisionCodes, fiscalYear) {
  return useQuery({
    queryKey: ['indicator-division-reports', divisionCodes, fiscalYear],
    queryFn: async () => {
      const res = await reportingApi.listIndicatorDivisionReports(divisionCodes, fiscalYear);
      if (Array.isArray(res.data)) return res.data;
      return Array.isArray(res.data?.data) ? res.data.data : [];
    },
    enabled: divisionCodes.length > 0 && Boolean(fiscalYear),
    staleTime: 60 * 1000,
    keepPreviousData: true,
  });
}

/**
 * Indicators the MAIN division marked not applicable, per quarter
 * (D-20261013-10): contributors show them as N/A too.
 *
 * @param {string} fiscalYear
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 */
export function useOwnerNotApplicable(fiscalYear) {
  return useQuery({
    queryKey: ['indicator-division-reports', 'owner-not-applicable', fiscalYear],
    queryFn: async () => {
      const res = await reportingApi.listOwnerNotApplicable(fiscalYear);
      if (Array.isArray(res.data)) return res.data;
      return Array.isArray(res.data?.data) ? res.data.data : [];
    },
    enabled: Boolean(fiscalYear),
    staleTime: 60 * 1000,
  });
}

/** Delete a draft activity report; refreshes every list that may show it. */
export function useDeleteActivityReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reportId) => reportingApi.deleteActivityReport(reportId),
    onSuccess: () => {
      // Drop, don't refetch: the open form would re-read a report that is gone.
      qc.removeQueries({ queryKey: ['activity-report-form'] });
      qc.invalidateQueries({ queryKey: ['activity-reports'] });
      qc.invalidateQueries({ queryKey: ['review-activity-reports'] });
    },
  });
}

// ── New multi-division reporting hooks ──────────────────────────────

/** Fetch user's report + all division reports + history for an indicator. */
export function useDivisionReport({ planNodeId, quarter, fiscalYear, divisionCode }) {
  return useQuery({
    queryKey: ['div-report', String(planNodeId), quarter, fiscalYear, divisionCode],
    queryFn: () => reportingService.getIndicatorDivisionReport(planNodeId, {
      quarter, fiscal_year: fiscalYear, division_code: divisionCode,
    }),
    enabled: Boolean(planNodeId && quarter && fiscalYear && divisionCode),
    staleTime: 30_000,
  });
}

/** Save draft to indicator_division_reports. */
export function useSaveDivisionReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => reportingService.saveIndicatorDivisionReport(payload),
    onSuccess: (_d, payload) => {
      qc.invalidateQueries({ queryKey: ['div-report', String(payload.plan_node_id)] });
      qc.invalidateQueries({ queryKey: ['division-indicators'] });
    },
  });
}

/** Submit a division report. */
export function useSubmitDivisionReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reportId) => reportingService.submitIndicatorDivisionReport(reportId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['div-report'] });
      qc.invalidateQueries({ queryKey: ['division-indicators'] });
    },
  });
}

