/* eslint-disable complexity, max-lines, react-hooks/exhaustive-deps --
 * complexity + max-lines: pre-existing, tracked for file-size split.
 * exhaustive-deps: openBroad in useMemo — intentional init-once pattern.
 */
import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Loader2, ChevronDown, ChevronRight, ClipboardList } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveDivision } from '@/contexts/ActiveDivisionContext';
import { fmtBudgetCompact as fmt } from '@rbm/lib/formatters';
import { STATUSES, STATUS_COLORS } from '@rbm/lib/enums';
import { useActivityReportsData, useReportingPeriods } from './hooks/useReportingQueries';
import { useReportingYear } from './hooks/useReportingYear';
import { QUARTERS, resolveQuarter, openPeriodFor } from './activity-report/reportingQuarter';
import ReportingQuarterNotice from './activity-report/ReportingQuarterNotice';

const FALLBACK_NA = { bg: 'bg-gray-50', text: 'text-gray-400', label: 'N/A' };
const getStatusStyle = (status) => STATUS_COLORS[status] || FALLBACK_NA;

// An activity carries SEVERAL independent reports per quarter (D-20260818-01).
// It counts as "reported" as soon as ONE of them is submitted or approved, and
// the row chip shows the most advanced status of the bunch.
const isCounted = (r) => r.status === STATUSES.SUBMITTED || r.status === STATUSES.APPROVED;
const STATUS_RANK = [STATUSES.APPROVED, STATUSES.SUBMITTED, STATUSES.DRAFT, STATUSES.REJECTED];
const bestStatus = (rows) => STATUS_RANK.find((s) => rows.some((r) => r.status === s)) || rows[0]?.status || null;
const countReported = (specs, reportsMap) => specs.filter((s) => (reportsMap[s.id] || []).some(isCounted)).length;


export default function ActivityReportPage() {
  const { user } = useAuth();
  const { activeDivision, activeCodes, loaded: divLoaded } = useActiveDivision();
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuarter = searchParams.get('q');
  const { data: periods = [], isLoading: periodsLoading } = useReportingPeriods();
  const { fiscalYear, isResolvingYear } = useReportingYear(periods, periodsLoading);
  // Open period over calendar: following the clock hid every Q3 report on
  // 1 October while the Q3 window was still open (see reportingQuarter.js).
  const quarter = resolveQuarter(urlQuarter, periods, fiscalYear);
  const openPeriod = openPeriodFor(periods, fiscalYear);
  const isResolvingQuarter = (!QUARTERS.includes(urlQuarter) && periodsLoading) || isResolvingYear;
  const handleQuarterChange = (q) => {
    const next = new URLSearchParams(searchParams);
    next.set('q', q);
    setSearchParams(next, { replace: true });
  };
  const [openBroad, setOpenBroad] = useState({});

  const { data, isLoading } = useActivityReportsData({ quarter, fiscalYear });

  const { broads: myBroads, specifics: mySpecs, reportsMap } = useMemo(() => {
    if (!data || !activeCodes?.size) return { broads: [], specifics: [], reportsMap: {} };
    const allBroads = data.broads;
    const allSpecs = data.specifics;
    const ownedBroads = allBroads.filter((b) => activeCodes.has(String(b.responsible_division_code || '').toUpperCase()));
    const ownedBroadIds = new Set(ownedBroads.map((b) => b.id));
    // A division reports on a specific when it is RESPONSIBLE for it, when it
    // owns the parent broad, or when it is listed in the specific's own
    // contributing_divisions (D-20260708-01 — contributor reporting; the
    // backend routes those submissions through the contributor chain).
    const parseContribs = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
    };
    const isContribFor = (s) => parseContribs(s.contributing_divisions)
      .some((c) => activeCodes.has(String(c).toUpperCase()));
    const isResponsibleFor = (s) => activeCodes.has(String(s.responsible_division_code || '').toUpperCase());
    const filteredSpecs = allSpecs
      .filter((s) => isResponsibleFor(s) || ownedBroadIds.has(s.parent_id) || isContribFor(s))
      .map((s) => ({ ...s, is_contrib_for_user: !isResponsibleFor(s) && isContribFor(s) }));
    // Also display FOREIGN broads that contain specifics this division is
    // responsible for (e.g. Communications owns 6 specifics under an IMZ
    // broad). Without this, those specifics were counted in the totals but
    // had no group to render under — the division could never report them.
    const specParentIds = new Set(filteredSpecs.map((s) => s.parent_id));
    const filteredBroads = allBroads.filter((b) => ownedBroadIds.has(b.id) || specParentIds.has(b.id));
    const rmap = {};
    data.reports.forEach((r) => { (rmap[r.plan_node_id] = rmap[r.plan_node_id] || []).push(r); });
    if (Object.keys(openBroad).length === 0) {
      const op = {};
      filteredBroads.forEach((b) => { op[b.id] = true; });
      setOpenBroad(op);
    }
    return { broads: filteredBroads, specifics: filteredSpecs, reportsMap: rmap };
  }, [data, activeCodes]);

  const toggle = (id) => setOpenBroad((prev) => ({ ...prev, [id]: !prev[id] }));

  const specsByBroad = useMemo(() => {
    const map = {};
    mySpecs.forEach((s) => {
      if (!map[s.parent_id]) map[s.parent_id] = [];
      map[s.parent_id].push(s);
    });
    return map;
  }, [mySpecs]);

  const visibleBroads = useMemo(
    () => myBroads.filter((b) => (specsByBroad[b.id] || []).length > 0),
    [myBroads, specsByBroad],
  );

  const totalSpecs = mySpecs.length;
  const reportedCount = countReported(mySpecs, reportsMap);
  const pct = totalSpecs > 0 ? Math.round((reportedCount / totalSpecs) * 100) : 0;

  if (isLoading || isResolvingQuarter) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/report' }, { label: 'Activity Report' }]}>
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-[#D97706]" />
        </div>
      </DashboardLayout>
    );
  }

  // Division scope comes from user_divisions via useActiveDivision —
  // users.division_code is the LEGACY single-division column and is NULL for
  // anyone assigned through the admin since the multi-division model
  // (D-20260415-11: never gate on user.division_code alone).
  if (divLoaded && !activeCodes?.size && !user?.division_code) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/report' }, { label: 'Activity Report' }]}>
        <div className="p-6 text-[11px] text-gray-500">No division assigned to your account.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/report' }, { label: 'Activity Report' }]}>
      <div className="space-y-0">

        {/* Hero */}
        <div className="bg-[#D97706] text-white">
          <div className="px-6 py-5 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">
                  {quarter} {fiscalYear}
                </span>
                <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold bg-white/15">{activeDivision?.code || user?.division_code || 'ALL'}</span>
                {(activeDivision?.parent_code || user?.directorate) && <span className="text-[10px] text-white/60">{activeDivision?.parent_code || user.directorate}</span>}
              </div>
              <h1 className="text-[18px] font-semibold leading-snug">Activity Report — {activeDivision?.division_name || user?.division_name || 'All my divisions'}</h1>
              <p className="text-[11px] text-white/70 mt-1">Report on each specific activity grouped by broad activity</p>
            </div>
            <div className="text-right">
              <div className="text-[36px] font-bold leading-none">{pct}%</div>
              <div className="text-[10px] text-white/70 mt-1">{reportedCount} / {totalSpecs} reported</div>
            </div>
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-white/70">
            <div role="group" aria-label="Quarter" className="flex">
              {QUARTERS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleQuarterChange(q)}
                  aria-pressed={q === quarter}
                  className={`px-2.5 py-1 text-[11px] font-semibold border border-white/30 -ml-px first:ml-0 ${q === quarter ? 'bg-white text-[#D97706]' : 'text-white hover:bg-white/10'}`}
                >
                  {q}
                </button>
              ))}
            </div>
            <span><strong className="text-white">{visibleBroads.length}</strong> Broad Activities</span>
            <span><strong className="text-white">{totalSpecs}</strong> Specific Activities</span>
            <span><strong className="text-white">{reportedCount}</strong> Reported</span>
          </div>
        </div>

        <ReportingQuarterNotice quarter={quarter} fiscalYear={fiscalYear} openPeriod={openPeriod} />

        {/* Info banner */}
        <div className="bg-amber-50 border border-amber-200 border-t-0 px-5 py-2.5 text-[11px] text-amber-800">
          <strong>Activity Report</strong> — Click any specific activity to write what was accomplished: dates, location, participants, achievements, challenges, actual spend.
        </div>

        {/* Groups */}
        {visibleBroads.length === 0 && (
          <div className="bg-white border border-gray-200 border-t-0 px-5 py-12 text-center">
            <ClipboardList className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-[13px] text-gray-400">
              {myBroads.length === 0
                ? 'No broad activities assigned to your division'
                : 'No specific activities found under this broad activity'}
            </p>
          </div>
        )}

        {visibleBroads.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true })).map((broad) => {
          const specs = specsByBroad[broad.id] || [];
          const isOpen = openBroad[broad.id];
          const broadReported = countReported(specs, reportsMap);

          return (
            <div key={broad.id} className="bg-white border border-gray-200 border-t-0">
              <button
                onClick={() => toggle(broad.id)}
                className="w-full px-5 py-2.5 flex items-center gap-3 text-left hover:bg-gray-50 bg-[#B45309]/10 border-b border-gray-100"
              >
                {isOpen
                  ? <ChevronDown className="w-3.5 h-3.5 text-[#B45309] flex-shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 text-[#B45309] flex-shrink-0" />
                }
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-[#B45309] text-white text-[9px] font-bold flex-shrink-0">
                  {broad.code}
                </span>
                <span className="text-[11px] font-semibold text-gray-900 flex-1 truncate">{broad.title}</span>
                {!activeCodes.has(String(broad.responsible_division_code || '').toUpperCase()) && (
                  <span
                    className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-gray-100 text-gray-500 border border-gray-200 flex-shrink-0"
                    title={`This broad activity belongs to ${broad.responsible_division_code} — it is shown because your division is responsible for specific activities under it.`}
                  >
                    Owner: {broad.responsible_division_code}
                  </span>
                )}
                <span className="text-[9px] text-gray-500">{broadReported} / {specs.length} reported</span>
                <span className="text-[10px] font-semibold text-[#B45309] w-[80px] text-right">{fmt(broad.budget_total_2026)}</span>
              </button>

              {isOpen && (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[9px] text-gray-400 border-b border-gray-100 bg-gray-50/50">
                      <th className="px-3 py-1.5 font-normal w-[120px]">Code</th>
                      <th className="px-3 py-1.5 font-normal">Specific Activity</th>
                      <th className="px-3 py-1.5 font-normal w-[90px] text-right">Budget</th>
                      <th className="px-3 py-1.5 font-normal w-[100px] text-center">Status</th>
                      <th className="px-3 py-1.5 font-normal w-[80px] text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {specs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-6 text-center text-[10px] text-gray-400">No specific activities under this broad activity.</td>
                      </tr>
                    ) : specs.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true })).map((spec, idx) => {
                      const reports = reportsMap[spec.id] || [];
                      const status = bestStatus(reports);
                      const st = getStatusStyle(status);
                      const isNaOnly = reports.length === 1 && reports[0].status === STATUSES.NOT_APPLICABLE;
                      const linkable = reports.filter((r) => r.status !== STATUSES.NOT_APPLICABLE);
                      return (
                        <tr key={spec.id} className={`border-b border-gray-100 hover:bg-orange-50/30 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                          <td className="px-3 py-2 text-[9px] font-mono font-bold text-[#D97706]">{spec.code}</td>
                          <td className="px-3 py-2 text-[10px] text-gray-800">
                            {spec.title}
                            {spec.is_contrib_for_user && (
                              <span
                                className="ml-1.5 inline-block px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600 border border-blue-200 align-middle"
                                title={`Your division is a contributor on this activity (responsible: ${spec.responsible_division_code || 'unknown'}). Your report is routed through the contributor approval chain.`}
                              >
                                Contributor
                              </span>
                            )}
                            {linkable.map((r) => (
                              <button
                                key={r.id}
                                onClick={() => navigate(`/activity-report/${spec.id}/report/${r.id}`)}
                                className="block text-[9px] text-gray-500 hover:text-[#D97706] hover:underline mt-0.5"
                              >
                                {(getStatusStyle(r.status).label || r.status).toLowerCase()} · {r.prepared_by_name || 'unknown'}
                              </button>
                            ))}
                          </td>
                          <td className="px-3 py-2 text-[10px] text-gray-700 text-right">{fmt(spec.budget_total_2026)}</td>
                          <td className="px-3 py-2 text-center">
                            {status ? (
                              <>
                                <span className={`text-[9px] font-semibold px-1.5 py-0.5 ${st.bg} ${st.text}`}>{st.label}</span>
                                {reports.length > 1 && (
                                  <div className="text-[8px] text-gray-400 mt-0.5">{reports.length} reports</div>
                                )}
                              </>
                            ) : (
                              <span className="text-[9px] text-gray-300">Not started</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {isNaOnly ? (
                                <span className="text-[9px] text-gray-400 italic" title={reports[0].rejection_reason || ''}>
                                  N/A
                                </span>
                              ) : (
                                <button
                                  onClick={() => navigate(`/activity-report/${spec.id}/new?q=${quarter}`)}
                                  className="text-[10px] px-2 py-1 border border-[#D97706] text-[#D97706] hover:bg-[#D97706] hover:text-white"
                                >
                                  {reports.length ? 'New report' : 'Report'}
                                </button>
                              )}
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
        })}
      </div>
    </DashboardLayout>
  );
}
