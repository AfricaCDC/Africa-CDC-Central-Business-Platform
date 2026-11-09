/* eslint-disable complexity, max-lines, cdc-rbm/no-useeffect-fetch, no-restricted-syntax, react-hooks/exhaustive-deps -- pre-existing, tracked. */
import { useState, useEffect, useMemo } from 'react';
import api from '@/services/api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import PillarChip from '@/components/shared/PillarChip';
import { usePillarNameById } from '@/hooks/usePillars';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveDivision } from '@/contexts/ActiveDivisionContext';
import { Loader2, Search, Star, Eye, MoreVertical, Link2, Users, FileText, X as XIcon, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { fmtValue as fmtVal } from '@rbm/lib/formatters';
import { STATUSES, STATUS_COLORS } from '@rbm/lib/enums';
import { RBAC_MODULES, RBAC_ACTIONS } from '@rbm/lib/rbac';
import { fyToYear, currentFy } from '@rbm/lib/fiscalYear';
import ExportMenu from '@/components/shared/ExportMenu';
import Modal, { ModalPrimaryButton, ModalSecondaryButton } from '@/components/shared/Modal';
import { exportApi, triggerDownload } from '@/services/export.api';
import { usePermissions } from '@/hooks/usePermissions';
import { useQueryClient } from '@tanstack/react-query';
import { useDivisionIndicatorsData, useIndicatorDivisionReportsList, useOwnerNotApplicable, useReportingPeriods } from './hooks/useReportingQueries';
import { useReportingYear } from './hooks/useReportingYear';
import { quarterlyReportPath } from './activity-report/reportingQuarter';
import { withBase } from '@/utils/basePath';

const FALLBACK_STATUS = STATUS_COLORS[STATUSES.DRAFT];
// Hover text of an N/A badge: who set it (the main division) and why.
const naTitle = (report) => {
  const why = report?.rejection_reason || report?.narrative || '';
  return report?.owner_not_applicable ? `Marked not applicable by the main division (${report.division_code}): ${why}` : why;
};
const currentQuarter = () => 'Q' + (Math.floor(new Date().getMonth() / 3) + 1);
const currentQuarterNum = () => Math.floor(new Date().getMonth() / 3) + 1;
const ALL_QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

// A report counts as "reported" once it left the reporter's hands — same
// rule as the quarterly dashboard (anything but DRAFT/REJECTED). The old
// SUBMITTED||VALIDATED check missed APPROVED (the contributor chain's final
// state) and showed 0% under fully-approved rows.
const isReported = (r) => Boolean(r) && r.status !== STATUSES.DRAFT && r.status !== STATUSES.REJECTED;
// A not-applicable indicator leaves the count altogether, numerator and total
// (D-20261013-12): counting it as reported inflated the percentage.
const isApplicable = (r) => !r || r.status !== STATUSES.NOT_APPLICABLE;

export default function DivisionActivityReportPage() {
  const { user } = useAuth();
  const { activeDivision, activeCodes: defaultCodes } = useActiveDivision();
  const { can } = usePermissions();
  // The page shows indicator reports, so its download is the quarterly
  // indicator report (D-20261013-10) — it used to export activity reports.
  const canExport = can(RBAC_MODULES.QUARTERLY_REPORT, RBAC_ACTIONS.EXPORT);
  const navigate = useNavigate();
  const { data: periods = [], isLoading: periodsLoading } = useReportingPeriods();
  const { fiscalYear } = useReportingYear(periods, periodsLoading);

  // Support ?division=CODE from quarterly dashboard drill-down
  const [searchParams] = useSearchParams();
  const urlDivision = searchParams.get('division');
  const divCode = urlDivision || activeDivision?.code || user?.division_code;
  // When URL overrides, use that single code; otherwise use the active set
  const activeCodes = urlDivision
    ? new Set([urlDivision.toUpperCase()])
    : defaultCodes;

  const [search, setSearch] = useState('');
  const [quarter, setQuarter] = useState(null);
  // Reports just marked N/A, shown before the list query comes back.
  const [naOverlay, setNaOverlay] = useState({});
  const queryClient = useQueryClient();
  const [contribSummary, setContribSummary] = useState({});
  const [openMenu, setOpenMenu] = useState(null); // ind.id currently showing the dropdown
  const [contribModal, setContribModal] = useState(null); // { ind, rows, loading }
  const [isExporting, setIsExporting] = useState(false);
  const pillarName = usePillarNameById();
  const [naModal, setNaModal] = useState(null); // the indicator row being flagged, or null
  const [naReason, setNaReason] = useState('');
  const [naSaving, setNaSaving] = useState(false);

  const { data, isLoading } = useDivisionIndicatorsData({ fiscalYear });

  // Per-division reports (indicator_division_reports) of EVERY division shown
  // on the page, not just the user's home division (D-20261013-05). A query,
  // not an effect, so a late answer for a previous selection cannot overwrite
  // the current one (that race hid freshly marked N/A rows after a reload).
  const reportCodes = useMemo(() => {
    const codes = activeCodes?.size ? [...activeCodes] : [divCode];
    return codes.filter(Boolean).map((c) => String(c).toUpperCase()).sort();
  }, [activeCodes, divCode]);
  const { data: divisionReports } = useIndicatorDivisionReportsList(reportCodes, fiscalYear);
  const { data: ownerNotApplicable } = useOwnerNotApplicable(fiscalYear);
  const newReports = useMemo(() => {
    // When several shown divisions report on one indicator, the owner's row wins.
    const ownerOf = {};
    [...(data?.t3 || []), ...(data?.t4 || [])].forEach((ind) => {
      ownerOf[ind.id] = String(ind.responsible_division_code || '').toUpperCase();
    });
    const map = {};
    (divisionReports || []).forEach((rpt) => {
      const key = `${rpt.plan_node_id}_${rpt.quarter}`;
      if (!map[key] || String(rpt.division_code).toUpperCase() === ownerOf[rpt.plan_node_id]) map[key] = rpt;
    });
    // An N/A set by the main division shows for every division, contributors
    // included (D-20261013-10).
    (ownerNotApplicable || []).forEach((rpt) => {
      map[`${rpt.plan_node_id}_${rpt.quarter}`] = { ...rpt, status: STATUSES.NOT_APPLICABLE, owner_not_applicable: true };
    });
    return { ...map, ...naOverlay };
  }, [divisionReports, ownerNotApplicable, data, naOverlay]);

  const { indicators, reportsByQuarter, periodsByQuarter, defaultQuarter } = useMemo(() => {
    if (!data || !activeCodes?.size) {
      return { indicators: [], reportsByQuarter: { Q1: {}, Q2: {}, Q3: {}, Q4: {} }, periodsByQuarter: { Q1: null, Q2: null, Q3: null, Q4: null }, defaultQuarter: currentQuarter() };
    }

    const broads = data.broads.filter((b) => activeCodes.has(String(b.responsible_division_code || '').toUpperCase()));
    const broadIds = new Set(broads.map((b) => b.id));
    const mySpecs = data.specifics.filter(
      (s) => activeCodes.has(String(s.responsible_division_code || '').toUpperCase()) || broadIds.has(s.parent_id),
    );

    // Indicators linked via my specifics
    const indIds = new Set();
    mySpecs.forEach((s) => { if (s.linked_indicator_id) indIds.add(s.linked_indicator_id); });

    const upperActive = new Set([...activeCodes].map((c) => String(c).toUpperCase()));
    const parseContribs = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
    };
    const intersectsActive = (codes) => codes.some((c) => upperActive.has(String(c).toUpperCase()));

    const allInds = [
      ...data.t3.map((ind) => ({ ...ind, tier_id: 3 })),
      ...data.t4.map((ind) => ({ ...ind, tier_id: 4 })),
    ];
    const myInds = allInds
      .filter((ind) => {
        // MAIN: my division is the responsible division
        if (ind.responsible_division_code && upperActive.has(String(ind.responsible_division_code).toUpperCase())) return true;
        // CONTRIB: my division is in contributing_divisions
        if (intersectsActive(parseContribs(ind.contributing_divisions))) return true;
        // Linked: my specifics are linked to this indicator
        if (indIds.has(ind.id)) return true;
        return false;
      })
      .map((ind) => {
        const isMain = ind.responsible_division_code && upperActive.has(String(ind.responsible_division_code).toUpperCase());
        return { ...ind, main_division_code: ind.responsible_division_code, is_main_for_user: !!isMain };
      });

    // The per-division reports (indicator_division_reports) of each quarter,
    // keyed by indicator: the hero %, the quarter tabs and the rows all count
    // from the same report.
    const byQuarter = (q) => {
      const m = {};
      Object.entries(newReports).forEach(([key, rpt]) => {
        const sep = key.lastIndexOf('_');
        if (key.slice(sep + 1) === q) m[key.slice(0, sep)] = rpt;
      });
      return m;
    };
    const allMaps = { Q1: byQuarter('Q1'), Q2: byQuarter('Q2'), Q3: byQuarter('Q3'), Q4: byQuarter('Q4') };

    const pMap = { Q1: null, Q2: null, Q3: null, Q4: null };
    (data.periods || []).forEach((p) => {
      if (p.quarter && pMap[p.quarter] === null) pMap[p.quarter] = p;
    });

    const openQ = ALL_QUARTERS.find((q) => pMap[q]?.status === STATUSES.OPEN);
    let target = openQ || null;
    if (!target) {
      const isComplete = (qMap) => myInds.length > 0 && myInds.every((ind) => !isApplicable(qMap[ind.id]) || isReported(qMap[ind.id]));
      const curQ = currentQuarterNum();
      target = currentQuarter();
      for (let qi = 1; qi <= curQ; qi++) {
        const q = 'Q' + qi;
        if (!isComplete(allMaps[q])) { target = q; break; }
      }
    }

    return { indicators: myInds, reportsByQuarter: allMaps, periodsByQuarter: pMap, defaultQuarter: target };
  }, [data, activeCodes, divCode, newReports]);

  const activeQuarter = quarter || defaultQuarter;
  const reports = reportsByQuarter[activeQuarter] || {};
  const currentPeriod = periodsByQuarter[activeQuarter] || null;
  const isWindowOpen = currentPeriod?.status === STATUSES.OPEN;

  const handleExportIndicatorReports = async (format) => {
    setIsExporting(true);
    try {
      const res = await exportApi.quarterlyReport({ fiscalYear, quarter: activeQuarter, format, division: reportCodes.join(',') });
      triggerDownload(res, `quarterly-report-${reportCodes.join('-')}-${fiscalYear}-${activeQuarter}.${format}`);
    } catch {
      toast.error('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Contributor rollup per indicator for the active quarter — shows OWNER
  // users "who has pushed / who is missing" without loading every report.
  // Key on the stringified indicator-id list + quarter so the effect only
  // refires when the SET of ids (or their order) actually changes, not on
  // every render where `indicators` gets a new array reference.
  const indicatorIdsKey = useMemo(
    () => indicators.map((i) => i.id).sort((a, b) => a - b).join(','),
    [indicators],
  );
  useEffect(() => {
    if (!indicatorIdsKey || !activeQuarter) return;
    let cancelled = false;
    // eslint-disable-next-line cdc-rbm/no-api-url-in-component -- pre-existing CHARTER §8 debt on this call, not part of the base-path change
    api.get('/reporting/indicator-division-reports/summary', {
      params: { fiscal_year: fiscalYear, quarter: activeQuarter, plan_node_ids: indicatorIdsKey },
    })
      // Response interceptor auto-unwraps `{success, data}` envelopes so
      // `r.data` is already the summary map (keyed by `${id}__${quarter}`).
      .then((r) => { if (!cancelled) setContribSummary(r.data || {}); })
      .catch(() => { if (!cancelled) setContribSummary({}); });
    return () => { cancelled = true; };
  }, [indicatorIdsKey, activeQuarter, fiscalYear]);

  let filtered = indicators;
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((ind) => (ind.title || '').toLowerCase().includes(s) || (ind.code || '').toLowerCase().includes(s));
  }
  filtered = [...filtered].sort((a, b) => {
    if (a.tier_id !== b.tier_id) return a.tier_id - b.tier_id;
    return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true });
  });

  const applicableInds = filtered.filter((ind) => isApplicable(reports[ind.id]));
  const totalInds = applicableInds.length;
  const notApplicableCount = filtered.length - totalInds;
  const reportedCount = applicableInds.filter((ind) => isReported(reports[ind.id])).length;
  const pct = totalInds > 0 ? Math.round((reportedCount / totalInds) * 100) : 0;

  // Close any open dropdown when clicking outside
  useEffect(() => {
    if (openMenu == null) return undefined;
    const handler = (e) => {
      if (!e.target.closest('[data-row-actions]')) setOpenMenu(null);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [openMenu]);

  const copyReportLink = (ind) => {
    const url = `${window.location.origin}${withBase(quarterlyReportPath(ind.id, { quarter: activeQuarter, division: divCode, fiscalYear }))}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success('Report link copied to clipboard'),
      () => toast.error('Could not copy link'),
    );
  };

  const openContribModal = async (ind) => {
    setContribModal({ ind, rows: [], loading: true });
    try {
      const res = await api.get(`/reporting/indicator-division-reports/${ind.id}`, {
        params: { quarter: activeQuarter, fiscal_year: fiscalYear, division_code: divCode },
      });
      // Prefer the merged `expectedContributors` list so every expected
      // division shows up — including those that have not started
      // reporting yet (status=NOT_STARTED, no report row).
      const expected = Array.isArray(res.data?.expectedContributors) ? res.data.expectedContributors : null;
      const flat = Array.isArray(res.data?.allReports) ? res.data.allReports : [];
      const rows = expected
        ? expected.map((e) => ({
          id: e.report?.id ?? `placeholder-${e.division_code}`,
          division_code: e.division_code,
          division_name: e.division_name,
          role: e.role,
          status: e.status,
          actual_value: e.report?.actual_value ?? null,
          updated_at: e.report?.updated_at ?? null,
          is_placeholder: !e.report,
        }))
        : flat;
      setContribModal({ ind, rows, loading: false });
    } catch {
      setContribModal({ ind, rows: [], loading: false });
    }
  };

  const handleMarkNotApplicable = async () => {
    if (!naModal || !naReason.trim()) return;
    setNaSaving(true);
    try {
      const res = await api.post(`/reporting/indicator-division-reports/${naModal.id}/not-applicable`, {
        reason: naReason.trim(),
        quarter: activeQuarter,
        fiscal_year: fiscalYear,
        // Only the main division marks N/A (D-20261013-10).
        division_code: naModal.responsible_division_code,
      });
      const updated = res.data?.data || res.data;
      setNaOverlay((prev) => ({ ...prev, [`${naModal.id}_${activeQuarter}`]: updated }));
      queryClient.invalidateQueries({ queryKey: ['indicator-division-reports'] });
      setNaModal(null);
      setNaReason('');
      toast.success('Marked as not applicable');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to mark as not applicable');
    } finally {
      setNaSaving(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/report' }, { label: 'Quarterly Report' }]}>
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" />
        </div>
      </DashboardLayout>
    );
  }

  // Admins / M&E officers don't carry a personal division_code but reach
  // this page via ?division=… (drill-in from the dashboard) or via the
  // division switcher. Only block when ALL three signals are empty.
  if (!divCode) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/report' }, { label: 'Quarterly Report' }]}>
        <div className="p-6 text-[11px] text-gray-500">No division assigned to your account.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/report' }, { label: 'Quarterly Report' }]}>
      <div className="space-y-0">

        {/* Hero */}
        <div className="bg-[#1A5632] text-white">
          <div className="px-6 py-5 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">
                  {activeQuarter} {fiscalYear}
                </span>
                <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold bg-white/15">{divCode}</span>
                {(activeDivision?.parent_code || user.directorate) && <span className="text-[10px] text-white/60">{urlDivision ? '' : (activeDivision?.parent_code || user.directorate)}</span>}
              </div>
              <h1 className="text-[18px] font-semibold leading-snug">Quarterly Report — {urlDivision ? `Division ${urlDivision}` : (activeDivision?.division_name || user.division_name)}</h1>
              <p className="text-[11px] text-white/70 mt-1">Report on each T3/T4 indicator your division contributes to</p>
            </div>
            <div className="text-right">
              {canExport && (
                <div className="flex justify-end mb-2">
                  <ExportMenu onExport={handleExportIndicatorReports} isExporting={isExporting} label={`Export ${activeQuarter} quarterly report`} />
                </div>
              )}
              <div className="text-[36px] font-bold leading-none">{pct}%</div>
              <div className="text-[10px] text-white/70 mt-1">
                {reportedCount} / {totalInds} reported{notApplicableCount > 0 && ` · ${notApplicableCount} not applicable`}
              </div>
            </div>
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex items-center gap-6 text-[12px] text-white/70">
            <span><strong className="text-white">{indicators.filter((ind) => ind.tier_id === 3).length}</strong> T3</span>
            <span><strong className="text-white">{indicators.filter((ind) => ind.tier_id === 4).length}</strong> T4</span>
            <span><strong className="text-white">{reportedCount}</strong> Reported this {activeQuarter}</span>
          </div>

          {/* Quarter tabs */}
          <div className="border-t border-white/15 px-6 py-0 flex items-stretch">
            {ALL_QUARTERS.map((q) => {
              const qMap = reportsByQuarter[q] || {};
              const period = periodsByQuarter[q];
              const applicableQ = indicators.filter((ind) => isApplicable(qMap[ind.id]));
              const totalQ = applicableQ.length;
              const reportedQ = applicableQ.filter((ind) => isReported(qMap[ind.id])).length;
              const pctQ = totalQ > 0 ? Math.round((reportedQ / totalQ) * 100) : 0;
              const isActive = q === activeQuarter;
              const isComplete = reportedQ === totalQ && totalQ > 0;

              const windowStatus = period?.status || null;
              const isNotCreated = !period;
              const isOpen = windowStatus === STATUSES.OPEN;
              const isClosed = windowStatus === STATUSES.CLOSED;
              const isDraft = windowStatus === STATUSES.DRAFT;

              let dotColor = 'bg-white/25';
              if (isOpen) dotColor = isComplete ? 'bg-green-400' : (reportedQ > 0 ? 'bg-yellow-400' : 'bg-blue-400');
              else if (isClosed) dotColor = 'bg-gray-400';
              else if (isDraft) dotColor = 'bg-white/40';

              let statusLabel;
              if (isNotCreated) statusLabel = 'Not opened';
              else if (isDraft) statusLabel = 'Pending admin';
              else if (isClosed) statusLabel = `Closed · ${reportedQ}/${totalQ}`;
              else if (isOpen) statusLabel = `${reportedQ}/${totalQ} · ${pctQ}%`;

              const QUARTER_LABELS = { Q1: 'Jan-Mar', Q2: 'Apr-Jun', Q3: 'Jul-Sep', Q4: 'Oct-Dec' };

              return (
                <button
                  key={q}
                  onClick={() => setQuarter(q)}
                  className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 border-b-2 transition-colors ${
                    isActive
                      ? 'text-white border-[#B4A269] bg-white/[0.08]'
                      : 'text-white/70 border-transparent hover:bg-white/[0.05] hover:text-white'
                  } ${isNotCreated || isDraft ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
                    <span className="text-[12px] font-semibold">{q}</span>
                    <span className="text-[9px] text-white/50 hidden sm:inline">{QUARTER_LABELS[q]}</span>
                    {isOpen && <span className="text-[8px] uppercase font-bold text-green-300 border border-green-400/40 px-1 leading-none py-0.5">Open</span>}
                  </div>
                  <div className="text-[9px] text-white/60">{statusLabel}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Status banner */}
        {isWindowOpen ? (
          <div className="bg-emerald-50 border border-emerald-200 border-t-0 px-5 py-2.5 text-[11px] text-emerald-800 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <strong>{activeQuarter} window is open.</strong>
            <span>For each T3/T4 indicator: enter the actual value, narrative, challenges, recommendations, and means of verification.</span>
          </div>
        ) : !currentPeriod ? (
          <div className="bg-gray-50 border border-gray-200 border-t-0 px-5 py-2.5 text-[11px] text-gray-600 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
            <strong>{activeQuarter} — Reporting window not yet opened.</strong>
            <span>Admin must open the {activeQuarter} window before reporting is allowed.</span>
          </div>
        ) : currentPeriod.status === STATUSES.CLOSED ? (
          <div className="bg-amber-50 border border-amber-200 border-t-0 px-5 py-2.5 text-[11px] text-amber-800 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            <strong>{activeQuarter} window is closed.</strong>
            <span>You can view past reports but no new submissions are accepted.</span>
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 border-t-0 px-5 py-2.5 text-[11px] text-gray-600 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
            <strong>{activeQuarter} — Draft window.</strong>
            <span>Admin has created the window but has not opened it yet.</span>
          </div>
        )}

        {/* Filter */}
        <div className="bg-white border border-gray-200 border-t-0 px-5 py-3">
          <div className="relative max-w-[400px]">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by code or indicator..."
              className="w-full text-[11px] border border-gray-200 pl-8 pr-3 py-1.5 outline-none focus:border-[#1A5632]"
            />
          </div>
        </div>

        {/* Flat list */}
        <div className="bg-white border border-gray-200 border-t-0">
          {filtered.length === 0 ? (
            <div className="px-5 py-12 text-center text-[11px] text-gray-400">No indicators to report on.</div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="text-[9px] text-gray-400 border-b border-gray-100 bg-gray-50/50">
                  <th className="px-3 py-2 font-normal w-[40px] text-center">Tier</th>
                  <th className="px-3 py-2 font-normal w-[80px] text-center">Role</th>
                  <th className="px-3 py-2 font-normal w-[140px]">Code</th>
                  <th className="px-3 py-2 font-normal">Indicator</th>
                  <th className="px-3 py-2 font-normal w-[60px] text-center">Baseline</th>
                  <th className="px-3 py-2 font-normal w-[70px] text-center" title={`Annual target for FY${currentFy()} · ${fyToYear(currentFy())}`}>FY{currentFy()} Target</th>
                  <th className="px-3 py-2 font-normal w-[40px] text-center">Q1</th>
                  <th className="px-3 py-2 font-normal w-[40px] text-center">Q2</th>
                  <th className="px-3 py-2 font-normal w-[40px] text-center">Q3</th>
                  <th className="px-3 py-2 font-normal w-[40px] text-center">Q4</th>
                  <th className="px-3 py-2 font-normal w-[60px] text-center">Actual {activeQuarter}</th>
                  <th className="px-3 py-2 font-normal w-[80px] text-center">Status</th>
                  <th className="px-3 py-2 font-normal w-[150px] text-center" title="Contributor divisions that have pushed / been approved">Contribs</th>
                  <th className="px-3 py-2 font-normal w-[60px] text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ind, rowIdx) => {
                  const report = reports[ind.id];
                  const status = report?.status || null;
                  const st = STATUS_COLORS[status] || FALLBACK_STATUS;
                  return (
                    <tr key={ind.id} className={`border-b border-gray-100 hover:bg-emerald-50/30 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-1 py-0.5 text-[8px] font-bold text-white ${ind.tier_id === 4 ? 'bg-[#D97706]' : 'bg-[#14442A]'}`}>T{ind.tier_id}</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {ind.is_main_for_user ? (
                          <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-[#B4A269] border border-[#B4A269]/40 bg-[#B4A269]/10 px-1.5 py-0.5" title="Main contributor — your division can submit reports for this indicator">
                            <Star className="w-2.5 h-2.5" />
                            Main
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-blue-600 border border-blue-300 bg-blue-50 px-1.5 py-0.5" title={`Contributor — your division contributes to this indicator (owner: ${ind.main_division_code || 'unknown'}). Submit your contribution; it is routed through the contributor approval chain.`}>
                            <Users className="w-2.5 h-2.5" />
                            Contrib
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[9px] font-mono font-bold">
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/plan/node/${ind.id}`); }}
                          className="text-[#1A5632] hover:underline decoration-dotted underline-offset-2"
                          title="Open indicator details"
                        >
                          {ind.code}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-[10px]">
                        <PillarChip name={pillarName(ind.pillar_id)} className="mr-1.5 align-middle" />
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/plan/node/${ind.id}`); }}
                          className="text-left text-gray-800 hover:text-[#1A5632] hover:underline decoration-dotted underline-offset-2"
                          title="Open indicator details"
                        >
                          {ind.title}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-[10px] font-semibold text-gray-700 text-center">{fmtVal(ind.baseline_numeric, ind.uom)}</td>
                      <td className="px-3 py-2 text-[10px] font-semibold text-[#1A5632] text-center">{fmtVal(ind[`target_y${currentFy()}_numeric`] ?? ind.target_y1_numeric, ind.uom)}</td>
                      <td className="px-3 py-2 text-[10px] text-gray-500 text-center">{ind.q1_target_numeric != null ? Math.round(Number(ind.q1_target_numeric)) : '—'}</td>
                      <td className="px-3 py-2 text-[10px] text-gray-500 text-center">{ind.q2_target_numeric != null ? Math.round(Number(ind.q2_target_numeric)) : '—'}</td>
                      <td className="px-3 py-2 text-[10px] text-gray-500 text-center">{ind.q3_target_numeric != null ? Math.round(Number(ind.q3_target_numeric)) : '—'}</td>
                      <td className="px-3 py-2 text-[10px] text-gray-500 text-center">{ind.q4_target_numeric != null ? Math.round(Number(ind.q4_target_numeric)) : '—'}</td>
                      <td className="px-3 py-2 text-[10px] font-bold text-center" style={{ color: report?.actual_value !== null && report?.actual_value !== undefined ? '#1A5632' : '#9CA3AF' }}>
                        {report?.actual_value !== null && report?.actual_value !== undefined ? fmtVal(report.actual_value, ind.uom) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {status ? (
                          <span
                            className={`text-[9px] font-semibold px-1.5 py-0.5 ${st.bg} ${st.text}`}
                            title={status === STATUSES.NOT_APPLICABLE ? naTitle(report) : undefined}
                          >
                            {st.label}
                          </span>
                        ) : (
                          <span className="text-[9px] text-gray-300">Not started</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {(() => {
                          const sum = contribSummary[`${ind.id}__${activeQuarter}`];
                          if (!sum || sum.contribs_expected === 0) {
                            return <span className="text-[9px] text-gray-300">—</span>;
                          }
                          const pushed = sum.contribs_in_review + sum.contribs_approved + sum.contribs_rejected;
                          const missing = Math.max(0, sum.contribs_expected - pushed - sum.contribs_draft);
                          return (
                            <div className="flex flex-wrap items-center gap-1 justify-center">
                              <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 bg-blue-50 text-blue-700" title={`${pushed} of ${sum.contribs_expected} contributors have submitted`}>
                                {pushed}/{sum.contribs_expected} pushed
                              </span>
                              {sum.contribs_approved > 0 && (
                                <span className="inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 bg-[#1A5632]/10 text-[#1A5632]" title="Contributors whose report is fully approved">
                                  {sum.contribs_approved} ok
                                </span>
                              )}
                              {sum.contribs_rejected > 0 && (
                                <span className="inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 bg-red-50 text-red-600" title="Contributors whose report was rejected">
                                  {sum.contribs_rejected} rej
                                </span>
                              )}
                              {missing > 0 && (
                                <span className="inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 bg-gray-100 text-gray-500" title="Potential contributors who have not reported (contribution is optional)">
                                  {missing} no report
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {(() => {
                          const isEditable = status === STATUSES.DRAFT || status === STATUSES.REJECTED;
                          const isSubmitted = status && status !== STATUSES.DRAFT && status !== STATUSES.REJECTED;
                          const primaryLabel = (isWindowOpen && !isSubmitted)
                            ? (isEditable ? 'Edit' : 'Report')
                            : (status ? 'View' : (isWindowOpen ? 'Report' : null));
                          const primaryStyle = (primaryLabel === 'View')
                            ? 'border-gray-300 text-gray-500 hover:bg-gray-50'
                            : 'border-[#1A5632] text-[#1A5632] hover:bg-[#1A5632] hover:text-white';
                          const sum = contribSummary[`${ind.id}__${activeQuarter}`];
                          const hasContribs = sum && sum.contribs_expected > 0;
                          const menuOpen = openMenu === ind.id;

                          return (
                            <div className="relative inline-flex items-stretch" data-row-actions>
                              {primaryLabel ? (
                                <button
                                  onClick={() => navigate(quarterlyReportPath(ind.id, { quarter: activeQuarter, division: divCode, fiscalYear }))}
                                  className={`text-[10px] px-2 py-1 border inline-flex items-center gap-1 ${primaryStyle}`}
                                  title={primaryLabel}
                                >
                                  {primaryLabel === 'View' && <Eye className="w-2.5 h-2.5" />}
                                  {primaryLabel}
                                </button>
                              ) : (
                                <span className="text-[9px] text-gray-300 py-1 px-2">—</span>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); setOpenMenu(menuOpen ? null : ind.id); }}
                                className={`text-gray-500 hover:text-gray-800 border border-l-0 ${primaryLabel ? (primaryLabel === 'View' ? 'border-gray-300' : 'border-[#1A5632]') : 'border-gray-300'} px-1 hover:bg-gray-50`}
                                title="More actions"
                              >
                                <MoreVertical className="w-3 h-3" />
                              </button>
                              {menuOpen && (
                                <div className="absolute right-0 top-full mt-1 min-w-[180px] bg-white border border-gray-200 shadow-sm z-20 text-left">
                                  <button
                                    onClick={() => { setOpenMenu(null); navigate(quarterlyReportPath(ind.id, { quarter: activeQuarter, division: divCode, fiscalYear })); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-[10px] text-gray-700 hover:bg-gray-50"
                                  >
                                    <FileText className="w-3 h-3" /> Open report
                                  </button>
                                  <button
                                    onClick={() => { setOpenMenu(null); openContribModal(ind); }}
                                    disabled={!hasContribs}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-[10px] text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    <Users className="w-3 h-3" /> Contributors
                                    {hasContribs && <span className="ml-auto text-[9px] text-gray-400">{sum.contribs_expected + 1}</span>}
                                  </button>
                                  <button
                                    onClick={() => { setOpenMenu(null); copyReportLink(ind); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-[10px] text-gray-700 hover:bg-gray-50 border-t border-gray-100"
                                  >
                                    <Link2 className="w-3 h-3" /> Copy link
                                  </button>
                                  {!isSubmitted && ind.is_main_for_user && (
                                    <button
                                      onClick={() => { setOpenMenu(null); setNaModal(ind); setNaReason(''); }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-[10px] text-gray-500 hover:bg-gray-50 border-t border-gray-100"
                                    >
                                      <Ban className="w-3 h-3" /> Mark as not applicable
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {contribModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setContribModal(null)}
        >
          <div
            className="bg-white max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Contributors · {activeQuarter} {fiscalYear}</div>
                <button
                  onClick={() => { setContribModal(null); navigate(`/plan/node/${contribModal.ind.id}`); }}
                  className="text-[13px] font-semibold text-gray-800 mt-0.5 hover:text-[#1A5632] hover:underline decoration-dotted underline-offset-2"
                  title="Open indicator details"
                >
                  {contribModal.ind.code}
                </button>
                <div className="text-[11px] text-gray-600">{contribModal.ind.title}</div>
              </div>
              <button onClick={() => setContribModal(null)} className="text-gray-400 hover:text-gray-700">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-auto">
              {contribModal.loading ? (
                <div className="p-6 text-center text-[11px] text-gray-400">Loading…</div>
              ) : contribModal.rows.length === 0 ? (
                <div className="p-6 text-center text-[11px] text-gray-400">No division reports yet for this indicator.</div>
              ) : (
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2">Division</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Actual</th>
                      <th className="px-3 py-2">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {contribModal.rows.map((r) => {
                      const st = r.status === 'NOT_STARTED'
                        ? { bg: 'bg-gray-50', text: 'text-gray-500', label: 'No report yet' }
                        : (STATUS_COLORS[r.status] || FALLBACK_STATUS);
                      const updated = r.updated_at ? new Date(r.updated_at) : null;
                      return (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono text-[10px] text-gray-700">{r.division_code}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-block px-1.5 py-0.5 text-[9px] font-semibold ${r.role === 'OWNER' ? 'bg-[#B4A269]/20 text-[#8B7D3C]' : 'bg-blue-50 text-blue-600'}`}>
                              {r.role}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 ${st.bg} ${st.text}`}>{st.label}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-800">{r.actual_value != null ? Number(r.actual_value) : '—'}</td>
                          <td className="px-3 py-2 text-[10px] text-gray-500">
                            {updated ? updated.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {naModal && (
        <Modal
          open
          title="Mark as Not Applicable"
          onClose={() => { if (!naSaving) setNaModal(null); }}
          footer={(
            <>
              <ModalSecondaryButton onClick={() => setNaModal(null)} disabled={naSaving}>Cancel</ModalSecondaryButton>
              <ModalPrimaryButton onClick={handleMarkNotApplicable} disabled={!naReason.trim() || naSaving}>
                {naSaving ? 'Saving...' : 'Confirm N/A'}
              </ModalPrimaryButton>
            </>
          )}
        >
          <p className="text-[11px] text-gray-600 mb-3">
            You are marking <strong>{naModal.code}</strong> — {naModal.title} as not applicable to your division for {activeQuarter} {fiscalYear}.
          </p>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Reason *</label>
          <textarea
            autoFocus
            value={naReason}
            onChange={(e) => setNaReason(e.target.value)}
            placeholder="Explain why this indicator does not concern your division..."
            className="w-full text-[11px] border border-gray-300 px-3 py-2 h-20 resize-none focus:outline-none focus:border-gray-500"
          />
        </Modal>
      )}
    </DashboardLayout>
  );
}
