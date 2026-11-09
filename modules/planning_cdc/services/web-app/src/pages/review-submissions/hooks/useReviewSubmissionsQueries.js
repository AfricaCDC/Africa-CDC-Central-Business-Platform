import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NODE_TYPES, STATUSES } from '@rbm/lib/enums';
import { reviewSubmissionsApi } from '../../../services/reviewSubmissions.api';

const REVIEW_QUEUE_KEY = (q, fy, divs) => ['review-indicator-queue', String(q), String(fy), Array.isArray(divs) ? divs.slice().sort().join(',') : (divs || null)];
const ALL_REPORTS_KEY = (q, fy, divs) => ['review-indicator-all', String(q), String(fy), Array.isArray(divs) ? divs.slice().sort().join(',') : (divs || null)];
const ACT_REVIEW_KEY = ['review-activity-reports', STATUSES.SUBMITTED];
const DISPUTES_KEY = ['review-activity-reports', STATUSES.NOT_APPLICABLE];
const AWAITING_KEY = ['review-awaiting-counts'];
const DIVISION_CODES_KEY = ['admin-division-codes'];

const STALE_LIST = 60 * 1000;
const STALE_REF = 30 * 60 * 1000;

/**
 * Merge activity-report and indicator-division-report dispute rows into one
 * list, tagged by `dispute_type` and normalized to a shared `.id` field
 * (indicator rows come back with `report_id`, not `id`).
 */
function mergeDisputeSources(actRows, indRows) {
  const activity = (Array.isArray(actRows) ? actRows : []).map((r) => ({
    ...r,
    // eslint-disable-next-line no-restricted-syntax -- page-local dispute_type tag (which API this row came from), not an ENTITY_TYPES/ENTITY_TABLES reference
    dispute_type: 'ACTIVITY',
  }));
  const indicator = (Array.isArray(indRows) ? indRows : []).map((r) => ({
    ...r,
    id: r.report_id,
    // eslint-disable-next-line no-restricted-syntax -- same page-local dispute_type tag, see above
    dispute_type: 'INDICATOR',
  }));
  return [...activity, ...indicator];
}

/**
 * Queue of indicator-division reports awaiting the current user's approval
 * step. Feeds the "Quarterly Reports" tab on Review Submissions so the user
 * sees the contributor-chain submissions that actually need their action.
 *
 * @param {{ quarter: string, fiscalYear: string|number }} params
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export function useIndicatorReviewQueue({ quarter, fiscalYear, divisionCode, divisionCodes }) {
  // Accept either a single `divisionCode` or an array `divisionCodes`.
  // When an array is passed, join it on the wire so the backend can
  // filter reports by any-of-these divisions (used by the "All my
  // divisions" switcher state).
  const effectiveList = Array.isArray(divisionCodes) ? divisionCodes.filter(Boolean) : (divisionCode ? [divisionCode] : []);
  return useQuery({
    queryKey: REVIEW_QUEUE_KEY(quarter, fiscalYear, effectiveList),
    queryFn: async () => {
      const params = { quarter, fiscal_year: fiscalYear };
      if (effectiveList.length) params.division = effectiveList.join(',');
      const res = await reviewSubmissionsApi.listIndicatorReviewQueue(params);
      // Response interceptor unwraps `{success, data}` so `res.data` is the array.
      if (Array.isArray(res.data)) return res.data;
      if (Array.isArray(res.data?.data)) return res.data.data;
      return [];
    },
    enabled: Boolean(quarter && fiscalYear),
    staleTime: STALE_LIST,
  });
}

/**
 * Admin/M&E oversight view: every indicator-division report regardless
 * of status.
 */
export function useAllIndicatorReports({ quarter, fiscalYear, divisionCodes, enabled = true }) {
  const effectiveList = Array.isArray(divisionCodes) ? divisionCodes.filter(Boolean) : [];
  return useQuery({
    queryKey: ALL_REPORTS_KEY(quarter, fiscalYear, effectiveList),
    queryFn: async () => {
      const params = { quarter, fiscal_year: fiscalYear };
      if (effectiveList.length) params.division = effectiveList.join(',');
      const res = await reviewSubmissionsApi.listAllIndicatorReports(params);
      if (Array.isArray(res.data)) return res.data;
      if (Array.isArray(res.data?.data)) return res.data.data;
      return [];
    },
    enabled: Boolean(enabled && quarter && fiscalYear),
    staleTime: STALE_LIST,
  });
}

/**
 * Aggregate awaiting-action counts shown in the page hero. Admin-only;
 * gracefully degrades to zeros if any sub-call fails (matches prior `.catch`
 * fallback behaviour).
 *
 * @param {boolean} isAdmin
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export function useAwaitingCounts(isAdmin) {
  return useQuery({
    queryKey: AWAITING_KEY,
    queryFn: async () => {
      const [specRes, actDispRes, indDispRes] = await Promise.all([
        reviewSubmissionsApi.listPlanNodes({ node_type: NODE_TYPES.SPECIFIC_ACTIVITY, scope: 'my_division_review' }).catch(() => ({ data: [] })),
        reviewSubmissionsApi.listActivityReports({ status: STATUSES.NOT_APPLICABLE }).catch(() => ({ data: [] })),
        reviewSubmissionsApi.listAllIndicatorReports({ status: STATUSES.NOT_APPLICABLE }).catch(() => ({ data: [] })),
      ]);
      return {
        specifics: Array.isArray(specRes.data) ? specRes.data : [],
        disputes: mergeDisputeSources(actDispRes.data, indDispRes.data),
      };
    },
    enabled: Boolean(isAdmin),
    staleTime: STALE_LIST,
  });
}

/**
 * Lazy-loaded full disputes list. Only fetched when the user opens the
 * Disputes tab — the awaiting-counts hook seeds the count separately.
 *
 * @param {boolean} enabled
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export function useDisputes(enabled) {
  return useQuery({
    queryKey: DISPUTES_KEY,
    queryFn: async () => {
      const [actRes, indRes] = await Promise.all([
        reviewSubmissionsApi.listActivityReports({ status: STATUSES.NOT_APPLICABLE }).catch(() => ({ data: [] })),
        reviewSubmissionsApi.listAllIndicatorReports({ status: STATUSES.NOT_APPLICABLE }).catch(() => ({ data: [] })),
      ]);
      return mergeDisputeSources(actRes.data, indRes.data);
    },
    enabled: Boolean(enabled),
    staleTime: STALE_LIST,
  });
}

/**
 * Division-codes reference list for the dispute reassign modal. Only fetched
 * when the Disputes tab opens.
 *
 * @param {boolean} enabled
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export function useDivisionCodes(enabled) {
  return useQuery({
    queryKey: DIVISION_CODES_KEY,
    queryFn: async () => {
      const res = await reviewSubmissionsApi.listDivisionCodes().catch(() => ({ data: [] }));
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: Boolean(enabled),
    staleTime: STALE_REF,
  });
}

/**
 * Activity-reports awaiting approval (for the Activity Reports review tab).
 *
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export function useActivityReportsForReview(status = STATUSES.SUBMITTED) {
  return useQuery({
    queryKey: [ACT_REVIEW_KEY[0], status],
    queryFn: async () => {
      const res = await reviewSubmissionsApi.listActivityReports({ status }).catch(() => ({ data: [] }));
      return Array.isArray(res.data) ? res.data : [];
    },
    staleTime: STALE_LIST,
  });
}

/**
 * Approve a row from the new contributor-chain queue
 * (`indicator_division_reports`) through the workflow approve endpoint.
 * Invalidates both queues after success.
 *
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useApproveIndicatorDivisionReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (row) => reviewSubmissionsApi.approveIndicatorDivisionReport(row.report_id, ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-indicator-queue'] });
      queryClient.invalidateQueries({ queryKey: ['review-indicator-all'] });
      queryClient.invalidateQueries({ queryKey: AWAITING_KEY });
    },
  });
}

/**
 * Approve an activity report (Activity Reports review tab). Optimistically
 * filters the row out of the cached list on success.
 *
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useApproveActivityReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => reviewSubmissionsApi.approveActivityReport(id),
    onSuccess: (_data, id) => {
      queryClient.setQueryData(ACT_REVIEW_KEY, (prev) =>
        Array.isArray(prev) ? prev.filter((r) => r.id !== id) : prev
      );
      queryClient.invalidateQueries({ queryKey: AWAITING_KEY });
    },
  });
}

/**
 * Reject an activity report with a reason (Activity Reports review tab).
 * Optimistically filters the row out of the cached list on success.
 *
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useRejectActivityReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }) => reviewSubmissionsApi.rejectActivityReport(id, reason),
    onSuccess: (_data, { id }) => {
      queryClient.setQueryData(ACT_REVIEW_KEY, (prev) =>
        Array.isArray(prev) ? prev.filter((r) => r.id !== id) : prev
      );
      queryClient.invalidateQueries({ queryKey: AWAITING_KEY });
    },
  });
}

/**
 * Resolve an ownership dispute by reassigning the activity to a new division
 * AND seeding a fresh DRAFT activity report. Removes the dispute row from the
 * cached list on success.
 *
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useReassignDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ row, newDivision }) => {
      await reviewSubmissionsApi.reassignSpecificActivity(row.plan_node_id, newDivision);
      await reviewSubmissionsApi.createActivityReport({
        plan_node_id: row.plan_node_id,
        status: STATUSES.DRAFT,
        quarter: row.quarter,
        fiscal_year: row.fiscal_year,
      });
    },
    onSuccess: (_data, { row }) => {
      // id alone isn't unique across the merged cache — activity_reports.id and
      // indicator_division_reports.report_id are independent sequences and can
      // collide — so match on (id, dispute_type) together.
      queryClient.setQueryData(DISPUTES_KEY, (prev) =>
        Array.isArray(prev) ? prev.filter((x) => !(x.id === row.id && x.dispute_type === row.dispute_type)) : prev
      );
      queryClient.invalidateQueries({ queryKey: AWAITING_KEY });
    },
  });
}

/**
 * Resolve an ACTIVITY ownership dispute by dismissing it — the activity stays
 * with its current division and the admin endpoint voids its NOT_APPLICABLE
 * rows. Removes the dispute row from the cached list on success.
 *
 * Previously this POSTed a DRAFT report and relied on the upsert to flip the NA
 * row; POST is create-only since D-20260818-01, so that only inserted a junk
 * draft while the dispute stood.
 *
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useDismissDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ row }) => reviewSubmissionsApi.dismissActivityDispute(row.plan_node_id),
    onSuccess: (_data, { row }) => {
      // id alone isn't unique across the merged cache — activity_reports.id and
      // indicator_division_reports.report_id are independent sequences and can
      // collide — so match on (id, dispute_type) together.
      queryClient.setQueryData(DISPUTES_KEY, (prev) =>
        Array.isArray(prev) ? prev.filter((x) => !(x.id === row.id && x.dispute_type === row.dispute_type)) : prev
      );
      queryClient.invalidateQueries({ queryKey: AWAITING_KEY });
    },
  });
}

/**
 * Resolve an indicator ownership dispute by dismissing it — resets the
 * report to DRAFT via the admin-override endpoint (reuses the existing
 * admin-set-status route; no dedicated dismiss endpoint needed). Removes
 * the dispute row from the cached list on success.
 *
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useDismissIndicatorDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ row, note }) =>
      reviewSubmissionsApi.adminSetIndicatorDivisionReportStatus(row.id, STATUSES.DRAFT, note),
    onSuccess: (_data, { row }) => {
      // id alone isn't unique across the merged cache — activity_reports.id and
      // indicator_division_reports.report_id are independent sequences and can
      // collide — so match on (id, dispute_type) together.
      queryClient.setQueryData(DISPUTES_KEY, (prev) =>
        Array.isArray(prev) ? prev.filter((x) => !(x.id === row.id && x.dispute_type === row.dispute_type)) : prev
      );
      queryClient.invalidateQueries({ queryKey: AWAITING_KEY });
    },
  });
}
