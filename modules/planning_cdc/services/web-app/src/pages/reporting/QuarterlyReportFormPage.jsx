/* eslint-disable max-lines, complexity, no-unused-vars, cdc-rbm/no-useeffect-fetch, no-restricted-syntax, cdc-rbm/no-inline-status-map, react-hooks/exhaustive-deps --
 * Legacy 800-line form page. File-size split tracked as task #41.
 * ListField uses position-indexed array keys (no stable ID available).
 * (reporting-cluster useEffect migration, D-20260416-18+)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  Loader2, Save, Send, ArrowLeft, Plus, X,
  ChevronDown, ChevronUp, Search, CheckCircle2, Trash2,
  Eye, Star, Lock, AlertTriangle,
  FilePlus2, Upload, Check, XCircle, RotateCcw, Clock, MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { fmtValue as fmtVal } from '@rbm/lib/formatters';
import { fyToYear, currentFy } from '@rbm/lib/fiscalYear';
import { STATUSES, STATUS_COLORS } from '@rbm/lib/enums';
import { ROLES } from '@rbm/lib/roles';
import {
  DISAGGREGATION_CATEGORIES,
  DISAGGREGATION_GROUPS,
  findCategory,
} from '@/data/disaggregationCategories';
import { AU_MEMBER_STATES, AU_REGIONS } from '@/data/auMemberStates';
import { useActiveDivision } from '@/contexts/ActiveDivisionContext';
import {
  resolveReportEditRole,
  focalDivisionCodesFromMe,
  allDivisionCodesFromMe,
  REPORT_ROLE_MAIN,
  REPORT_ROLE_CONTRIB,
  REPORT_ROLE_ADMIN,
  REPORT_ROLE_REVIEWER,
} from '@/data/reportEditGate';
import api from '@/services/api';
import VerificationUpload from '@/components/shared/VerificationUpload';
import PillarChip from '@/components/shared/PillarChip';
import { useIndicatorReportForm, useDivisionReport, useSaveDivisionReport, useSubmitDivisionReport, useReportingPeriods } from './hooks/useReportingQueries';
import { useReportingYear } from './hooks/useReportingYear';
import { resolveQuarter, quarterlyReportPath } from './activity-report/reportingQuarter';
import OwnerNotApplicableBanner from './OwnerNotApplicableBanner';
import ActivityEvidencePanel from './ActivityEvidencePanel';
import { blockNegativeKeys, nonNegative } from '@/utils/nonNegative';

const FALLBACK_STATUS = STATUS_COLORS[STATUSES.DRAFT];

const parseList = (raw) => {
  if (!raw) return [''];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) && p.length ? p : [''];
  } catch {
    const lines = String(raw).split('\n').filter(Boolean);
    return lines.length ? lines : [''];
  }
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function QuarterlyReportFormPage() {
  const { indicatorId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getScope } = usePermissions();
  const isAdminOverride = getScope('quarterly_report', 'approve') === 'all';
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideStatus, setOverrideStatus] = useState('');
  const [overrideComment, setOverrideComment] = useState('');
  const [overrideSaving, setOverrideSaving] = useState(false);
  const { divisions: myDivisions, activeDivision, loaded: divLoaded } = useActiveDivision();
  // divCode: URL ?division= override for viewing another division, else user's own
  const ownDivCode = activeDivision?.code || myDivisions?.[0]?.code || user?.division_code || null;
  const urlDivision = searchParams.get('division');
  const divCode = urlDivision || ownDivCode;
  const isViewingOtherDivision = !!urlDivision && urlDivision !== ownDivCode;

  // Year and quarter of the reporting period, not of the clock (D-20261106-01).
  const { data: periods = [], isLoading: periodsLoading } = useReportingPeriods();
  const { fiscalYear } = useReportingYear(periods, periodsLoading);
  const quarter = resolveQuarter(searchParams.get('q'), periods, fiscalYear);

  // Indicator metadata
  const { data, isLoading } = useIndicatorReportForm({ indicatorId, quarter, fiscalYear });
  const saveDivMut = useSaveDivisionReport();
  const submitDivMut = useSubmitDivisionReport();

  const indicator = data?.indicator || null;

  // Division report — fetch manually to avoid React Query timing issues
  const [divData, setDivData] = useState(null);
  const [divLoading2, setDivLoading2] = useState(true);
  useEffect(() => {
    if (!indicatorId || !quarter || !divCode) { setDivLoading2(false); return; }
    setDivLoading2(true);
    api.get(`/reporting/indicator-division-reports/${indicatorId}`, {
      params: { quarter, fiscal_year: fiscalYear, division_code: divCode },
    })
      .then(r => setDivData(r.data?.data || r.data))
      .catch(() => setDivData(null))
      .finally(() => setDivLoading2(false));
  }, [indicatorId, quarter, fiscalYear, divCode]);

  const [saving, setSaving] = useState(false);
  const myDivReport = divData?.myReport || null;
  const allDivReports = divData?.allReports || [];
  const reportHistory = divData?.history || [];
  const pendingApproval = divData?.pendingApproval || null;
  const workflow = divData?.workflow || null;
  const pendingSteps = useMemo(
    () => (workflow?.steps || []).filter(s => s.decision === 'PENDING' || s.decision === 'BLOCKED_NO_APPROVER'),
    [workflow],
  );
  const workflowProgress = useMemo(() => {
    const steps = workflow?.steps || [];
    if (!steps.length) return null;
    const done = steps.filter(s => s.decision === 'APPROVED').length;
    const current = steps.find(s => s.decision === 'PENDING' || s.decision === 'BLOCKED_NO_APPROVER');
    return { done, total: steps.length, current };
  }, [workflow]);
  const divLoading = divLoading2;
  const [localReportId, setLocalReportId] = useState(null);
  const reportId = localReportId || myDivReport?.id || null;

  const [report, setReport] = useState({
    actual_value: '',
    narrative: '',
    reporting_date: todayISO(),
    status: STATUSES.DRAFT,
  });
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [challenges, setChallenges] = useState(['']);
  const [recommendations, setRecommendations] = useState(['']);
  const [evidenceList, setEvidenceList] = useState(['']);
  const [disaggregations, setDisaggregations] = useState({});
  const [formReady, setFormReady] = useState(false);

  /* ── initialise form from query data (not data-fetching) ───── */

  useEffect(() => {
    if (formReady) return;
    // Wait for BOTH indicator data AND division report before initializing
    if (!data || divLoading) return;
    // Always prefer the per-division report (new system)
    const r = myDivReport;
    if (r) {
      setLocalReportId(r.id || null);
      setReport({
        // Strip trailing zeros from the DECIMAL(18,4) column ("2000.0000" -> "2000")
        // so the number input doesn't show phantom precision.
        actual_value: r.actual_value !== null && r.actual_value !== undefined && r.actual_value !== ''
          ? String(Number(r.actual_value))
          : '',
        narrative: r.narrative || '',
        reporting_date: r.reporting_date ? r.reporting_date.substring(0, 10) : todayISO(),
        status: r.status || STATUSES.DRAFT,
      });
      setChallenges(parseList(r.challenges));
      setRecommendations(parseList(r.recommendations));
      setEvidenceList(parseList(r.evidence_url));
      if (r.disaggregations) {
        setDisaggregations(typeof r.disaggregations === 'string' ? JSON.parse(r.disaggregations) : r.disaggregations);
      }
    }
    setFormReady(true);
  }, [data, myDivReport, formReady]);

  const doSave = async (andSubmit = false) => {
    const cleanDisagg = {};
    Object.entries(disaggregations).forEach(([catKey, vals]) => {
      if (catKey === 'member_states') {
        const total = Number(vals?.total) || 0;
        const list = Array.isArray(vals?.list) ? vals.list : [];
        if (total > 0 || list.length > 0) cleanDisagg[catKey] = { total, list };
        return;
      }
      const filtered = {};
      Object.entries(vals || {}).forEach(([k, v]) => {
        const n = Number(v);
        if (!Number.isNaN(n) && n !== 0) filtered[k] = n;
      });
      if (Object.keys(filtered).length > 0) cleanDisagg[catKey] = filtered;
    });

    const reportData = {
      actual_value: report.actual_value,
      narrative: report.narrative,
      challenges: JSON.stringify(challenges.filter(c => c.trim())),
      recommendations: JSON.stringify(recommendations.filter(r => r.trim())),
      evidence_url: JSON.stringify(evidenceList.filter(e => e.trim())),
      disaggregations: cleanDisagg,
      reporting_date: todayISO(),
    };

    // Save to new per-division table (primary)
    const dc = divCode || user?.division_code;
    const divPayload = {
      plan_node_id: parseInt(indicatorId),
      division_code: dc,
      quarter,
      fiscal_year: fiscalYear,
      ...reportData,
    };
    const divRes = await api.post('/reporting/indicator-division-reports', divPayload);
    // The api.js interceptor unwraps the canonical { success, data } envelope, so
    // the created row lives at divRes.data — not divRes.data.data. The old double
    // .data path was always undefined, silently skipping submit on new reports (FE-1).
    const newId = divRes.data?.id || divRes.data?.data?.id;
    if (newId) setLocalReportId(newId);

    if (andSubmit && (newId || reportId)) {
      await api.post(`/reporting/indicator-division-reports/${newId || reportId}/submit`);
      setReport(p => ({ ...p, status: STATUSES.IN_REVIEW }));
    } else {
      setReport(p => ({ ...p, status: STATUSES.DRAFT }));
    }

    return divRes;
  };

  const refetchDivData = () => {
    if (!indicatorId || !quarter || !divCode) return;
    api.get(`/reporting/indicator-division-reports/${indicatorId}`, {
      params: { quarter, fiscal_year: fiscalYear, division_code: divCode },
    })
      .then(r => setDivData(r.data?.data || r.data))
      .catch(() => {});
  };

  const handleSave = async (andSubmit = false) => {
    setSaving(true);
    try {
      await doSave(andSubmit);
      toast.success(andSubmit ? 'Report submitted' : 'Saved as draft');
      if (andSubmit) {
        setTimeout(() => navigate('/division-reports'), 800);
      } else {
        refetchDivData();
      }
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.error || err.response?.data?.message || 'Failed to save';
      toast.error(typeof msg === 'string' ? msg : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // ─── Autosave draft every 10s if dirty ───
  const dirtyRef = useRef(false);
  const autosaveTimer = useRef(null);
  const markDirty = useCallback(() => { dirtyRef.current = true; }, []);
  const editGateRef = useRef({ allowed: false, role: null });

  useEffect(() => {
    autosaveTimer.current = setInterval(async () => {
      if (!dirtyRef.current || !formReady) return;
      if (report.status === STATUSES.SUBMITTED || report.status === STATUSES.VALIDATED) return;
      if (!editGateRef.current.allowed || editGateRef.current.role === REPORT_ROLE_REVIEWER) return;
      dirtyRef.current = false;
      try {
        await doSave(false);
      } catch {
        dirtyRef.current = true;
      }
    }, 10_000);
    return () => clearInterval(autosaveTimer.current);
  }, [formReady, report.status]); 

  // ─── Hooks must run on EVERY render — keep them above any early returns ───
  //
  // Edit gate = UNION of focal divisions (D-20260415-11). The top-nav
  // switcher (user.division_code) is a LIST filter only; it MUST NOT
  // decide whether the user can edit. Otherwise the backend 403s the
  // Save call with NOT_IN_MAIN_OR_CONTRIB even though the user is a
  // focal of MAIN, just viewing the report from another division.
  const focalCodes = useMemo(
    () => focalDivisionCodesFromMe(myDivisions),
    [myDivisions]
  );
  const allCodes = useMemo(
    () => allDivisionCodesFromMe(myDivisions),
    [myDivisions]
  );
  const legacyGate = useMemo(
    () => resolveReportEditRole({
      mainDivisionCode: indicator?.responsible_division_code,
      contributingDivisions: indicator?.contributing_divisions,
      focalDivisionCodes: focalCodes,
      allDivisionCodes: allCodes,
      isAuthenticated: !!user,
    }),
    [indicator?.responsible_division_code, indicator?.contributing_divisions, focalCodes, allCodes, user]
  );
  // If the new per-division system created a report for this user,
  // they are allowed (MAIN or CONTRIB determined by getOrInit)
  const editGate = useMemo(() => {
    // Pending approver → REVIEWER (can see + approve/reject)
    if (pendingApproval) {
      return { allowed: true, role: REPORT_ROLE_REVIEWER, reason: null };
    }
    // Has own report → MAIN or CONTRIB
    if (myDivReport) {
      const role = myDivReport.role === 'OWNER' ? REPORT_ROLE_MAIN : REPORT_ROLE_CONTRIB;
      return { allowed: true, role, reason: null };
    }
    return legacyGate;
  }, [myDivReport, pendingApproval, legacyGate]);
  const mainDivisionCode = indicator?.responsible_division_code || null;
  editGateRef.current = editGate;

  if (isLoading || !divLoaded || divLoading) return (
    <DashboardLayout breadcrumbs={[{ label: 'Quarterly Report', path: '/division-reports' }, { label: 'Indicator Report' }]}>
      <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" /></div>
    </DashboardLayout>
  );

  if (!indicator) return (
    <DashboardLayout>
      <div className="p-6 text-[11px] text-gray-500">Indicator not found.</div>
    </DashboardLayout>
  );

  // Lock the form if status is final, user is a REVIEWER (HOD/M&E — can
  // approve but not edit), or user has no edit role at all.
  const isReadOnly  = !editGate.allowed;
  const isReviewer  = editGate.role === REPORT_ROLE_REVIEWER;
  const isFinal     = report.status !== STATUSES.DRAFT && report.status !== STATUSES.REJECTED;
  const isMain      = editGate.role === REPORT_ROLE_MAIN || editGate.role === REPORT_ROLE_ADMIN;
  // The main division marked the indicator N/A for this quarter: nobody else
  // reports on it (D-20261013-12, the API refuses too).
  const isDroppedByMain = !isMain && allDivReports.some((r) => r.role === 'OWNER' && r.status === STATUSES.NOT_APPLICABLE);
  const isLocked    = isReadOnly || isFinal || isReviewer || isViewingOtherDivision || isDroppedByMain;
  const isContrib   = editGate.role === REPORT_ROLE_CONTRIB;
  const st = STATUS_COLORS[report.status] || FALLBACK_STATUS;
  const totalAchieved = Number(report.actual_value) || 0;
  const activeCategoryCount = Object.keys(disaggregations).length;

  return (
    <DashboardLayout breadcrumbs={[
      { label: 'Quarterly Report', path: '/division-reports' },
      { label: indicator.code }
    ]}>
      <div className="w-full py-6 px-6 space-y-0">
        <OwnerNotApplicableBanner reports={allDivReports} />

        {/* Header */}
        <div className="bg-[#1A5632] text-white px-6 py-5">
          <button onClick={() => navigate('/division-reports')} className="flex items-center gap-1.5 text-[10px] text-white/60 hover:text-white mb-3 uppercase tracking-wider">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Quarterly Report
          </button>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest text-white/60 border border-white/30 px-2 py-0.5">
              {quarter} {fiscalYear} — Indicator Report
            </span>
            <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold ${st.bg} ${st.text}`}>{st.label}</span>
            <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold text-white ${indicator.tier_id === 4 ? 'bg-[#D97706]' : 'bg-[#14442A]'}`}>T{indicator.tier_id}</span>
          </div>
          <h1 className="text-[16px] font-semibold leading-snug">
            <button
              type="button"
              onClick={() => navigate(`/plan/node/${indicator.id || indicatorId}`)}
              className="font-mono hover:text-[#1A5632] hover:underline decoration-dotted underline-offset-2"
              title="Open indicator details"
            >
              {indicator.code}
            </button>
            <span> — {indicator.title}</span>
            {indicator.pillar && <PillarChip name={indicator.pillar.name} className="ml-2 !bg-white/15 !text-white !border-white/30 align-middle" />}
          </h1>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 border border-gray-200 border-t-0 divide-x divide-gray-200">
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] text-gray-400 uppercase">Baseline</p>
            <p className="text-[16px] font-bold text-gray-800">{fmtVal(indicator.baseline_numeric, indicator.uom)}</p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] text-gray-400 uppercase">Target · {fyToYear(currentFy())}</p>
            <p className="text-[16px] font-bold text-[#1A5632]">{fmtVal(indicator[`target_y${currentFy()}_numeric`] ?? indicator.target_y1_numeric, indicator.uom)}</p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] text-gray-400 uppercase">Unit</p>
            <p className="text-[16px] font-bold text-gray-800">{indicator.uom?.label || '—'}</p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] text-gray-400 uppercase">Quarter</p>
            <p className="text-[16px] font-bold text-gray-800">{quarter}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 border border-gray-200 border-t-0 divide-x divide-gray-200 bg-gray-50">
          {['q1_target_numeric', 'q2_target_numeric', 'q3_target_numeric', 'q4_target_numeric'].map((k, i) => (
            <div key={k} className={`px-4 py-2 text-center ${quarter === `Q${i+1}` ? 'bg-[#1A5632]/10 border-b-2 border-[#1A5632]' : ''}`}>
              <p className="text-[9px] text-gray-400 uppercase">Q{i+1} Target</p>
              <p className={`text-[14px] font-bold ${quarter === `Q${i+1}` ? 'text-[#1A5632]' : 'text-gray-600'}`}>
                {indicator[k] != null ? (indicator.uom?.code === 'NUMBER' ? Math.round(Number(indicator[k])) : Number(indicator[k])) : '—'}
              </p>
            </div>
          ))}
        </div>

        {/* Role banner — MAIN / CONTRIB / read-only (D-20260415-11) */}
        {isMain ? (
          <div className="bg-[#B4A269]/10 border border-[#B4A269]/30 border-t-0 px-5 py-2.5 text-[11px] text-gray-700 flex items-center gap-2">
            <Star className="w-3.5 h-3.5 text-[#B4A269]" />
            <strong className="text-[#1A5632]">Main contributor.</strong>
            <span>
              You hold the focal role for <strong className="font-mono">{mainDivisionCode}</strong>, the division
              responsible for reporting on this indicator.
            </span>
          </div>
        ) : isContrib ? (
          report?.is_redundant_contrib ? (
            <div className="bg-amber-50 border border-amber-200 border-t-0 px-5 py-2.5 text-[11px] text-gray-700 flex items-start gap-2">
              <Lock className="w-3.5 h-3.5 text-amber-600 mt-0.5" />
              <span>
                <strong className="text-amber-800">Redundant contributor (legacy).</strong>{' '}
                Your division is a parent or sub-division of the MAIN
                (<strong className="font-mono">{mainDivisionCode || 'unknown'}</strong>),
                so the OWNER report already represents your contribution. This row is kept for history but no further
                action is needed — please contact M&E if you want it removed.
              </span>
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-200 border-t-0 px-5 py-2.5 text-[11px] text-gray-700 flex items-center gap-2">
              <Star className="w-3.5 h-3.5 text-blue-600" />
              <strong className="text-blue-800">Contributing division.</strong>
              <span>
                You can edit this report as a contributor. Main division is{' '}
                <strong className="font-mono">{mainDivisionCode || 'unknown'}</strong> — your submission follows the
                3-step approval chain.
              </span>
            </div>
          )
        ) : isReviewer ? (
          <div className="bg-amber-50 border border-amber-200 border-t-0 px-5 py-2.5 text-[11px] text-gray-700 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-amber-600" />
            <strong className="text-amber-800">Reviewer.</strong>
            <span>
              You are reviewing this report.{' '}
              {pendingApproval && <span>Step: <strong>{pendingApproval.step_label}</strong>.</span>}
            </span>
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 border-t-0 px-5 py-2.5 text-[11px] text-gray-700 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-gray-500" />
            <strong className="text-gray-700">Read-only.</strong>
            <span>
              Your divisions are not listed as main or contributing on this indicator. Main is{' '}
              <strong className="font-mono">{mainDivisionCode || 'unknown'}</strong>.
            </span>
          </div>
        )}

        {/* Banner when viewing another division's report */}
        {isViewingOtherDivision && (
          <div className="bg-indigo-50 border border-indigo-200 border-t-0 px-5 py-2.5 text-[11px] text-gray-700 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-indigo-600" />
            <span>
              Viewing report from <strong className="font-mono text-indigo-700">{urlDivision}</strong>.
            </span>
            <button
              onClick={() => navigate(quarterlyReportPath(indicatorId, { quarter, fiscalYear }))}
              className="ml-auto text-[11px] text-indigo-600 hover:text-indigo-800 underline font-medium"
            >
              Back to your report
            </button>
          </div>
        )}

        {/* Division Contributions — visible for MAIN, shows all division reports */}
        {allDivReports.length > 1 && (
          <div className="bg-white border border-gray-200 border-t-0 px-6 py-4">
            <h3 className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-2">
              Division Contributions
              <span className="text-[9px] font-normal text-gray-400 ml-2">
                Total: {allDivReports.reduce((s, r) => s + (Number(r.actual_value) || 0), 0)} across {allDivReports.length} division{allDivReports.length > 1 ? 's' : ''}
              </span>
            </h3>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-gray-200 text-[9px] text-gray-500 uppercase">
                  <th className="text-left py-1.5 px-2 font-medium">Division</th>
                  <th className="text-left py-1.5 px-2 font-medium">Role</th>
                  <th className="text-right py-1.5 px-2 font-medium">Actual</th>
                  <th className="text-center py-1.5 px-2 font-medium">Status</th>
                  <th className="text-center py-1.5 px-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {allDivReports.map((r) => {
                  const isMine = r.division_code === ownDivCode;
                  const isViewed = isViewingOtherDivision && r.division_code === urlDivision;
                  const stc = STATUS_COLORS[r.status] || FALLBACK_STATUS;
                  const isRedundant = r.is_redundant_contrib;
                  return (
                    <tr key={r.id} className={`border-b border-gray-100 ${isMine ? 'bg-[#1A5632]/5' : ''} ${isViewed ? 'bg-indigo-50' : ''} ${isRedundant ? 'opacity-60' : ''}`}>
                      <td className="py-1.5 px-2 font-mono text-[10px]">
                        {r.division_code}
                        {isMine && <span className="text-[8px] text-[#1A5632] font-semibold ml-1">(you)</span>}
                      </td>
                      <td className="py-1.5 px-2">
                        <span className={`text-[9px] font-semibold px-1 py-0.5 ${r.role === 'OWNER' ? 'bg-[#B4A269]/20 text-[#8B7D3C]' : 'bg-blue-50 text-blue-600'}`}>
                          {r.role}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-right font-semibold">{r.actual_value != null ? Number(r.actual_value) : '—'}</td>
                      <td className="py-1.5 px-2 text-center">
                        {isRedundant ? (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-amber-50 text-amber-700" title="Parent/child of MAIN — covered by the OWNER report">
                            Covered (legacy)
                          </span>
                        ) : (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 ${stc.bg} ${stc.text}`}>
                            {stc.label}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        {isRedundant ? (
                          <span className="text-[9px] text-gray-400">—</span>
                        ) : !isMine ? (
                          <button
                            onClick={() => navigate(quarterlyReportPath(indicatorId, { quarter, division: r.division_code, fiscalYear }))}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium hover:underline inline-flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" /> View
                          </button>
                        ) : isViewingOtherDivision ? (
                          <button
                            onClick={() => navigate(quarterlyReportPath(indicatorId, { quarter, fiscalYear }))}
                            className="text-[10px] text-[#1A5632] hover:underline font-medium"
                          >
                            Your report
                          </button>
                        ) : (
                          <span className="text-[9px] text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Form — onInput on container catches all field changes for autosave */}
        <div className="bg-white border border-gray-200 border-t-0 px-6 py-6 space-y-6" onInput={markDirty}>

          {/* Results Achieved */}
          <div>
            <label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide block mb-1">Results Achieved *</label>
            <p className="text-[10px] text-gray-400 mb-1.5">Enter the quantitative result — number or percentage — achieved against the indicator target during {quarter}.</p>
            {isLocked ? (
              <p className="text-[14px] font-semibold text-gray-900 py-2">
                {report.actual_value != null && report.actual_value !== ''
                  ? Number(report.actual_value).toLocaleString('en-US', { maximumFractionDigits: 4 })
                  : '—'}
              </p>
            ) : (
              <input
                type="number"
                step="any"
                min="0"
                onKeyDown={blockNegativeKeys}
                value={report.actual_value}
                onChange={e => {
                  const v = e.target.value;
                  // Block negative input — results can't go below zero.
                  const n = Number(v);
                  if (v !== '' && Number.isFinite(n) && n < 0) return;
                  setReport(p => ({ ...p, actual_value: v }));
                  markDirty();
                }}
                placeholder="e.g. 2000"
                className="w-full text-[14px] font-semibold border border-gray-300 px-3 py-2.5 focus:outline-none focus:border-[#1A5632]"
              />
            )}
            <div className="mt-1 text-[10px] text-gray-400 flex gap-3 flex-wrap">
              <span>Unit: <strong className="text-gray-600">{indicator.uom?.label || 'Number'}</strong></span>
              {indicator.baseline_numeric !== null && <span>Baseline: <strong>{indicator.baseline_numeric}</strong></span>}
              {(() => {
                const fy = currentFy();
                const val = indicator[`target_y${fy}_numeric`] ?? indicator.target_y1_numeric;
                if (val === null || val === undefined) return null;
                return <span>Target FY{fy} · {fyToYear(fy)}: <strong className="text-[#1A5632]">{val}</strong></span>;
              })()}
            </div>
          </div>

          {/* Narrative */}
          <div>
            <label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide block mb-1">Narrations of Performance — Key Milestones</label>
            <p className="text-[10px] text-gray-400 mb-1.5">Briefly describe key activities, milestones and qualitative results or outcomes towards progress made during the reporting period.</p>
            {isLocked ? (
              <p className="text-[12px] text-gray-700 py-2 whitespace-pre-wrap">{report.narrative || '—'}</p>
            ) : (
              <textarea
                rows={6}
                value={report.narrative}
                onChange={e => { setReport(p => ({ ...p, narrative: e.target.value })); markDirty(); }}
                className="w-full text-[12px] border border-gray-300 px-3 py-2 focus:outline-none focus:border-[#1A5632] resize-y"
              />
            )}
            {!isLocked && (
              <ActivityEvidencePanel indicatorId={indicatorId} quarter={quarter} fiscalYear={fiscalYear} divisionCode={divCode}
                onAppend={(text) => { setReport(p => ({ ...p, narrative: p.narrative ? `${p.narrative}

${text}` : text })); markDirty(); }} />
            )}
          </div>

          {/* Challenges */}
          <ListField
            label="Challenges"
            hint="Note any issues or obstacles that affected implementation or data collection."
            items={challenges}
            setItems={setChallenges}
            placeholder="Describe a challenge..."
            isLocked={isLocked}
          />

          {/* Recommendations */}
          <ListField
            label="Recommendations"
            hint="Provide specific, actionable suggestions to address challenges or improve future results."
            items={recommendations}
            setItems={setRecommendations}
            placeholder="Specific, actionable recommendation..."
            isLocked={isLocked}
          />

          {/* Means of Verification — file upload to SharePoint */}
          <VerificationUpload
            reportId={reportId}
            parentType="indicator_report"
            reportType="Quarterly Reports"
            entity={indicator}
            fiscalYear={fiscalYear}
            readOnly={isLocked}
          />

          {/* ── Disaggregated Level Results ─────────────────────── */}
          <DisaggregationSection
            disaggregations={disaggregations}
            setDisaggregations={setDisaggregations}
            totalAchieved={totalAchieved}
            isLocked={isLocked}
          />

          {/* Actions */}
          {!isLocked ? (
            <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
              <div className="text-[10px] text-gray-400 mr-auto">
                {activeCategoryCount > 0 && <span>{activeCategoryCount} disaggregation{activeCategoryCount > 1 ? 's' : ''} added</span>}
              </div>
              <button
                onClick={() => handleSave(false)}
                disabled={saving}
                className="h-11 px-5 text-[12px] font-medium border border-gray-300 hover:bg-gray-50 flex items-center justify-center gap-2 text-gray-700"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Draft
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={saving || !report.actual_value}
                className="h-11 px-5 text-[12px] font-medium bg-[#1A5632] text-white hover:bg-[#15472a] flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Submit Report
              </button>
            </div>
          ) : isReviewer ? (
            <div className="border-t border-gray-200 py-3 space-y-2">
              {pendingApproval ? (
                <>
                  <p className="text-center text-[11px] text-amber-700 flex items-center justify-center gap-2">
                    <Eye className="w-3.5 h-3.5" />
                    Awaiting your decision — <strong>{pendingApproval.step_label}</strong>
                  </p>
                  <div className="flex items-center justify-center gap-3 mt-2">
                    <button
                      onClick={async () => {
                        try {
                          await api.put(`/governance/steps/${pendingApproval.step_id}/decide`, { decision: 'APPROVED', comments: '' });
                          toast.success('Report approved');
                          window.location.reload();
                        } catch (err) {
                          toast.error(err.response?.data?.message || err.response?.data?.error?.message || 'Failed to approve');
                        }
                      }}
                      className="px-5 py-2 text-[11px] font-medium bg-[#1A5632] text-white hover:bg-[#14442A]"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setRejectOpen(true)}
                      className="px-5 py-2 text-[11px] font-medium border border-red-300 text-red-600 hover:bg-red-50"
                    >
                      Reject
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-center text-[11px] text-amber-700 flex items-center justify-center gap-2">
                  <Eye className="w-3.5 h-3.5" />
                  Reviewer view — content editing is reserved for the focal person.
                </p>
              )}
            </div>
          ) : isViewingOtherDivision ? (
            <div className="text-center text-[11px] text-indigo-600 py-3 border-t border-gray-200 flex items-center justify-center gap-2">
              <Eye className="w-3.5 h-3.5" />
              <span>Viewing report from <strong className="font-mono">{urlDivision}</strong>.</span>
              <button
                onClick={() => navigate(quarterlyReportPath(indicatorId, { quarter, fiscalYear }))}
                className="text-indigo-600 hover:text-indigo-800 underline font-medium ml-1"
              >
                Back to your report
              </button>
            </div>
          ) : isReadOnly ? (
            <p className="text-center text-[11px] text-gray-500 py-3 border-t border-gray-200 flex items-center justify-center gap-2">
              <Eye className="w-3.5 h-3.5" />
              View only — your divisions are not listed on this indicator.
            </p>
          ) : (
            <p className="text-center text-[11px] text-gray-400 py-3 border-t border-gray-200">
              This report has been {st.label.toLowerCase()} and cannot be edited.
            </p>
          )}

          {isAdminOverride && reportId && (
            <div className="border-t border-gray-200 mt-2 pt-3">
              <div className="bg-amber-50 border border-amber-200 px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="text-[10px] text-amber-900">
                  <strong>Admin override.</strong> You can force any status (reopen an APPROVED report,
                  push back to DRAFT, etc.). The action is recorded in the workflow timeline as
                  <code className="bg-white px-1 ml-1">ADMIN_OVERRIDE</code>.
                </div>
                <button
                  onClick={() => { setOverrideStatus(''); setOverrideComment(''); setOverrideOpen(true); }}
                  className="text-[10px] px-3 py-1 bg-amber-600 text-white hover:bg-amber-700 whitespace-nowrap"
                >
                  Override status
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Workflow Timeline */}
        {reportHistory.length > 0 && (
          <div className="bg-white border border-gray-200 border-t-0 px-6 py-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-gray-400" />
                Workflow Timeline
              </h3>
              <span className="text-[9px] text-gray-400 font-medium">{reportHistory.length} event{reportHistory.length > 1 ? 's' : ''}</span>
            </div>

            {/* Current-step banner — makes the "in progress" state unmissable
                so "Approved — Step 1" is not mis-read as report-approved. */}
            {workflowProgress && workflowProgress.current && (
              <div className="mb-4 px-3 py-2 border-l-2 border-amber-400 bg-amber-50/60 flex items-start gap-2">
                <Clock className="w-3.5 h-3.5 text-amber-600 mt-[1px] flex-shrink-0" />
                <div className="flex-1 text-[11px] text-amber-800">
                  <div className="font-semibold">
                    In review — Step {workflowProgress.current.step_order} of {workflowProgress.total}
                  </div>
                  <div className="text-[10px] text-amber-700 mt-0.5">
                    {workflowProgress.current.step_label}
                    {workflowProgress.current.approver_id ? (
                      <> · awaiting <strong>{[workflowProgress.current.first_name, workflowProgress.current.last_name].filter(Boolean).join(' ') || workflowProgress.current.email}</strong></>
                    ) : workflowProgress.current.role_code === ROLES.ME_OFFICER && (
                      <> · awaiting <strong>any M&amp;E officer</strong></>
                    )}
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 text-[9px] font-semibold bg-amber-100 text-amber-700 uppercase tracking-wide">
                      {workflowProgress.done}/{workflowProgress.total} done
                    </span>
                  </div>
                </div>
              </div>
            )}

            <ol className="relative">
              {reportHistory.map((h, i) => {
                const name = [h.first_name, h.last_name].filter(Boolean).join(' ') || h.email || 'System';
                const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'SY';
                const date = h.performed_at ? new Date(h.performed_at) : null;
                const isLast = i === reportHistory.length - 1;
                const nextH = reportHistory[i + 1];

                // Style config per action
                const cfgMap = {
                  CREATED:     { Icon: FilePlus2,   label: 'Report created',      dot: 'bg-gray-400 text-white',         tag: 'bg-gray-100 text-gray-600' },
                  SUBMITTED:   { Icon: Upload,      label: 'Submitted for review',dot: 'bg-blue-500 text-white',         tag: 'bg-blue-50 text-blue-600' },
                  RESUBMITTED: { Icon: RotateCcw,   label: 'Resubmitted',         dot: 'bg-amber-500 text-white',        tag: 'bg-amber-50 text-amber-700' },
                  APPROVED:    { Icon: Check,       label: 'Approved',            dot: 'bg-[#1A5632] text-white',        tag: 'bg-[#1A5632]/10 text-[#1A5632]' },
                  REJECTED:    { Icon: XCircle,     label: 'Rejected',            dot: 'bg-red-500 text-white',          tag: 'bg-red-50 text-red-600' },
                };
                const cfg = cfgMap[h.action] || cfgMap.CREATED;
                const Icon = cfg.Icon;

                // Parse step label from comment: "Step Label: detail"
                let stepLabel = null;
                let commentDetail = h.comment || null;
                if ((h.action === 'APPROVED' || h.action === 'REJECTED') && h.comment) {
                  const colonIdx = h.comment.indexOf(':');
                  if (colonIdx > 0) {
                    stepLabel = h.comment.substring(0, colonIdx).trim();
                    const rest = h.comment.substring(colonIdx + 1).trim();
                    commentDetail = rest || null;
                  } else {
                    stepLabel = h.comment.trim();
                    commentDetail = null;
                  }
                }

                // Colored rail between a completed step and the next one
                const railColor = (h.action === 'APPROVED' && nextH) ? 'bg-[#1A5632]/30'
                  : (h.action === 'REJECTED' && nextH) ? 'bg-red-300'
                  : 'bg-gray-200';

                return (
                  <li key={h.id || i} className="relative pl-10 pb-4 last:pb-0">
                    {/* Vertical rail to the next item */}
                    {!isLast && (
                      <span className={`absolute left-[13px] top-7 bottom-0 w-[2px] ${railColor}`} aria-hidden />
                    )}
                    {/* Icon dot */}
                    <span className={`absolute left-0 top-0 w-[28px] h-[28px] rounded-full flex items-center justify-center ${cfg.dot} ${isLast ? 'ring-4 ring-[#1A5632]/10' : ''}`}>
                      <Icon className="w-3.5 h-3.5" strokeWidth={2.5} />
                    </span>

                    {/* Content card */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-semibold text-gray-900">{cfg.label}</span>
                        {stepLabel && (
                          <span className={`inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 ${cfg.tag} uppercase tracking-wide`}>
                            {stepLabel}
                          </span>
                        )}
                        {date && (
                          <span className="text-[10px] text-gray-400 ml-auto">
                            {date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            <span className="mx-1">·</span>
                            {date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>

                      {/* Actor */}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="inline-flex items-center justify-center w-[18px] h-[18px] text-[8px] font-bold bg-gray-100 text-gray-600 rounded-full">
                          {initials}
                        </span>
                        <span className="text-[10px] text-gray-600 font-medium">{name}</span>
                      </div>

                      {/* Comment */}
                      {commentDetail && (
                        <div className={`mt-2 flex gap-2 px-2.5 py-1.5 text-[10px] ${h.action === 'REJECTED' ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600'}`}>
                          <MessageSquare className="w-3 h-3 flex-shrink-0 mt-[2px] opacity-60" />
                          <span className="flex-1">{commentDetail}</span>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}

              {/* Remaining (pending / blocked) steps rendered as dashed ghost
                  entries so "Approved — Step 1" is never mistaken for the end
                  of the workflow. */}
              {pendingSteps.map((ps, pi) => {
                const approverName = [ps.first_name, ps.last_name].filter(Boolean).join(' ') || ps.email
                  || (ps.role_code === ROLES.ME_OFFICER ? 'Any M&E officer' : 'Unassigned');
                const approverInitials = approverName.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase() || '?';
                const isBlocked = ps.decision === 'BLOCKED_NO_APPROVER';
                const isLast = pi === pendingSteps.length - 1;
                return (
                  <li key={`pending-${ps.id}`} className="relative pl-10 pb-4 last:pb-0">
                    {!isLast && (
                      <span className="absolute left-[13px] top-7 bottom-0 w-[2px] border-l-2 border-dashed border-gray-300" aria-hidden />
                    )}
                    <span className={`absolute left-0 top-0 w-[28px] h-[28px] rounded-full flex items-center justify-center border-2 border-dashed ${isBlocked ? 'border-red-300 text-red-400' : 'border-amber-300 text-amber-500'} bg-white`}>
                      <Clock className="w-3.5 h-3.5" strokeWidth={2.5} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-semibold text-gray-500">
                          {isBlocked ? 'Blocked — no approver' : 'Pending'}
                        </span>
                        <span className={`inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 uppercase tracking-wide ${isBlocked ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                          {ps.step_label}
                        </span>
                        <span className="text-[10px] text-gray-400 ml-auto">Step {ps.step_order} of {workflowProgress?.total}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="inline-flex items-center justify-center w-[18px] h-[18px] text-[8px] font-bold bg-gray-100 text-gray-500 rounded-full">{approverInitials}</span>
                        <span className="text-[10px] text-gray-500 italic">Awaiting {approverName}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>

      {/* Reject modal */}
      {rejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRejectOpen(false)}>
          <div className="bg-white border border-gray-200 w-full max-w-[400px] p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-[14px] font-semibold text-gray-900 mb-2">Reject Report</h3>
            <p className="text-[12px] text-gray-600 mb-3">Provide a reason for rejecting this report. The focal person will be notified.</p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              className="w-full text-[12px] border border-gray-300 px-3 py-2 mb-4 focus:outline-none focus:border-red-400"
            />
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => { setRejectOpen(false); setRejectReason(''); }}
                className="px-4 py-2 text-[11px] border border-gray-300 text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button
                disabled={!rejectReason.trim()}
                onClick={async () => {
                  try {
                    if (pendingApproval) {
                      await api.put(`/governance/steps/${pendingApproval.step_id}/decide`, { decision: 'REJECTED', comments: rejectReason });
                    } else {
                      await api.post(`/reporting/indicator-division-reports/${reportId}/reject`, { reason: rejectReason });
                    }
                    toast.success('Report rejected');
                    setRejectOpen(false);
                    setRejectReason('');
                    window.location.reload();
                  } catch (err) {
                    toast.error(err.response?.data?.message || err.response?.data?.error?.message || 'Failed to reject');
                  }
                }}
                className="px-4 py-2 text-[11px] bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {overrideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !overrideSaving && setOverrideOpen(false)}>
          <div className="bg-white border border-gray-200 w-full max-w-[440px]" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-200 bg-amber-500 text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <h3 className="text-[13px] font-semibold">Admin override — force status</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="text-[11px] text-gray-600">
                Current status: <strong>{report?.status || '—'}</strong>. Choose the target status.
                This bypasses the workflow engine and closes any pending approval steps.
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide block mb-1">Target status *</label>
                <select
                  value={overrideStatus}
                  onChange={e => setOverrideStatus(e.target.value)}
                  className="w-full text-[12px] border border-gray-300 px-3 py-2 focus:outline-none focus:border-amber-500"
                >
                  <option value="">— pick a status —</option>
                  <option value="DRAFT">DRAFT (unlock for editing)</option>
                  <option value="SUBMITTED">SUBMITTED</option>
                  <option value="IN_REVIEW">IN_REVIEW</option>
                  <option value="APPROVED">APPROVED</option>
                  <option value="REJECTED">REJECTED (force resubmit)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide block mb-1">Reason / comment</label>
                <textarea
                  rows={3}
                  value={overrideComment}
                  onChange={e => setOverrideComment(e.target.value)}
                  placeholder="Why are you overriding the status? (recorded in the timeline)"
                  className="w-full text-[12px] border border-gray-300 px-3 py-2 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
              <button
                onClick={() => setOverrideOpen(false)}
                disabled={overrideSaving}
                className="text-[11px] px-3 py-1.5 border border-gray-300 text-gray-600 hover:bg-white disabled:opacity-50"
              >Cancel</button>
              <button
                disabled={!overrideStatus || overrideSaving || overrideStatus === report?.status}
                onClick={async () => {
                  setOverrideSaving(true);
                  try {
                    await api.post(
                      `/reporting/indicator-division-reports/${reportId}/admin-set-status`,
                      { status: overrideStatus, comment: overrideComment || null }
                    );
                    toast.success(`Status forced to ${overrideStatus}`);
                    setOverrideOpen(false);
                    window.location.reload();
                  } catch (err) {
                    toast.error(err.response?.data?.message || 'Override failed');
                  } finally {
                    setOverrideSaving(false);
                  }
                }}
                className="text-[11px] px-4 py-1.5 bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {overrideSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                Force status
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

// ─── ListField (challenges, recommendations, evidence) ─────────
/* eslint-disable react/no-array-index-key -- list items have no stable ID */
function ListField({ label, hint, items, setItems, placeholder, isLocked, icon: Icon }) {
  const filledItems = items.filter(v => v && v.trim());
  if (isLocked) {
    return (
      <div>
        <label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide block mb-1">{label}</label>
        {filledItems.length > 0 ? (
          <ul className="space-y-1 mt-1">
            {filledItems.map((item, idx) => (
              <li key={`item-${idx}`} className="flex items-start gap-2 text-[12px] text-gray-700">
                <span className="text-gray-400 font-mono text-[10px] mt-0.5">{idx + 1}.</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-gray-400 italic mt-1">—</p>
        )}
      </div>
    );
  }
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide block mb-1">{label}</label>
      <p className="text-[10px] text-gray-400 mb-1.5">{hint}</p>
      <div className="space-y-1.5">
        {items.map((item, idx) => (
          <div key={`edit-${idx}`} className="flex items-center gap-2">
            {Icon ? (
              <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            ) : (
              <span className="text-[10px] text-gray-400 font-mono w-4 text-right flex-shrink-0">{idx + 1}.</span>
            )}
            <input
              type="text"
              value={item}
              onChange={e => setItems(p => p.map((v, j) => j === idx ? e.target.value : v))}
              placeholder={placeholder}
              className="flex-1 text-[12px] border border-gray-300 px-3 py-2 focus:outline-none focus:border-[#1A5632]"
            />
            {items.length > 1 && (
              <button
                onClick={() => setItems(p => p.filter((_, j) => j !== idx))}
                className="text-gray-300 hover:text-red-400 flex-shrink-0"
                type="button"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setItems(p => [...p, ''])}
        className="mt-2 flex items-center gap-1.5 text-[11px] text-[#1A5632] hover:underline"
      >
        <Plus className="w-3.5 h-3.5" /> Add
      </button>
    </div>
  );
}

// ─── DisaggregationSection ─────────────────────────────────────
function DisaggregationSection({ disaggregations, setDisaggregations, totalAchieved, isLocked }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const pickerRef = useRef(null);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  const activeKeys = Object.keys(disaggregations);

  const addCategory = (catKey) => {
    if (activeKeys.includes(catKey)) return;
    const cat = findCategory(catKey);
    if (!cat) return;
    if (cat.special === 'member_states') {
      setDisaggregations(d => ({ ...d, [catKey]: { total: 0, list: [] } }));
    } else {
      const initial = {};
      cat.options.forEach(o => { initial[o.key] = ''; });
      setDisaggregations(d => ({ ...d, [catKey]: initial }));
    }
    setPickerOpen(false);
    setPickerSearch('');
  };

  const removeCategory = (catKey) => {
    setDisaggregations(d => {
      const next = { ...d };
      delete next[catKey];
      return next;
    });
  };

  const updateOption = (catKey, optKey, value) => {
    setDisaggregations(d => ({
      ...d,
      [catKey]: { ...(d[catKey] || {}), [optKey]: value },
    }));
  };

  const updateMemberStates = (patch) => {
    setDisaggregations(d => ({
      ...d,
      member_states: { ...(d.member_states || { total: 0, list: [] }), ...patch },
    }));
  };

  // Filter the picker
  const filteredCategories = useMemo(() => {
    const q = pickerSearch.toLowerCase().trim();
    return DISAGGREGATION_CATEGORIES.filter(c => {
      if (activeKeys.includes(c.key)) return false;
      if (!q) return true;
      return c.label.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q) || c.group.toLowerCase().includes(q);
    });
  }, [pickerSearch, activeKeys]);

  // Group filtered categories
  const groupedFiltered = useMemo(() => {
    const byGroup = {};
    filteredCategories.forEach(c => {
      if (!byGroup[c.group]) byGroup[c.group] = [];
      byGroup[c.group].push(c);
    });
    return byGroup;
  }, [filteredCategories]);

  return (
    <div className="border-t border-gray-200 pt-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide block">
            Disaggregated Level Results
          </label>
          <p className="text-[10px] text-gray-400 mt-0.5">
            Provide a breakdown of results by relevant categories — e.g., Sex, Region, Cadre.
            Enter actual numbers for each category by selecting the appropriate disaggregated options applicable to the indicator being reported.
          </p>
        </div>
      </div>

      {/* Active categories */}
      {activeKeys.length > 0 ? (
        <div className="space-y-3 mt-3">
          {activeKeys.map(catKey => {
            const cat = findCategory(catKey);
            if (!cat) return null;
            return (
              <DisaggregationCard
                key={catKey}
                category={cat}
                values={disaggregations[catKey]}
                totalAchieved={totalAchieved}
                onUpdateOption={(optKey, val) => updateOption(catKey, optKey, val)}
                onUpdateMemberStates={updateMemberStates}
                onRemove={() => removeCategory(catKey)}
                isLocked={isLocked}
              />
            );
          })}
        </div>
      ) : (
        <div className="mt-3 px-4 py-6 text-center bg-gray-50 border border-dashed border-gray-300 text-[11px] text-gray-400">
          No disaggregations added yet. Click <strong>"Add disaggregation"</strong> below to break down your results.
        </div>
      )}

      {/* Picker button */}
      {!isLocked && (
        <div className="relative mt-3" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setPickerOpen(!pickerOpen)}
            className="flex items-center gap-1.5 text-[11px] px-3 py-2 border border-[#1A5632] text-[#1A5632] hover:bg-[#1A5632] hover:text-white"
          >
            <Plus className="w-3.5 h-3.5" />
            Add disaggregation
            <ChevronDown className={`w-3 h-3 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
          </button>

          {pickerOpen && (
            <div className="absolute z-50 left-0 top-full mt-1 w-[460px] max-h-[420px] overflow-y-auto bg-white border border-gray-200 shadow-xl">
              {/* Search */}
              <div className="sticky top-0 bg-white border-b border-gray-100 p-2 z-10">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search categories..."
                    value={pickerSearch}
                    onChange={e => setPickerSearch(e.target.value)}
                    className="w-full text-[11px] border border-gray-200 pl-8 pr-3 py-1.5 outline-none focus:border-[#1A5632]"
                  />
                </div>
              </div>

              {/* Grouped categories */}
              {Object.keys(groupedFiltered).length === 0 ? (
                <div className="px-4 py-6 text-center text-[11px] text-gray-400">No matching categories.</div>
              ) : (
                DISAGGREGATION_GROUPS.map(group => {
                  const cats = groupedFiltered[group];
                  if (!cats || cats.length === 0) return null;
                  return (
                    <div key={group}>
                      <div className="px-3 py-1.5 bg-gray-50 text-[9px] font-bold uppercase tracking-widest text-gray-500 sticky">
                        {group}
                      </div>
                      {cats.map(cat => (
                        <button
                          key={cat.key}
                          type="button"
                          onClick={() => addCategory(cat.key)}
                          className="w-full text-left px-3 py-2 hover:bg-emerald-50 border-b border-gray-50 flex items-start gap-2 last:border-b-0"
                        >
                          <Plus className="w-3 h-3 text-[#1A5632] flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-medium text-gray-800">{cat.label}</div>
                            {cat.description && <div className="text-[9px] text-gray-400 truncate">{cat.description}</div>}
                          </div>
                          <span className="text-[8px] text-gray-300">{cat.options.length} opts</span>
                        </button>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── DisaggregationCard — one card per active category ─────────
function DisaggregationCard({ category, values, totalAchieved, onUpdateOption, onUpdateMemberStates, onRemove, isLocked }) {
  const [collapsed, setCollapsed] = useState(false);

  // Special: Member States picker
  if (category.special === 'member_states') {
    return (
      <div className="border border-gray-200 bg-white">
        <div className="px-4 py-2.5 bg-[#1A5632]/5 border-b border-gray-100 flex items-center gap-2">
          <button type="button" onClick={() => setCollapsed(c => !c)} className="text-gray-500 hover:text-gray-700">
            {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
          <span className="text-[11px] font-semibold text-gray-800">{category.label}</span>
          <span className="text-[9px] text-gray-400 ml-auto">{(values?.list || []).length} / {AU_MEMBER_STATES.length} selected</span>
          {!isLocked && (
            <button type="button" onClick={onRemove} className="text-gray-300 hover:text-red-400" title="Remove disaggregation">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {!collapsed && (
          <div className="px-4 py-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-gray-600 uppercase block mb-1">Total Number of MS</label>
                <input
                  type="number"
                  min="0"
                  onKeyDown={blockNegativeKeys}
                  value={values?.total ?? ''}
                  onChange={e => onUpdateMemberStates({ total: nonNegative(e.target.value) })}
                  disabled={isLocked}
                  className="w-full text-[12px] border border-gray-300 px-3 py-2 focus:outline-none focus:border-[#1A5632] disabled:bg-gray-100"
                  placeholder="0"
                />
              </div>
              <div className="flex items-end">
                <div className="text-[10px] text-gray-400">
                  Total reached across {AU_MEMBER_STATES.length} AU member states
                </div>
              </div>
            </div>
            <MemberStatesPicker
              selected={values?.list || []}
              onChange={(list) => onUpdateMemberStates({ list })}
              isLocked={isLocked}
            />
          </div>
        )}
      </div>
    );
  }

  // Standard category — sum of options (informational only, no validation
  // against Results Achieved: a disaggregation may count a different unit
  // than the indicator total, e.g. "100 trainings" with "1000 trainees by sex").
  const sum = Object.values(values || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  const filledOptions = Object.values(values || {}).filter(v => v !== '' && Number(v) > 0).length;

  return (
    <div className="border border-gray-200 bg-white">
      <div className="px-4 py-2.5 bg-[#1A5632]/5 border-b border-gray-100 flex items-center gap-2">
        <button type="button" onClick={() => setCollapsed(c => !c)} className="text-gray-500 hover:text-gray-700">
          {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
        <span className="text-[11px] font-semibold text-gray-800">{category.label}</span>
        <span className="text-[9px] text-gray-400">({filledOptions}/{category.options.length} filled)</span>
        <div className="ml-auto flex items-center gap-2">
          {sum > 0 && (
            <span className="text-[9px] text-gray-500 font-semibold">
              Subtotal: <strong className="text-[#1A5632]">{sum.toLocaleString()}</strong>
            </span>
          )}
          {!isLocked && (
            <button type="button" onClick={onRemove} className="text-gray-300 hover:text-red-400" title="Remove disaggregation">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {!collapsed && (
        <div className="px-4 py-3">
          {category.description && (
            <p className="text-[10px] text-gray-400 mb-2">{category.description}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {category.options.map(opt => (
              <div key={opt.key} className="flex items-center gap-2">
                <label className="text-[10px] text-gray-700 flex-1 min-w-0 truncate" title={opt.label}>{opt.label}</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  onKeyDown={blockNegativeKeys}
                  value={values?.[opt.key] ?? ''}
                  onChange={e => onUpdateOption(opt.key, nonNegative(e.target.value))}
                  disabled={isLocked}
                  placeholder="0"
                  className="w-[90px] text-[11px] border border-gray-200 px-2 py-1 text-right focus:outline-none focus:border-[#1A5632] disabled:bg-gray-100"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MemberStatesPicker — multi-select with region grouping ────
function MemberStatesPicker({ selected, onChange, isLocked }) {
  const [search, setSearch] = useState('');
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (code) => {
    if (isLocked) return;
    if (selectedSet.has(code)) {
      onChange(selected.filter(c => c !== code));
    } else {
      onChange([...selected, code]);
    }
  };

  const selectAllRegion = (region) => {
    if (isLocked) return;
    const codes = AU_MEMBER_STATES.filter(s => s.region === region).map(s => s.code);
    const merged = Array.from(new Set([...selected, ...codes]));
    onChange(merged);
  };

  const clearAll = () => {
    if (isLocked) return;
    onChange([]);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return AU_MEMBER_STATES;
    return AU_MEMBER_STATES.filter(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q));
  }, [search]);

  return (
    <div>
      <label className="text-[10px] font-semibold text-gray-600 uppercase block mb-1">List of MS Reached</label>

      {/* Search + region quick-add */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3 h-3 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search countries..."
            className="w-full text-[10px] border border-gray-200 pl-7 pr-2 py-1 focus:outline-none focus:border-[#1A5632]"
          />
        </div>
        {!isLocked && AU_REGIONS.map(r => (
          <button
            key={r}
            type="button"
            onClick={() => selectAllRegion(r)}
            className="text-[9px] px-2 py-1 border border-gray-200 hover:bg-[#1A5632]/10 hover:border-[#1A5632] hover:text-[#1A5632]"
          >
            +{r}
          </button>
        ))}
        {!isLocked && selected.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-[9px] px-2 py-1 border border-red-200 text-red-500 hover:bg-red-50"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Country grid */}
      <div className="border border-gray-200 max-h-[260px] overflow-y-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-0">
          {filtered.map(state => {
            const isSel = selectedSet.has(state.code);
            return (
              <button
                key={state.code}
                type="button"
                onClick={() => toggle(state.code)}
                disabled={isLocked}
                className={`text-[10px] px-2 py-1.5 border-b border-r border-gray-100 flex items-center gap-1.5 text-left ${
                  isSel ? 'bg-[#1A5632]/10 text-[#1A5632] font-semibold' : 'text-gray-700 hover:bg-gray-50'
                } disabled:cursor-not-allowed`}
              >
                <span className={`w-2.5 h-2.5 border flex-shrink-0 flex items-center justify-center ${isSel ? 'bg-[#1A5632] border-[#1A5632]' : 'border-gray-300'}`}>
                  {isSel && <CheckCircle2 className="w-2 h-2 text-white" />}
                </span>
                <span className="truncate">{state.name}</span>
                <span className="text-[8px] text-gray-300 ml-auto">{state.region[0]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {selected.map(code => {
            const s = AU_MEMBER_STATES.find(x => x.code === code);
            if (!s) return null;
            return (
              <span key={code} className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 bg-[#1A5632]/10 text-[#1A5632] border border-[#1A5632]/20">
                {s.name}
                {!isLocked && (
                  <button type="button" onClick={() => toggle(code)} className="hover:text-red-500">
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
