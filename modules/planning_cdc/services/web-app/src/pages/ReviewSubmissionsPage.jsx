/* eslint-disable no-restricted-syntax, complexity, max-lines --
 * Pre-existing violations retained during T-cohort #3 data-layer migration.
 *   no-restricted-syntax: page-local dispute_type tags ('ACTIVITY' / 'INDICATOR'), not entity types
 *   complexity: structural from multi-tab page logic
 *   max-lines: 1624L — page split is a separate follow-up task #50
 * This pragma is a ceiling, not a green light. (D-20260416-18)
 */
import { useMemo, useState, useEffect } from 'react';
import { reviewSubmissionsApi } from '@/services/reviewSubmissions.api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useDivisionFilter from './review-submissions/useDivisionFilter';
import DivisionFilterBar from './review-submissions/DivisionFilterBar';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ExportMenu from '@/components/shared/ExportMenu';
import { exportApi, triggerDownload } from '@/services/export.api';
import { RBAC_MODULES, RBAC_ACTIONS } from '@rbm/lib/rbac';
import { ROLES } from '@rbm/lib/roles';
import { Loader2, Eye, Check, X, AlertTriangle, Star, Flag, ArrowRightLeft, ChevronDown, Send } from 'lucide-react';
import SearchSelect from '@/components/shared/SearchSelect';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveDivision } from '@/contexts/ActiveDivisionContext';
import { usePermissions } from '@/hooks/usePermissions';
import { STATUSES, STATUS_COLORS } from '@rbm/lib/enums';
import SpecificActivityReviewTable from '@/components/reviews/SpecificActivityReviewTable';
import Modal from '@/components/shared/Modal';
import { quarterlyReportPath, QUARTERS, resolveQuarter } from './reporting/activity-report/reportingQuarter';
import { useReportingPeriods } from './reporting/hooks/useReportingQueries';
import { useReportingYear } from './reporting/hooks/useReportingYear';
import {
  useIndicatorReviewQueue,
  useAllIndicatorReports,
  useAwaitingCounts,
  useDisputes,
  useDivisionCodes,
  useActivityReportsForReview,
  useApproveIndicatorDivisionReport,
  useApproveActivityReport,
  useRejectActivityReport,
  useReassignDispute,
  useDismissDispute,
  useDismissIndicatorDispute,
} from './review-submissions/hooks/useReviewSubmissionsQueries';

const BREADCRUMBS = [{ label: 'M&E' }, { label: 'Review Submissions' }];

const FALLBACK_STATUS = STATUS_COLORS[STATUSES.DRAFT];

const REVIEW_TABS = ['reports', 'activities', 'specifics', 'disputes'];

export default function ReviewSubmissionsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  // Year and quarter of the open reporting period, not the clock: Q4 is
  // reviewed in January (D-20261106-01). The quarter tab lives in the URL (?q=).
  const { data: periods = [], isLoading: periodsLoading } = useReportingPeriods();
  const { fiscalYear } = useReportingYear(periods, periodsLoading);
  const quarter = resolveQuarter(searchParams.get('q'), periods, fiscalYear);
  const setQuarter = (q) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('q', q);
    return next;
  }, { replace: true });
  const [filter, setFilter] = useState('ALL');
  const [directorateFilter, setDirectorateFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  // Per-table selection state. Each value is a Set of row keys.
  const [selectedQueueKeys, setSelectedQueueKeys] = useState(() => new Set());
  const [selectedAllKeys, setSelectedAllKeys] = useState(() => new Set());
  const [bulkProgress, setBulkProgress] = useState(null); // { done, total, failed }
  const [bulkConfirm, setBulkConfirm] = useState(null); // { targets, onDone }
  const [remindModalOpen, setRemindModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  // Tab in the URL so the menu can open Activity Reports / Quarterly Reports directly.
  const tab = REVIEW_TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : REVIEW_TABS[0];
  const setTab = (t) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('tab', t);
    return next;
  }, { replace: true });
  const [disputeModal, setDisputeModal] = useState(null);
  const [newDivision, setNewDivision] = useState('');
  const [dismissNote, setDismissNote] = useState('');

  const { can, getScope } = usePermissions();
  const { activeDivision, activeCodes } = useActiveDivision();
  // Whole-quarter report download (same endpoint + RBAC as the Quarterly
  // Dashboard button) — M&E lives on this page during review season.
  const canExport = can(RBAC_MODULES.QUARTERLY_REPORT, RBAC_ACTIONS.EXPORT);
  // Same download for the activity reports of the quarter (activity_report:export).
  const canExportActivities = can(RBAC_MODULES.ACTIVITY_REPORT, RBAC_ACTIONS.EXPORT);
  const runExport = async (fetchFile, fileName) => {
    setIsExporting(true);
    try {
      triggerDownload(await fetchFile(), fileName);
    } catch {
      toast.error('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };
  const handleExportQuarterly = (format) => runExport(
    () => exportApi.quarterlyReport({ fiscalYear, quarter, format, division: exportDivision() }),
    `quarterly-report-${fiscalYear}-${quarter}.${format}`,
  );
  const handleExportActivities = (format) => runExport(
    () => exportApi.activityReport({ fiscalYear, quarter, format, division: exportDivision() }),
    `activity-reports-${fiscalYear}-${quarter}.${format}`,
  );
  // System Admin OR M&E Officer — both hold `reports:approve:all` and can act
  // on any pending step (admin bypass). The legacy `approve_admin_bypass` flag
  // was admin-only and excluded M&E from the bulk-approve UI.
  const isAdmin = getScope('reports', 'approve') === 'all'
    || getScope('reports', 'approve_admin_bypass') === 'all';
  const isHOD = !isAdmin && can('reports', 'approve_step1');
  // When the switcher points to a specific division → use that code.
  // When it is on "All my divisions" (activeDivision=null) → expand to
  // every code the user has in scope (SCI + CT for a dual-membership
  // user like a HOD who is also a member of another directorate).
  const activeDivisionCode = activeDivision?.division_code || null;
  const activeDivisionCodesList = useMemo(() => {
    if (activeDivisionCode) return [activeDivisionCode];
    const set = activeCodes instanceof Set ? Array.from(activeCodes) : [];
    return set.length ? set : (user?.division_code ? [user.division_code] : []);
  }, [activeDivisionCode, activeCodes, user?.division_code]);

  const reviewQueueQuery = useIndicatorReviewQueue({ quarter, fiscalYear, divisionCodes: activeDivisionCodesList });
  const reviewQueue = useMemo(() => reviewQueueQuery.data || [], [reviewQueueQuery.data]);

  // Admin / M&E oversight: full list of reports across divisions regardless
  // of status. Enabled only when the user has system-wide approve rights
  // (SYSTEM_ADMIN or ME_OFFICER — both hold `quarterly_report:approve:all`).
  const allReportsQuery = useAllIndicatorReports({
    quarter, fiscalYear,
    divisionCodes: isAdmin ? [] : activeDivisionCodesList,
    enabled: Boolean(isAdmin || activeDivisionCodesList.length),
  });
  const allReports = useMemo(() => allReportsQuery.data || [], [allReportsQuery.data]);
  const [allReportsFilter, setAllReportsFilter] = useState('ALL');
  // "Only required this quarter" keeps reports whose indicator actually
  // has a positive target for the selected quarter (quarter_target > 0).
  // Indicators with no target (or 0) are out-of-scope for this quarter's
  // reporting — same rule as the Quarterly Dashboard.
  const [onlyRequired, setOnlyRequired] = useState(false);
  const isRequired = (r) => {
    if (!r) return false;
    const t = Number(r.quarter_target);
    return Number.isFinite(t) && t > 0;
  };

  const divisionsQuery = useDivisionCodes(tab === 'disputes' || tab === 'reports');
  const divisions = useMemo(() => divisionsQuery.data || [], [divisionsQuery.data]);
  const divisionNameByCode = useMemo(() => {
    const m = {};
    divisions.forEach((d) => { m[d.code] = d.division_name || d.code; });
    return m;
  }, [divisions]);

  // Directorate dropdown + division→directorate map are derived from the report
  // rows themselves (each row carries the backend-resolved `directorate` name,
  // the same value shown in the Directorate column). We deliberately do NOT walk
  // `division_codes.parent_code` here: that tree is inconsistent for several
  // divisions (e.g. MIS has no parent_code but a free-text directorate, CT has a
  // parent_code but a null directorate name), so the row's own value is the only
  // source that matches what the user sees.
  const dirOptions = useMemo(() => {
    const names = Array.from(new Set([
      ...reviewQueue.map((r) => r.directorate),
      ...allReports.map((r) => r.directorate),
    ].filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return names.map((name) => ({ value: name, label: name }));
  }, [reviewQueue, allReports]);
  const directorateByDivision = useMemo(() => {
    const m = {};
    [...reviewQueue, ...allReports].forEach((r) => {
      if (r.division_code && r.directorate) m[r.division_code] = r.directorate;
    });
    return m;
  }, [reviewQueue, allReports]);

  // The downloads follow the division / directorate picked on the page:
  // one division code, else every division of the directorate, else all.
  function exportDivision() {
    if (filter !== 'ALL') return filter;
    if (directorateFilter === 'ALL') return undefined;
    return Object.keys(directorateByDivision)
      .filter((code) => directorateByDivision[code] === directorateFilter)
      .join(',') || undefined;
  }

  // Text + directorate + division filter — applied to BOTH the pending queue
  // AND the full oversight list below. `directorateFilter` ('ALL' | <NAME>)
  // matches a row by its resolved directorate name; `filter` is the exact
  // division code; `search` is the free-text input.
  const matchesFilters = useMemo(() => {
    const q = search.trim().toLowerCase();
    const divFilter = filter;
    const dirFilter = directorateFilter;
    return (r) => {
      if (divFilter !== 'ALL' && r.division_code !== divFilter) return false;
      if (dirFilter !== 'ALL' && r.directorate !== dirFilter) return false;
      if (!q) return true;
      const hay = [
        r.indicator_code, r.indicator_title, r.division_code,
        r.sub_first_name, r.sub_last_name, r.sub_email, r.step_label,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    };
  }, [search, filter, directorateFilter]);
  const reviewQueueFiltered = useMemo(
    () => reviewQueue.filter(matchesFilters),
    [reviewQueue, matchesFilters],
  );
  // Shared scope — text search, division filter, and the "Report expected"
  // toggle. The status chips count ON this set, so their numbers follow
  // whatever the user has already filtered out.
  const allReportsScoped = useMemo(
    () => allReports
      .filter(matchesFilters)
      .filter((r) => !onlyRequired || isRequired(r)),
    [allReports, matchesFilters, onlyRequired],
  );
  const allReportsFiltered = useMemo(
    () => allReportsScoped.filter((r) => allReportsFilter === 'ALL' || r.status === allReportsFilter),
    [allReportsScoped, allReportsFilter],
  );

  const awaitingQuery = useAwaitingCounts(isAdmin);
  const specificsCount = awaitingQuery.data?.specifics.length || 0;
  const quarterlyCount = reviewQueue.length;

  const disputesQuery = useDisputes(tab === 'disputes' || isAdmin);
  const disputes = useMemo(
    () => disputesQuery.data ?? awaitingQuery.data?.disputes ?? [],
    [disputesQuery.data, awaitingQuery.data]
  );

  // Contributor-chain approve — used by the queue + all-reports tables (single click and bulk).
  const approveIDRMutation = useApproveIndicatorDivisionReport();
  const reassignMutation = useReassignDispute();
  const dismissMutation = useDismissDispute();
  const dismissIndicatorMutation = useDismissIndicatorDispute();

  // Bulk approve — gated to roles that can act on the queue. Admins can
  // approve any pending step (admin_bypass). HODs can only approve rows
  // assigned to them (approver_id === user.id). Rows with no approver are
  // skipped (need admin re-assignment first).
  const canBulkApprove = isAdmin || isHOD;
  // Queue rows are keyed by report+step (one row per pending step). All-Reports
  // rows are unique by report_id (no per-step join), so we key them differently.
  const queueRowKey = (r) => `${r.report_id}-${r.step_id}`;
  const allRowKey   = (r) => String(r.report_id);
  const isQueueRowApprovable = (r) => {
    if (isAdmin) return true; // admin_bypass — assigned or not
    if (isHOD) return r.approver_id === user?.id;
    return false;
  };
  // In the All-Reports table only IN_REVIEW rows have a pending step that can
  // be approved. Admin can act on any of them; HOD only on rows assigned to
  // them (carried as approver_id by the backend list).
  const isAllRowApprovable = (r) => {
    if (r.status !== 'IN_REVIEW') return false;
    if (isAdmin) return true;
    if (isHOD) return r.approver_id === user?.id;
    return false;
  };

  const approvableQueueRows = useMemo(
    () => reviewQueueFiltered.filter(isQueueRowApprovable),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reviewQueueFiltered, isAdmin, isHOD, user?.id],
  );
  const approvableAllRows = useMemo(
    () => allReportsFiltered.filter(isAllRowApprovable),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allReportsFiltered, isAdmin, isHOD, user?.id],
  );

  // Prune stale selections when filters change.
  useEffect(() => {
    setSelectedQueueKeys((prev) => {
      const visible = new Set(approvableQueueRows.map(queueRowKey));
      const next = new Set([...prev].filter((k) => visible.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [approvableQueueRows]);
  useEffect(() => {
    setSelectedAllKeys((prev) => {
      const visible = new Set(approvableAllRows.map(allRowKey));
      const next = new Set([...prev].filter((k) => visible.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [approvableAllRows]);

  const makeToggle = (setter, getKey) => (r) => setter((prev) => {
    const next = new Set(prev);
    const k = getKey(r);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const makeToggleAll = (setter, getKey, rows) => () => setter((prev) => {
    const keys = rows.map(getKey);
    const all = keys.length > 0 && keys.every((k) => prev.has(k));
    return all ? new Set() : new Set(keys);
  });

  const toggleQueueRow = makeToggle(setSelectedQueueKeys, queueRowKey);
  const toggleAllQueueVisible = makeToggleAll(setSelectedQueueKeys, queueRowKey, approvableQueueRows);
  const toggleAllRow = makeToggle(setSelectedAllKeys, allRowKey);
  const toggleAllAllVisible = makeToggleAll(setSelectedAllKeys, allRowKey, approvableAllRows);

  const requestBulkApprove = (targets, onDone) => {
    if (targets.length === 0) return;
    setBulkConfirm({ targets, onDone });
  };
  const runBulkApprove = async (targets, onDone) => {
    setBulkProgress({ done: 0, total: targets.length, failed: 0 });
    let done = 0;
    let failed = 0;
    const CONCURRENCY = 3;
    let cursor = 0;
    const next = async () => {
      while (cursor < targets.length) {
        const idx = cursor;
        cursor += 1;
        try {
          await approveIDRMutation.mutateAsync(targets[idx]);
        } catch {
          failed += 1;
        } finally {
          done += 1;
          setBulkProgress({ done, total: targets.length, failed });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, next));
    setBulkProgress(null);
    if (onDone) onDone();
    if (failed === 0) {
      toast.success(`${targets.length} report${targets.length > 1 ? 's' : ''} approved`);
    } else if (failed === targets.length) {
      toast.error(`All ${targets.length} approvals failed`);
    } else {
      toast.warning(`${targets.length - failed} approved, ${failed} failed`);
    }
  };

  const handleBulkApproveQueue = () => requestBulkApprove(
    approvableQueueRows.filter((r) => selectedQueueKeys.has(queueRowKey(r))),
    () => setSelectedQueueKeys(new Set()),
  );
  const handleBulkApproveAll = () => requestBulkApprove(
    approvableAllRows.filter((r) => selectedAllKeys.has(allRowKey(r))),
    () => setSelectedAllKeys(new Set()),
  );

  // Hero counters mirror the contributor-chain queue so the numbers match what the user sees below.
  const indicatorCount = reviewQueue.length;
  const totalAwaiting = indicatorCount + specificsCount + disputes.length;
  const disputesLoading = disputesQuery.isLoading;

  return (
    <DashboardLayout breadcrumbs={BREADCRUMBS}>
      <div className="space-y-0">

        {/* Hero */}
        <div className="bg-[#1A5632] text-white">
          <div className="px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/70 mb-1">M&E Review</div>
                <h1 className="text-[17px] font-semibold leading-snug">Review Submissions</h1>
                <p className="text-[11px] text-white/60 mt-1">
                  {isHOD ? (
                    <>
                      <Star className="w-3 h-3 inline-block text-[#B4A269] mr-1" />
                      Head of Division — reviewing reports for{' '}
                      <strong className="text-white">{activeDivision?.division_name || (activeDivisionCodesList.length > 1 ? `${activeDivisionCodesList.length} divisions (${activeDivisionCodesList.join(', ')})` : activeDivisionCodesList[0] || '—')}</strong> only
                    </>
                  ) : (
                    <>Browse and review reports submitted by all divisions for {quarter} {fiscalYear}</>
                  )}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[42px] font-black leading-none">{totalAwaiting}</div>
                <div className="text-[11px] text-white/70 mt-1">awaiting action</div>
              </div>
            </div>
          </div>

          {/* Counts */}
          <div className="border-t border-white/15 px-6 py-2.5 flex flex-wrap items-center gap-6 text-[12px] text-white/70 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-400" /><strong className="text-white">{indicatorCount}</strong> indicator reports</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-400" /><strong className="text-white">{specificsCount}</strong> specific activities</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-purple-400" /><strong className="text-white">{quarterlyCount}</strong> quarterly reports</span>
            {disputes.length > 0 && (
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-400" /><strong className="text-white">{disputes.length}</strong> disputes</span>
            )}
            <span className="ml-auto flex items-center gap-2">
              {canExport && (
                <ExportMenu onExport={handleExportQuarterly} isExporting={isExporting} label={`Quarterly report ${quarter}`} />
              )}
              {canExportActivities && (
                <ExportMenu onExport={handleExportActivities} isExporting={isExporting} label={`Activity reports ${quarter}`} />
              )}
              {isAdmin && (
                <button
                  onClick={() => setRemindModalOpen(true)}
                  className="text-[11px] font-semibold px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white border border-white/25 flex items-center gap-1.5"
                  title="Send reminder emails to users with DRAFT reports"
                >
                  <Send className="w-3 h-3" />
                  Remind draft reporters
                </button>
              )}
            </span>
          </div>

          {/* Main tab */}
          <div className="border-t border-white/15 px-6 py-0 flex items-stretch overflow-x-auto">
            <button
              onClick={() => setTab('reports')}
              className={`px-4 py-2.5 text-[12px] font-semibold border-b-2 transition-colors whitespace-nowrap ${
                tab === 'reports'
                  ? 'text-white border-[#B4A269] bg-white/[0.08]'
                  : 'text-white/70 border-transparent hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              Quarterly Reports
            </button>
            <button
              onClick={() => setTab('activities')}
              className={`px-4 py-2.5 text-[12px] font-semibold border-b-2 transition-colors whitespace-nowrap ${
                tab === 'activities'
                  ? 'text-white border-[#B4A269] bg-white/[0.08]'
                  : 'text-white/70 border-transparent hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              Activity Reports
            </button>
            <button
              onClick={() => setTab('specifics')}
              className={`px-4 py-2.5 text-[12px] font-semibold border-b-2 transition-colors whitespace-nowrap ${
                tab === 'specifics'
                  ? 'text-white border-[#B4A269] bg-white/[0.08]'
                  : 'text-white/70 border-transparent hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              Specific Activities
            </button>
            {isAdmin && (
              <button
                onClick={() => setTab('disputes')}
                className={`px-4 py-2.5 text-[12px] font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  tab === 'disputes'
                    ? 'text-white border-[#B4A269] bg-white/[0.08]'
                    : 'text-white/70 border-transparent hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                <Flag className="w-3 h-3" />
                Ownership Disputes
                {disputes.length > 0 && (
                  <span className="relative flex h-2 w-2 ml-1">
                    <span className="animate-ping absolute inline-flex h-full w-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 bg-red-500" />
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Quarter tabs — only relevant to the indicator reports tab */}
          {tab === 'reports' && (
            <div className="border-t border-white/15 px-6 py-0 flex items-stretch overflow-x-auto">
              {QUARTERS.map((q) => {
                const isActive = q === quarter;
                return (
                  <button
                    key={q}
                    onClick={() => setQuarter(q)}
                    className={`flex-1 py-2.5 text-[12px] font-semibold border-b-2 transition-colors ${
                      isActive
                        ? 'text-white border-[#B4A269] bg-white/[0.08]'
                        : 'text-white/70 border-transparent hover:bg-white/[0.05] hover:text-white'
                    }`}
                  >
                    {q} <span className="text-white/50 font-normal">{fiscalYear}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {tab === 'activities' && <ActivityReportsReviewTab />}
        {tab === 'specifics' && <SpecificActivityReviewTable isAdmin={isAdmin} />}

        {tab === 'disputes' && (
          <FilteredDisputesTable
            disputes={disputes}
            loading={disputesLoading}
            onReassign={(d) => { setDisputeModal({ row: d, action: 'reassign' }); setNewDivision(''); }}
            onDismiss={(d) => { setDisputeModal({ row: d, action: 'dismiss' }); setDismissNote(''); }}
          />
        )}

        {tab === 'reports' && (
          <>
            {/* Search + directorate + division filter bar — applied client-side
                to BOTH the pending queue and the full oversight list below. */}
            <div className="bg-white border border-gray-200 mt-4 px-3 py-2 flex items-center gap-2 flex-wrap">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by indicator code, title, division, or submitter…"
                className="flex-1 min-w-[200px] text-[11px] border border-gray-200 px-2 py-1.5 focus:outline-none focus:border-[#1A5632]"
              />
              {/* Directorate filter — picking one resets the division below. */}
              <div className="min-w-[240px]">
                <SearchSelect
                  value={directorateFilter === 'ALL' ? null : directorateFilter}
                  onChange={(v) => { setDirectorateFilter(v || 'ALL'); setFilter('ALL'); }}
                  placeholder="All directorates"
                  allowClear
                  options={dirOptions}
                />
              </div>
              {/* Division filter — narrowed to the selected directorate's divisions. */}
              <div className="min-w-[260px]">
                <SearchSelect
                  value={filter === 'ALL' ? null : filter}
                  onChange={(v) => setFilter(v || 'ALL')}
                  placeholder="All divisions"
                  allowClear
                  options={Array.from(new Set([
                    ...reviewQueue.map((r) => r.division_code),
                    ...allReports.map((r) => r.division_code),
                  ])).filter(Boolean)
                    .filter((code) => directorateFilter === 'ALL' || directorateByDivision[code] === directorateFilter)
                    .map((code) => ({
                      value: code,
                      label: divisionNameByCode[code] || code,
                      sub: code,
                    }))
                    .sort((a, b) => a.label.localeCompare(b.label))}
                />
              </div>
              {(search || filter !== 'ALL' || directorateFilter !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setFilter('ALL'); setDirectorateFilter('ALL'); }}
                  className="text-[10px] text-gray-500 hover:text-[#1A5632] underline"
                >Clear filters</button>
              )}
            </div>

            {/* Contributor-chain pending queue — the canonical view under the
                new indicator_division_reports model. When the current user has
                (or admin sees) pending approval steps, this lists every report
                awaiting their decision with role, current step and submitter. */}
            <div className="bg-white border border-gray-200 border-t-0">
              <div className="px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-[12px] font-semibold text-gray-700 uppercase tracking-wide">Awaiting Your Approval</h3>
                <span className="text-[10px] text-gray-400">{reviewQueueFiltered.length} pending{reviewQueueFiltered.length !== reviewQueue.length ? ` · ${reviewQueue.length} total` : ''}</span>
              </div>
              {canBulkApprove && (selectedQueueKeys.size > 0 || bulkProgress) && (
                <BulkApproveBar
                  count={selectedQueueKeys.size}
                  progress={bulkProgress}
                  onClear={() => setSelectedQueueKeys(new Set())}
                  onApprove={handleBulkApproveQueue}
                />
              )}
              {reviewQueueQuery.isLoading ? (
                <div className="p-6 text-center text-[11px] text-gray-400">Loading…</div>
              ) : reviewQueueFiltered.length === 0 ? (
                <div className="p-6 text-center text-[11px] text-gray-400">
                  No indicator quarterly reports awaiting your approval for {quarter} {fiscalYear}.
                </div>
              ) : (
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                      {canBulkApprove && (
                        <th className="px-3 py-2 w-[28px]">
                          <input
                            type="checkbox"
                            aria-label="Select all approvable rows"
                            disabled={approvableQueueRows.length === 0 || Boolean(bulkProgress)}
                            checked={approvableQueueRows.length > 0 && approvableQueueRows.every((r) => selectedQueueKeys.has(queueRowKey(r)))}
                            onChange={toggleAllQueueVisible}
                          />
                        </th>
                      )}
                      <th className="px-3 py-2">Indicator</th>
                      <th className="px-3 py-2">Directorate</th>
                      <th className="px-3 py-2">Division</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Current Step</th>
                      <th className="px-3 py-2">Submitted by</th>
                      <th className="px-3 py-2 text-right">Target {quarter}</th>
                      <th className="px-3 py-2 text-right">Actual</th>
                      <th className="px-3 py-2">Updated</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reviewQueueFiltered.map((r) => {
                      const subName = [r.sub_first_name, r.sub_last_name].filter(Boolean).join(' ') || r.sub_email || '—';
                      const isDirectlyAssigned = r.approver_id === user?.id;
                      const stc = STATUS_COLORS[r.status] || FALLBACK_STATUS;
                      const upd = r.updated_at ? new Date(r.updated_at) : null;
                      return (
                        <tr
                          key={`${r.report_id}-${r.step_id}`}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => navigate(quarterlyReportPath(r.plan_node_id, { quarter: r.quarter, division: r.division_code, fiscalYear: r.fiscal_year }))}
                        >
                          {canBulkApprove && (
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              {isQueueRowApprovable(r) ? (
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${r.indicator_code}`}
                                  disabled={Boolean(bulkProgress)}
                                  checked={selectedQueueKeys.has(queueRowKey(r))}
                                  onChange={() => toggleQueueRow(r)}
                                />
                              ) : (
                                <span className="text-gray-300" title="Not assigned to you">—</span>
                              )}
                            </td>
                          )}
                          <td className="px-3 py-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/plan/node/${r.plan_node_id}`); }}
                              className="text-left hover:underline decoration-dotted underline-offset-2"
                              title="Open indicator details"
                            >
                              <div className="font-mono text-[10px] text-[#1A5632] font-semibold">{r.indicator_code}</div>
                              <div className="text-[10px] text-gray-500 truncate max-w-[360px]">{r.indicator_title}</div>
                            </button>
                          </td>
                          <td className="px-3 py-2 text-[10px] text-gray-700">{r.directorate || <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2 font-mono text-[10px] text-gray-700">{r.division_code}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-block px-1.5 py-0.5 text-[9px] font-semibold ${r.role === 'OWNER' ? 'bg-[#B4A269]/20 text-[#8B7D3C]' : 'bg-blue-50 text-blue-600'}`}>
                              {r.role}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 ${stc.bg} ${stc.text}`}>{stc.label}</span>
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            <div>{r.step_label}</div>
                            <div className="mt-0.5">
                              {isDirectlyAssigned ? (
                                <span className="inline-block text-[9px] font-semibold px-1.5 py-0.5 bg-[#1A5632]/10 text-[#1A5632]">Assigned to you</span>
                              ) : r.approver_id ? (
                                <span className="inline-block text-[9px] font-semibold px-1.5 py-0.5 bg-gray-100 text-gray-500">Admin view · assigned to another user</span>
                              ) : r.role_code === ROLES.ME_OFFICER ? (
                                <span className="inline-block text-[9px] font-semibold px-1.5 py-0.5 bg-[#1A5632]/10 text-[#1A5632]">Any M&amp;E officer</span>
                              ) : (
                                <span className="inline-block text-[9px] font-semibold px-1.5 py-0.5 bg-amber-50 text-amber-700">Unassigned — admin action needed</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-gray-600">{subName}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{r.quarter_target != null ? Number(r.quarter_target) : '—'}</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-800">{r.actual_value != null ? Number(r.actual_value) : '—'}</td>
                          <td className="px-3 py-2 text-[10px] text-gray-500">{upd ? upd.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}</td>
                          <td className="px-3 py-2 text-right">
                            <span className="text-[#1A5632] font-medium">Review →</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Full oversight table — visible to SYSTEM_ADMIN & ME_OFFICER.
                Shows every indicator-division report for the active quarter
                regardless of status, with filter chips by status. */}
            {(isAdmin || activeDivisionCodesList.length > 0) && (
              <div className="bg-white border border-gray-200 mt-6">
                <div className="px-4 py-2.5 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-[12px] font-semibold text-gray-700 uppercase tracking-wide">All Reports · {quarter} {fiscalYear}</h3>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {isAdmin ? 'Every indicator report across every division.' : `All reports for your division${activeDivisionCodesList.length > 1 ? 's' : ''}.`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="flex items-center gap-1.5 text-[10px] text-gray-600 cursor-pointer select-none" title="Keep only indicators where a report is expected this quarter (positive target). Indicators with null or zero Q target are hidden.">
                      <input
                        type="checkbox"
                        checked={onlyRequired}
                        onChange={(e) => setOnlyRequired(e.target.checked)}
                      />
                      Report expected
                    </label>
                    <div className="flex items-center gap-1.5 flex-wrap">
                    {['ALL', 'DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED'].map((st) => {
                      const active = allReportsFilter === st;
                      const count = st === 'ALL'
                        ? allReportsScoped.length
                        : allReportsScoped.filter((r) => r.status === st).length;
                      return (
                        <button
                          key={st}
                          onClick={() => setAllReportsFilter(st)}
                          className={`text-[9px] font-semibold px-2 py-0.5 border ${active ? 'bg-[#1A5632] text-white border-[#1A5632]' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                        >
                          {st.replace('_', ' ')} ({count})
                        </button>
                      );
                    })}
                    </div>
                  </div>
                </div>
                {canBulkApprove && (selectedAllKeys.size > 0 || bulkProgress) && (
                  <BulkApproveBar
                    count={selectedAllKeys.size}
                    progress={bulkProgress}
                    onClear={() => setSelectedAllKeys(new Set())}
                    onApprove={handleBulkApproveAll}
                  />
                )}
                {allReportsQuery.isLoading ? (
                  <div className="p-6 text-center text-[11px] text-gray-400">Loading…</div>
                ) : allReportsFiltered.length === 0 ? (
                  <div className="p-6 text-center text-[11px] text-gray-400">No reports in this status.</div>
                ) : (
                  <table className="w-full text-left text-[11px]">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                        {canBulkApprove && (
                          <th className="px-3 py-2 w-[28px]">
                            <input
                              type="checkbox"
                              aria-label="Select all approvable rows"
                              disabled={approvableAllRows.length === 0 || Boolean(bulkProgress)}
                              checked={approvableAllRows.length > 0 && approvableAllRows.every((r) => selectedAllKeys.has(allRowKey(r)))}
                              onChange={toggleAllAllVisible}
                            />
                          </th>
                        )}
                        <th className="px-3 py-2">Indicator</th>
                        <th className="px-3 py-2">Directorate</th>
                        <th className="px-3 py-2">Division</th>
                        <th className="px-3 py-2">Role</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Current Step</th>
                        <th className="px-3 py-2">Submitted by</th>
                        <th className="px-3 py-2 text-right">Target {quarter}</th>
                        <th className="px-3 py-2 text-right">Actual</th>
                        <th className="px-3 py-2">Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {allReportsFiltered.map((r) => {
                        const subName = [r.sub_first_name, r.sub_last_name].filter(Boolean).join(' ') || r.sub_email || '—';
                        const st = STATUS_COLORS[r.status] || { bg: 'bg-gray-100', text: 'text-gray-500', label: r.status };
                        const upd = r.updated_at ? new Date(r.updated_at) : null;
                        return (
                          <tr
                            key={r.report_id}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => navigate(quarterlyReportPath(r.plan_node_id, { quarter: r.quarter, division: r.division_code, fiscalYear: r.fiscal_year }))}
                          >
                            {canBulkApprove && (
                              <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                {isAllRowApprovable(r) ? (
                                  <input
                                    type="checkbox"
                                    aria-label={`Select ${r.indicator_code}`}
                                    disabled={Boolean(bulkProgress)}
                                    checked={selectedAllKeys.has(allRowKey(r))}
                                    onChange={() => toggleAllRow(r)}
                                  />
                                ) : (
                                  <span className="text-gray-300" title={r.status === 'IN_REVIEW' ? 'Not assigned to you' : 'Not pending approval'}>—</span>
                                )}
                              </td>
                            )}
                            <td className="px-3 py-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/plan/node/${r.plan_node_id}`); }}
                                className="text-left hover:underline decoration-dotted underline-offset-2"
                              >
                                <div className="font-mono text-[10px] text-[#1A5632] font-semibold">{r.indicator_code}</div>
                                <div className="text-[10px] text-gray-500 truncate max-w-[340px]">{r.indicator_title}</div>
                              </button>
                            </td>
                            <td className="px-3 py-2 text-[10px] text-gray-700">{r.directorate || <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2 font-mono text-[10px] text-gray-700">{r.division_code}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-block px-1.5 py-0.5 text-[9px] font-semibold ${r.role === 'OWNER' ? 'bg-[#B4A269]/20 text-[#8B7D3C]' : 'bg-blue-50 text-blue-600'}`}>{r.role}</span>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`text-[9px] font-semibold px-1.5 py-0.5 ${st.bg} ${st.text}`}>{st.label}</span>
                            </td>
                            <td className="px-3 py-2 text-gray-700">{r.step_label || (r.status === 'DRAFT' ? <span className="text-gray-400 italic">Not submitted</span> : r.status === 'APPROVED' ? <span className="text-[#1A5632]">Finalised</span> : '—')}</td>
                            <td className="px-3 py-2 text-gray-600">{subName}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{r.quarter_target != null ? Number(r.quarter_target) : '—'}</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-800">{r.actual_value != null ? Number(r.actual_value) : '—'}</td>
                            <td className="px-3 py-2 text-[10px] text-gray-500">{upd ? upd.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

          </>
        )}
      </div>

      {bulkConfirm && (
        <BulkApproveConfirmModal
          targets={bulkConfirm.targets}
          onCancel={() => setBulkConfirm(null)}
          onConfirm={async () => {
            const { targets, onDone } = bulkConfirm;
            setBulkConfirm(null);
            await runBulkApprove(targets, onDone);
          }}
        />
      )}

      {remindModalOpen && (
        <RemindDraftsModal
          fiscalYear={fiscalYear}
          quarter={quarter}
          onClose={() => setRemindModalOpen(false)}
        />
      )}

      {disputeModal && (
        <DisputeResolutionModal
          modal={disputeModal}
          divisions={divisions}
          newDivision={newDivision}
          setNewDivision={setNewDivision}
          dismissNote={dismissNote}
          setDismissNote={setDismissNote}
          acting={reassignMutation.isPending || dismissMutation.isPending || dismissIndicatorMutation.isPending}
          onCancel={() => setDisputeModal(null)}
          onConfirm={async () => {
            const d = disputeModal.row;
            try {
              if (disputeModal.action === 'reassign') {
                await reassignMutation.mutateAsync({ row: d, newDivision });
                toast.success(`Activity reassigned to ${newDivision}`);
              } else if (d.dispute_type === 'INDICATOR') {
                await dismissIndicatorMutation.mutateAsync({ row: d, note: dismissNote });
                toast.success('Dispute dismissed — indicator reset to Draft');
              } else {
                await dismissMutation.mutateAsync({ row: d });
                toast.success('Dispute dismissed — activity reset to Draft');
              }
              setDisputeModal(null);
            } catch (err) {
              toast.error(err.response?.data?.message || err.response?.data?.error?.message || 'Action failed');
            }
          }}
        />
      )}
    </DashboardLayout>
  );
}

// ─── Bulk approve confirmation modal ──
function BulkApproveConfirmModal({ targets, onCancel, onConfirm }) {
  const preview = targets.slice(0, 5);
  const extra = Math.max(0, targets.length - preview.length);
  return (
    <Modal open title="Approve Selected Reports" onClose={onCancel}>
      <div className="px-5 py-4 space-y-4">
        <div className="text-[12px] text-gray-700">
          You are about to approve <strong>{targets.length}</strong> report{targets.length > 1 ? 's' : ''}.
          This will mark each one as <span className="text-[#1A5632] font-semibold">Approved</span> and finalise the workflow step. This cannot be undone.
        </div>
        <div className="bg-gray-50 border border-gray-200 max-h-[220px] overflow-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[9px] uppercase tracking-wide text-gray-500 bg-gray-100">
                <th className="px-3 py-1.5 text-left">Indicator</th>
                <th className="px-3 py-1.5 text-left">Division</th>
                <th className="px-3 py-1.5 text-right">Target {preview[0]?.quarter || ''}</th>
                <th className="px-3 py-1.5 text-right">Actual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {preview.map((r) => (
                <tr key={`${r.report_id}-${r.step_id || ''}`}>
                  <td className="px-3 py-1.5 font-mono text-[10px] text-[#1A5632]">{r.indicator_code}</td>
                  <td className="px-3 py-1.5 font-mono text-[10px] text-gray-600">{r.division_code}</td>
                  <td className="px-3 py-1.5 text-right text-gray-600">{r.quarter_target != null ? Number(r.quarter_target) : '—'}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-gray-800">{r.actual_value != null ? Number(r.actual_value) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {extra > 0 && (
            <div className="px-3 py-1.5 text-[10px] text-gray-500 bg-gray-100 border-t border-gray-200">
              + {extra} more
            </div>
          )}
        </div>
      </div>
      <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] px-3 py-1.5 border border-gray-300 text-gray-600 hover:bg-white"
        >Cancel</button>
        <button
          type="button"
          onClick={onConfirm}
          className="text-[11px] px-4 py-1.5 bg-[#1A5632] text-white hover:bg-[#0F3D24] flex items-center gap-1.5"
        >
          <Check className="w-3 h-3" />
          Approve {targets.length}
        </button>
      </div>
    </Modal>
  );
}

// ─── Remind Drafts Modal (admin) ────────────────────────────────────
function RemindDraftsModal({ fiscalYear, quarter, onClose }) {
  const [scope, setScope] = useState('quarter'); // 'quarter' | 'year' | 'all'
  const [preview, setPreview] = useState(null); // { users_targeted, total_drafts, sample }
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const bodyFor = () => {
    if (scope === 'quarter') return { fiscalYear, quarter };
    if (scope === 'year') return { fiscalYear };
    return {};
  };

  const runPreview = async () => {
    setLoading(true);
    try {
      const r = await reviewSubmissionsApi.remindDrafts({ ...bodyFor(), dryRun: true });
      setPreview(r.data);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to preview');
    } finally { setLoading(false); }
  };

  const runSend = async () => {
    setSending(true);
    try {
      const r = await reviewSubmissionsApi.remindDrafts({ ...bodyFor(), dryRun: false });
      toast.success(`Enqueued ${r.data?.enqueued ?? 0} reminder email(s)`);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to send');
    } finally { setSending(false); }
  };

  return (
    <Modal open onClose={onClose} title="Remind draft reporters">
      <div className="p-4 space-y-3">
        <p className="text-[12px] text-gray-700">
          Send a reminder email to every user with at least one DRAFT report. The email lists their drafts and links to the reporting page.
        </p>
        <div>
          <label className="text-[10px] uppercase text-gray-500 font-semibold mb-1 block">Scope</label>
          <select
            value={scope}
            onChange={(e) => { setScope(e.target.value); setPreview(null); }}
            className="w-full text-[12px] border border-gray-300 px-2 py-1.5"
          >
            <option value="quarter">Current view: {fiscalYear} · {quarter}</option>
            <option value="year">All quarters of FY {fiscalYear}</option>
            <option value="all">All fiscal years, all quarters</option>
          </select>
        </div>
        {!preview && (
          <button
            type="button"
            onClick={runPreview}
            disabled={loading}
            className="w-full text-[12px] font-semibold px-3 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Preview
          </button>
        )}
        {preview && (
          <div className="border border-gray-200 bg-gray-50 p-3 space-y-2">
            <div className="text-[13px]">
              <strong>{preview.users_targeted}</strong> user{preview.users_targeted === 1 ? '' : 's'} · <strong>{preview.total_drafts}</strong> draft report{preview.total_drafts === 1 ? '' : 's'}
            </div>
            {preview.sample?.length > 0 && (
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase text-gray-500 font-semibold">Sample (first 5):</div>
                {preview.sample.map((s) => (
                  <div key={s.email} className="text-[11px] text-gray-700 font-mono">
                    {s.email} — {s.draft_count} draft{s.draft_count === 1 ? '' : 's'}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] px-4 py-1.5 border border-gray-300 hover:bg-gray-50"
          >
            Cancel
          </button>
          {preview && (
            <button
              type="button"
              onClick={runSend}
              disabled={sending || !preview.users_targeted}
              className="text-[11px] px-4 py-1.5 bg-[#1A5632] text-white hover:bg-[#0F3D24] flex items-center gap-1.5 disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Send to {preview.users_targeted} user{preview.users_targeted === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── Bulk approve toolbar (used by both queue + all-reports tables) ──
function BulkApproveBar({ count, progress, onClear, onApprove }) {
  return (
    <div className="px-4 py-2 bg-[#1A5632]/5 border-b border-[#1A5632]/20 flex items-center justify-between gap-3">
      <div className="text-[11px] text-[#1A5632] font-semibold">
        {progress
          ? `Approving ${progress.done}/${progress.total}${progress.failed ? ` · ${progress.failed} failed` : ''}…`
          : `${count} selected`}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          disabled={Boolean(progress)}
          className="text-[10px] text-gray-500 hover:text-[#1A5632] underline disabled:opacity-40"
        >Clear</button>
        <button
          type="button"
          onClick={onApprove}
          disabled={Boolean(progress) || count === 0}
          className="text-[11px] px-3 py-1 bg-[#1A5632] text-white hover:bg-[#0F3D24] disabled:opacity-50 flex items-center gap-1.5"
        >
          {progress ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Approve selected
        </button>
      </div>
    </div>
  );
}

// ─── Dispute field accessors (shared between DisputesTable + DisputeResolutionModal) ──
// dispute_type comparisons below are page-local UI discriminator checks (which API a merged
// row came from), not ENTITY_TYPES/ENTITY_TABLES references; no-restricted-syntax is already
// disabled file-wide by the header pragma (D-20260416-18), so no per-line disables are needed.
function disputeCode(row) { return row.dispute_type === 'INDICATOR' ? row.indicator_code : row.activity_code; }
function disputeTitle(row) { return row.dispute_type === 'INDICATOR' ? row.indicator_title : row.activity_name; }
function disputeDivision(row) { return row.dispute_type === 'INDICATOR' ? row.division_code : row.responsible_division_code; }

/** Disputes tab: directorate → division filter (URL `disp_*`) over DisputesTable. */
function FilteredDisputesTable({ disputes, ...tableProps }) {
  const divFilter = useDivisionFilter('disp');
  const shown = (disputes || []).filter((d) => divFilter.matches(disputeDivision(d)));
  return (
    <>
      <div className="mt-4"><DivisionFilterBar filter={divFilter} shown={shown.length} total={(disputes || []).length} /></div>
      <DisputesTable disputes={shown} {...tableProps} />
    </>
  );
}
function disputeFlaggedBy(row) {
  if (row.dispute_type === 'INDICATOR') {
    // `flagged_by_*` (the user recorded in indicator_report_history for the
    // NOT_APPLICABLE action) is the real answer — a disputed report was
    // never submitted, so `sub_*` (submitted_by) is always empty. Kept as
    // a fallback only for rows fetched before this field existed.
    return [row.flagged_by_first_name, row.flagged_by_last_name].filter(Boolean).join(' ')
      || row.flagged_by_email
      || [row.sub_first_name, row.sub_last_name].filter(Boolean).join(' ')
      || row.sub_email
      || '—';
  }
  return row.prepared_by_name || '—';
}
function disputeReason(row) { return row.narrative || row.rejection_reason || '—'; }
function disputeDate(row) { return row.updated_at || row.created_at || null; }

// ─── Disputes table (extracted) ──
function DisputesTable({ disputes, loading, onReassign, onDismiss }) {
  return (
    <div className="bg-white border border-gray-200 border-t-0">
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
      ) : disputes.length === 0 ? (
        <div className="px-5 py-12 text-center text-[11px] text-gray-400">No ownership disputes flagged.</div>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="text-[9px] text-gray-400 uppercase border-b border-gray-100 bg-gray-50/50">
              <th className="px-3 py-2 font-normal w-[70px]">Type</th>
              <th className="px-3 py-2 font-normal w-[100px]">Code</th>
              <th className="px-3 py-2 font-normal">Item</th>
              <th className="px-3 py-2 font-normal w-[120px]">Flagged by</th>
              <th className="px-3 py-2 font-normal w-[100px]">Division</th>
              <th className="px-3 py-2 font-normal">Justification</th>
              <th className="px-3 py-2 font-normal w-[80px]">Date</th>
              <th className="px-3 py-2 font-normal w-[220px] text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {disputes.map((d, i) => {
              const isIndicator = d.dispute_type === 'INDICATOR';
              const date = disputeDate(d);
              return (
                <tr key={d.id} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                  <td className="px-3 py-2.5">
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 ${isIndicator ? 'bg-purple-50 text-purple-700' : 'bg-amber-50 text-amber-700'}`}>
                      {isIndicator ? 'Indicator' : 'Activity'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[10px] font-mono font-bold text-[#D97706]">{disputeCode(d) || '—'}</td>
                  <td className="px-3 py-2.5 text-[11px] text-gray-800">{disputeTitle(d) || '—'}</td>
                  <td className="px-3 py-2.5 text-[11px] text-gray-700">{disputeFlaggedBy(d)}</td>
                  <td className="px-3 py-2.5 text-[10px] text-gray-500">{disputeDivision(d) || '—'}</td>
                  <td className="px-3 py-2.5 text-[11px] text-gray-600">{disputeReason(d)}</td>
                  <td className="px-3 py-2.5 text-[10px] text-gray-400">{date ? new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      {!isIndicator && (
                        <button
                          onClick={() => onReassign(d)}
                          className="flex items-center gap-1 text-[10px] px-2 py-1 border border-[#1A5632] text-[#1A5632] hover:bg-[#1A5632] hover:text-white"
                        >
                          <ArrowRightLeft className="w-3 h-3" /> Reassign
                        </button>
                      )}
                      <button
                        onClick={() => onDismiss(d)}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 border border-gray-300 text-gray-500 hover:bg-gray-50"
                      >
                        <X className="w-3 h-3" /> Dismiss
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Dispute resolution modal (extracted) ──
function DisputeResolutionModal({ modal, divisions, newDivision, setNewDivision, dismissNote, setDismissNote, acting, onCancel, onConfirm }) {
  const isIndicator = modal.row.dispute_type === 'INDICATOR';
  return (
    <Modal open title={modal.action === 'reassign' ? 'Reassign Activity' : 'Dismiss Dispute'} onClose={onCancel}>
      <div className="px-5 py-4 space-y-4">
        <div className="bg-gray-50 border border-gray-200 p-3 space-y-1">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">{isIndicator ? 'Indicator' : 'Activity'}</div>
          <div className="text-[12px] font-semibold text-gray-800">{disputeCode(modal.row)} — {disputeTitle(modal.row)}</div>
          <div className="text-[10px] text-gray-500">Currently assigned to: <strong>{disputeDivision(modal.row) || '—'}</strong></div>
          <div className="text-[10px] text-gray-500">Flagged by: <strong>{disputeFlaggedBy(modal.row)}</strong></div>
          <div className="text-[10px] text-gray-600 mt-1 italic">"{disputeReason(modal.row)}"</div>
        </div>

        {modal.action === 'reassign' ? (
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Reassign to division *</label>
            <SearchSelect
              value={newDivision || null}
              onChange={(v) => setNewDivision(v || '')}
              placeholder="Select the correct division..."
              options={divisions.map((div) => ({ value: div.code, label: div.division_name, sub: div.code }))}
            />
          </div>
        ) : (
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Note to focal person (optional)</label>
            <textarea
              value={dismissNote}
              onChange={(e) => setDismissNote(e.target.value)}
              placeholder="Explain why this activity stays assigned to their division..."
              className="w-full text-[11px] border border-gray-300 px-3 py-2 h-20 resize-none focus:outline-none focus:border-[#1A5632]"
            />
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
        <button onClick={onCancel} className="text-[11px] px-3 py-1.5 border border-gray-300 text-gray-500 hover:bg-white">
          Cancel
        </button>
        <button
          disabled={acting || (modal.action === 'reassign' && !newDivision)}
          onClick={onConfirm}
          className="text-[11px] px-4 py-1.5 bg-[#1A5632] text-white hover:bg-[#0F3D24] disabled:opacity-50"
        >
          {acting ? 'Processing...' : modal.action === 'reassign' ? 'Reassign Activity' : 'Dismiss Dispute'}
        </button>
      </div>
    </Modal>
  );
}

// ─── RejectModal ─────────────────────────────────────────────
function RejectModal({ report, onCancel, onSubmit, saving }) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        className="bg-white border border-gray-200 w-full max-w-[520px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 bg-red-600 text-white flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <h2 className="text-[14px] font-semibold">Reject Report</h2>
          <button onClick={onCancel} className="ml-auto text-white/70 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="text-[11px] text-gray-600">
            You are about to reject the {report?.quarter} report for{' '}
            <strong className="font-mono">{report?.indicator_code}</strong>
            {' — '}
            <span className="text-gray-500">{report?.indicator_title}</span>.
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
              Rejection Reason *
            </label>
            <p className="text-[10px] text-gray-400 mb-1.5">
              Explain what needs to be corrected. The submitter will see this message and can resubmit after fixing.
            </p>
            <textarea
              autoFocus
              rows={5}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. The actual value seems too low compared to the quarterly target. Please verify your data sources and resubmit."
              className="w-full text-[12px] border border-gray-300 px-3 py-2 focus:outline-none focus:border-red-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="text-[11px] px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSubmit(reason)}
              disabled={saving || !reason.trim()}
              className="text-[11px] px-4 py-2 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              {saving ? 'Rejecting...' : 'Confirm Rejection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const fmtShortDate = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—');

/* ── Activity Reports review tab ── */
export function ActivityReportsReviewTab() {
  const navigate = useNavigate();
  // Submitted (to approve) or Drafts (to follow up, transfer or delete), in the URL.
  const [searchParams, setSearchParams] = useSearchParams();
  const isDrafts = searchParams.get('ar_status') === 'drafts';
  const setDrafts = (on) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (on) next.set('ar_status', 'drafts'); else next.delete('ar_status');
    return next;
  }, { replace: true });
  const reportsQuery = useActivityReportsForReview(isDrafts ? STATUSES.DRAFT : STATUSES.SUBMITTED);
  const reports = reportsQuery.data || [];
  const approveMutation = useApproveActivityReport();
  const rejectMutation = useRejectActivityReport();
  const [acting, setActing] = useState(null);
  const [rejectRow, setRejectRow] = useState(null); // the activity_reports row being rejected
  const divFilter = useDivisionFilter('ar');
  const visibleReports = reports.filter((r) => divFilter.matches(r.responsible_division_code));

  const errMessage = (err) =>
    err?.response?.data?.message || err?.response?.data?.error?.message || 'Action failed';

  const approve = async (id) => {
    setActing(id);
    try {
      await approveMutation.mutateAsync(id);
      toast.success('Activity report approved');
    } catch (err) {
      toast.error(errMessage(err));
    } finally { setActing(null); }
  };

  const submitReject = async (reason) => {
    if (!rejectRow || !reason.trim()) return;
    setActing(rejectRow.id);
    try {
      await rejectMutation.mutateAsync({ id: rejectRow.id, reason: reason.trim() });
      toast.success('Activity report rejected');
      setRejectRow(null);
    } catch (err) {
      toast.error(errMessage(err));
    } finally { setActing(null); }
  };

  const statusToggle = (
    <div role="group" aria-label="Report status" className="bg-white border border-gray-200 border-t-0 px-3 py-2 flex gap-1">
      {[[false, 'Submitted'], [true, 'Drafts']].map(([value, label]) => (
        <button
          key={label}
          type="button"
          aria-pressed={isDrafts === value}
          onClick={() => setDrafts(value)}
          className={`text-[11px] px-3 py-1 border ${isDrafts === value ? 'bg-[#1A5632] text-white border-[#1A5632]' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
  const openReport = (r) => navigate(`/activity-report/${r.plan_node_id}/report/${r.id}`);

  if (reportsQuery.isLoading) return <div>{statusToggle}<div className="bg-white border border-gray-200 border-t-0 py-12 text-center"><Loader2 className="w-4 h-4 animate-spin text-gray-400 mx-auto" /></div></div>;
  if (!reports.length) {
    return (
      <div>
        {statusToggle}
        <div className="bg-white border border-gray-200 border-t-0 px-5 py-12 text-center text-[11px] text-gray-400">
          {isDrafts ? 'No draft activity reports.' : 'No activity reports awaiting approval.'}
        </div>
      </div>
    );
  }

  return (
    <div>
      {statusToggle}
      <DivisionFilterBar filter={divFilter} shown={visibleReports.length} total={reports.length} />
      <div className="bg-white border border-gray-200 border-t-0 overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="text-[9px] text-gray-400 uppercase border-b border-gray-100 bg-gray-50/50">
            <th className="px-3 py-2 font-normal w-[100px]">Code</th>
            <th className="px-3 py-2 font-normal">Activity</th>
            <th className="px-3 py-2 font-normal w-[120px]">Division</th>
            <th className="px-3 py-2 font-normal w-[120px]">{isDrafts ? 'Prepared by' : 'Submitted by'}</th>
            <th className="px-3 py-2 font-normal w-[80px]">Date</th>
            <th className="px-3 py-2 font-normal w-[140px] text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visibleReports.map((r, i) => (
            <tr
              key={r.id}
              onClick={isDrafts ? () => openReport(r) : undefined}
              className={`border-b border-gray-100 ${isDrafts ? 'cursor-pointer hover:bg-gray-50' : ''} ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
            >
              <td className="px-3 py-2.5 text-[10px] font-mono font-bold text-[#D97706]">{r.activity_code || '—'}</td>
              <td className="px-3 py-2.5 text-[11px] text-gray-800">{r.activity_name || '—'}</td>
              <td className="px-3 py-2.5 text-[10px] text-gray-500">{r.responsible_division_code || '—'}</td>
              <td className="px-3 py-2.5 text-[11px] text-gray-700">{r.prepared_by_name || '—'}</td>
              <td className="px-3 py-2.5 text-[10px] text-gray-400">{fmtShortDate(isDrafts ? r.updated_at : r.submitted_at)}</td>
              <td className="px-3 py-2.5 text-center">
                {isDrafts ? (
                  <button type="button" onClick={(e) => { e.stopPropagation(); openReport(r); }} className="text-[11px] text-[#1A5632] hover:underline">
                    Open
                  </button>
                ) : (
                  <ActionDropdown
                    onView={() => openReport(r)}
                    onApprove={() => approve(r.id)}
                    onReject={() => setRejectRow(r)}
                    disabled={acting === r.id}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {rejectRow && (
        <RejectModal
          report={{ quarter: rejectRow.quarter, indicator_code: rejectRow.activity_code, indicator_title: rejectRow.activity_name }}
          onCancel={() => setRejectRow(null)}
          onSubmit={submitReject}
          saving={acting === rejectRow.id}
        />
      )}
    </div>
  );
}

/**
 * Reusable dropdown for review actions: View Details, Approve, Reject.
 */
function ActionDropdown({ onView, onApprove, onReject, disabled }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((p) => !p)}
        disabled={disabled}
        className="flex items-center gap-1 text-[10px] px-3 py-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        Actions <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-gray-200 shadow-sm min-w-[140px]">
            <button
              onClick={() => { setOpen(false); onView(); }}
              className="w-full text-left px-3 py-2 text-[10px] text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <Eye className="w-3 h-3 text-gray-400" /> View Details
            </button>
            {onApprove && (
              <button
                onClick={() => { setOpen(false); onApprove(); }}
                className="w-full text-left px-3 py-2 text-[10px] text-green-700 hover:bg-green-50 flex items-center gap-2 border-t border-gray-100"
              >
                <Check className="w-3 h-3" /> Approve
              </button>
            )}
            {onReject && (
              <button
                onClick={() => { setOpen(false); onReject(); }}
                className="w-full text-left px-3 py-2 text-[10px] text-red-600 hover:bg-red-50 flex items-center gap-2 border-t border-gray-100"
              >
                <X className="w-3 h-3" /> Reject
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
