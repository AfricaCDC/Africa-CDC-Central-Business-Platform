/* eslint-disable complexity, max-lines, no-restricted-syntax --
 * One cohesive reporting dashboard: hero + 6 summary cards + a sortable division
 * table. Its render branches once per card / column / status badge (complexity),
 * it is a single coupled view that gains no clarity from splitting (max-lines),
 * and the no-restricted-syntax hits are CSV/UI column labels (e.g. the "Division"
 * <Th label>), not ENTITY_TYPES. Pre-existing oversize; the quarterly-report
 * ExportMenu was wired in here for C-2. Full split tracked separately. */
import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Loader2, BarChart3, AlertTriangle, Target, CheckCircle2, Clock, TrendingUp, ShieldAlert } from 'lucide-react';
import { RBAC_MODULES, RBAC_ACTIONS } from '@rbm/lib/rbac';
import ExportMenu from '@/components/shared/ExportMenu';
import { exportApi, triggerDownload } from '@/services/export.api';
import { usePermissions } from '@/hooks/usePermissions';
import { useQuarterlyDashboard, useReportingPeriods } from './hooks/useReportingQueries';
import { useReportingYear } from './hooks/useReportingYear';
import { QUARTERS } from './activity-report/reportingQuarter';

const currentQuarter = () => 'Q' + (Math.floor(new Date().getMonth() / 3) + 1);

const STATUS_BADGE = {
  // fully_approved = every report also cleared M&E sign-off — the backend
  // emits it since the approved-status split; without this key the badge
  // fell back to "Not started" under a 100% progress bar.
  fully_approved: { bg: 'bg-[#1A5632]',  text: 'text-white',      label: 'Fully approved' },
  fully_reported: { bg: 'bg-[#E0F0E9]', text: 'text-[#1A5632]', label: 'Fully reported' },
  in_progress:    { bg: 'bg-amber-50',   text: 'text-amber-700',  label: 'In progress' },
  not_started:    { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'Not started' },
};

const PERIOD_STATUS = {
  OPEN:   { bg: 'bg-[#E0F0E9]', text: 'text-[#1A5632]', label: 'Open' },
  CLOSED: { bg: 'bg-gray-100',  text: 'text-gray-500',   label: 'Closed' },
  DRAFT:  { bg: 'bg-amber-50',  text: 'text-amber-700',  label: 'Draft' },
};

const ACHIEVEMENT_COLOR = (pct) => {
  if (pct === null || pct === undefined) return { text: 'text-gray-400', bg: '' };
  if (pct >= 90) return { text: 'text-[#1A5632]', bg: 'bg-[#E0F0E9]' };
  if (pct >= 50) return { text: 'text-amber-700', bg: 'bg-amber-50' };
  return { text: 'text-red-600', bg: 'bg-red-50' };
};

// ── Sort helpers ──
function sortDivisions(list, sortKey, sortDir) {
  return [...list].sort((a, b) => {
    let av = a[sortKey];
    let bv = b[sortKey];
    // Treat null achievement_pct as -1 so nulls sort last
    if (sortKey === 'achievement_pct') {
      av = av ?? -1;
      bv = bv ?? -1;
    }
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortDir === 'asc' ? av - bv : bv - av;
    }
    return sortDir === 'asc'
      ? String(av || '').localeCompare(String(bv || ''))
      : String(bv || '').localeCompare(String(av || ''));
  });
}

// ── Summary card (clickable variant) ──
function SummaryCard({ icon: Icon, label, value, sub, color, active, onClick }) {
  return (
    <div
      className={`px-5 py-4 flex items-center gap-3 transition-colors ${onClick ? 'cursor-pointer hover:bg-gray-50' : ''} ${active ? 'ring-2 ring-inset ring-[#1A5632] bg-[#E0F0E9]/30' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}
    >
      <Icon className="w-7 h-7 flex-shrink-0" style={{ color }} />
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
        <div className="text-[18px] font-bold text-gray-900 mt-0.5">{value}</div>
        {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
      </div>
    </div>
  );
}

// ── Progress bar (inline in table) ──
function MiniProgress({ pct }) {
  const color = pct === 100 ? '#1A5632' : pct > 0 ? '#E8A838' : '#e5e7eb';
  return (
    <div className="w-full h-2 bg-gray-100">
      <div className="h-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

// ── Column header (sortable) ──
function Th({ label, sortKey: sk, currentKey, currentDir, onSort, className = '' }) {
  const active = currentKey === sk;
  return (
    <th
      className={`px-3 py-2 text-[10px] text-gray-500 cursor-pointer select-none hover:text-gray-700 ${className}`}
      onClick={() => onSort(sk)}
    >
      {label}
      {active && <span className="ml-0.5">{currentDir === 'asc' ? '\u25B2' : '\u25BC'}</span>}
    </th>
  );
}

export default function QuarterlyDashboardPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canExport = can(RBAC_MODULES.QUARTERLY_REPORT, RBAC_ACTIONS.EXPORT);
  // Year of the open reporting period, not the clock: Q4 is reviewed in January (D-20261106-01).
  const { data: periods = [], isLoading: periodsLoading } = useReportingPeriods();
  const { fiscalYear } = useReportingYear(periods, periodsLoading);
  const [searchParams, setSearchParams] = useSearchParams();
  const quarter = QUARTERS.includes(searchParams.get('q')) ? searchParams.get('q') : null;
  const setQuarter = (q) => {
    const next = new URLSearchParams(searchParams);
    next.set('q', q);
    setSearchParams(next, { replace: true });
  };
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [cardFilter, setCardFilter] = useState(null); // null | 'missing_baseline' | 'missing_target' | 'needs_attention'
  const [isExporting, setIsExporting] = useState(false);

  // Pass null quarter on first load -> backend returns active period.
  const { data, isLoading, error } = useQuarterlyDashboard({ fiscalYear, quarter });

  const period = data?.period || null;
  const summary = data?.summary || null;
  const requestedQuarter = data?.requested_quarter || null;

  const divisions = useMemo(() => {
    if (!data?.divisions) return [];
    let filtered = data.divisions.filter(d => d.code !== '__UNASSIGNED__');
    // Apply card filter
    if (cardFilter === 'missing_baseline') {
      filtered = filtered.filter(d => d.missing_baseline_count > 0);
    } else if (cardFilter === 'missing_target') {
      filtered = filtered.filter(d => d.missing_target_count > 0);
    } else if (cardFilter === 'needs_attention') {
      filtered = filtered.filter(d => d.underperformed_count > 0 || d.missing_baseline_count > 0 || d.missing_target_count > 0);
    }
    return sortDivisions(filtered, sortKey, sortDir);
  }, [data?.divisions, sortKey, sortDir, cardFilter]);

  const allDivisions = useMemo(() => {
    if (!data?.divisions) return [];
    return data.divisions.filter(d => d.code !== '__UNASSIGNED__');
  }, [data?.divisions]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const handleRowClick = (divCode) => {
    navigate(`/division-reports?division=${divCode}`);
  };

  const toggleCardFilter = (filter) => {
    setCardFilter(prev => prev === filter ? null : filter);
  };

  // ── Loading ──
  if (isLoading) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Reporting', path: '/reporting' }, { label: 'Quarterly Dashboard' }]}>
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" />
        </div>
      </DashboardLayout>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Reporting', path: '/reporting' }, { label: 'Quarterly Dashboard' }]}>
        <div className="bg-white border border-gray-200 px-6 py-16 text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h2 className="text-[14px] font-semibold text-gray-700">Failed to load dashboard</h2>
          <p className="text-[12px] text-gray-400 mt-1">Please try again later.</p>
        </div>
      </DashboardLayout>
    );
  }

  const displayQuarter = quarter || period?.quarter || requestedQuarter || currentQuarter();
  const periodStyle = period ? (PERIOD_STATUS[period.status] || PERIOD_STATUS.DRAFT) : null;
  const overallPct = summary && summary.total_indicators > 0
    ? Math.round((summary.total_reported / summary.total_indicators) * 100)
    : 0;

  const needsAttentionCount = (summary?.total_underperformed || 0) + (summary?.total_missing_baseline || 0) + (summary?.total_missing_target || 0);

  const handleExport = async (format) => {
    setIsExporting(true);
    try {
      const res = await exportApi.quarterlyReport({ fiscalYear, quarter: displayQuarter, format });
      triggerDownload(res, `quarterly-report-${fiscalYear}-${displayQuarter}.${format}`);
    } catch {
      toast.error('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Reporting', path: '/reporting' }, { label: 'Quarterly Dashboard' }]}>
      <div className="space-y-0">

        {/* Hero banner */}
        <div className="bg-[#1A5632] text-white px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[17px] font-semibold leading-snug">Quarterly Reporting Dashboard</h1>
              <p className="text-[11px] text-white/60 mt-1">Division-level reporting completeness for {displayQuarter} FY{fiscalYear}</p>
              {/* Quarter selector */}
              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                {QUARTERS.map(q => (
                  <button
                    key={q}
                    onClick={() => { setQuarter(q); setCardFilter(null); }}
                    className={`px-3 py-1.5 text-[11px] font-medium border transition-colors ${
                      displayQuarter === q
                        ? 'bg-white text-[#1A5632] border-white'
                        : 'border-white/30 text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {q}
                  </button>
                ))}
                {periodStyle ? (
                  <span className={`ml-3 text-[9px] font-semibold px-2 py-0.5 ${periodStyle.bg} ${periodStyle.text}`}>
                    {periodStyle.label}
                  </span>
                ) : (
                  <span className="ml-3 text-[9px] font-semibold px-2 py-0.5 bg-gray-100 text-gray-500">
                    Not opened
                  </span>
                )}
              </div>
            </div>
            {/* Overall completion */}
            <div className="sm:text-right pt-1">
              <div className="flex flex-wrap sm:justify-end items-center gap-2 mb-2">
                <button
                  onClick={() => navigate(`/reporting/division-summary?quarter=${displayQuarter}&fy=${fiscalYear}`)}
                  className="px-3 py-1.5 text-[11px] font-medium border border-white/30 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  Division summary
                </button>
                {canExport && (
                  <ExportMenu onExport={handleExport} isExporting={isExporting} label="Export quarterly" />
                )}
              </div>
              <div className="text-[42px] font-black leading-none">{overallPct}%</div>
              <div className="text-[11px] text-white/60 mt-1">{summary?.total_reported || 0} / {summary?.total_indicators || 0} indicators reported</div>
            </div>
          </div>
          <div className="mt-4 w-full bg-white/20 h-2.5 overflow-hidden">
            <div className="h-full bg-white transition-all duration-700" style={{ width: `${overallPct}%` }} />
          </div>
        </div>

        {/* Period status banner (when no period exists) */}
        {!period && (
          <div className="bg-amber-50 border border-gray-200 border-t-0 px-5 py-2.5 text-[11px] text-amber-800 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            <span><strong>{displayQuarter} reporting window has not been opened yet.</strong> Showing indicator distribution across divisions. No actuals are available.</span>
          </div>
        )}

        {/* Summary cards — 6 cards in 2 rows of 3 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 border border-gray-200 border-t-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-200 bg-white">
          <SummaryCard
            icon={BarChart3}
            label="Total Divisions"
            value={summary?.total_divisions || 0}
            sub={`${summary?.fully_reported || 0} fully reported`}
            color="#1A5632"
          />
          <SummaryCard
            icon={CheckCircle2}
            label="Fully Reported"
            value={`${summary?.total_divisions ? Math.round((summary.fully_reported / summary.total_divisions) * 100) : 0}%`}
            sub={`${summary?.fully_reported || 0} of ${summary?.total_divisions || 0} divisions`}
            color="#16a34a"
          />
          <SummaryCard
            icon={TrendingUp}
            label="On Track"
            value={summary?.total_achieved || 0}
            sub="Actual >= quarterly target"
            color="#1A5632"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 border border-gray-200 border-t-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-200 bg-white">
          <SummaryCard
            icon={AlertTriangle}
            label="Missing Baselines"
            value={summary?.total_missing_baseline || 0}
            sub="Indicators without baseline"
            color="#dc2626"
            active={cardFilter === 'missing_baseline'}
            onClick={() => toggleCardFilter('missing_baseline')}
          />
          <SummaryCard
            icon={Target}
            label="Missing Targets"
            value={summary?.total_missing_target || 0}
            sub={`No ${displayQuarter} target set`}
            color="#E8A838"
            active={cardFilter === 'missing_target'}
            onClick={() => toggleCardFilter('missing_target')}
          />
          <SummaryCard
            icon={ShieldAlert}
            label="Needs Attention"
            value={needsAttentionCount}
            sub="Under-target + missing data"
            color="#dc2626"
            active={cardFilter === 'needs_attention'}
            onClick={() => toggleCardFilter('needs_attention')}
          />
        </div>

        {/* Active filter banner */}
        {cardFilter && (
          <div className="bg-blue-50 border border-gray-200 border-t-0 px-5 py-2 text-[11px] text-blue-800 flex items-center justify-between">
            <span>
              Showing {divisions.length} of {allDivisions.length} divisions
              {cardFilter === 'missing_baseline' && ' with missing baselines'}
              {cardFilter === 'missing_target' && ' with missing targets'}
              {cardFilter === 'needs_attention' && ' needing attention'}
            </span>
            <button onClick={() => setCardFilter(null)} className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 px-2 py-0.5 border border-blue-300 hover:bg-blue-100">
              Clear filter
            </button>
          </div>
        )}

        {/* Division table */}
        <div className="bg-white border border-gray-200 border-t-0">
          <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-gray-800">
              Division Reporting Status
            </h3>
            <span className="text-[10px] text-gray-400">{divisions.length} divisions</span>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] text-gray-500 border-b border-gray-200 bg-gray-50/50">
                <Th label="Division" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="pl-5 w-[260px]" />
                <th className="px-3 py-2 text-[10px] text-gray-500 w-[120px]">Progress</th>
                <Th label="Reported" sortKey="completion_pct" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="text-center w-[90px]" />
                <Th label="Total" sortKey="total_indicators" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="text-center w-[60px]" />
                <Th label="Achievement" sortKey="achievement_pct" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="text-center w-[90px]" />
                <Th label="On Track" sortKey="achieved_count" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="text-center w-[70px]" />
                <Th label="No Baseline" sortKey="missing_baseline_count" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="text-center w-[80px]" />
                <Th label="No Target" sortKey="missing_target_count" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="text-center w-[80px]" />
                <th className="px-3 py-2 text-[10px] text-gray-500 text-center w-[90px]">Status</th>
              </tr>
            </thead>
            <tbody>
              {divisions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-[13px] text-gray-400">
                    {cardFilter ? 'No divisions match the current filter.' : 'No divisions with T3/T4 indicators found.'}
                  </td>
                </tr>
              ) : (
                divisions.map((div, idx) => {
                  const badge = STATUS_BADGE[div.status] || STATUS_BADGE.not_started;
                  const achColor = ACHIEVEMENT_COLOR(div.achievement_pct);
                  return (
                    <tr
                      key={div.code}
                      className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${idx % 2 ? 'bg-gray-50/30' : ''}`}
                      onClick={() => handleRowClick(div.code)}
                    >
                      <td className="pl-5 pr-3 py-2.5">
                        <div className="text-[12px] font-medium text-gray-800">{div.name}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          <span className="font-mono">{div.code}</span>
                          {div.directorate && <span className="ml-1.5">{div.directorate}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <MiniProgress pct={div.completion_pct} />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-[12px] font-semibold text-gray-800">
                          {div.reported_count}/{div.total_indicators}
                        </span>
                        <span className="text-[10px] text-gray-400 ml-1">({div.completion_pct}%)</span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-[12px] text-gray-600">
                        {div.total_indicators}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {div.achievement_pct !== null && div.achievement_pct !== undefined ? (
                          <span className={`text-[11px] font-semibold px-1.5 py-0.5 ${achColor.bg} ${achColor.text}`}>
                            {div.achievement_pct}%
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-300">N/A</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {div.achieved_count > 0 ? (
                          <span className="text-[11px] font-semibold text-[#1A5632]">{div.achieved_count}</span>
                        ) : (
                          <span className="text-[11px] text-gray-300">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {div.missing_baseline_count > 0 ? (
                          <span className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5">
                            {div.missing_baseline_count}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-300">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {div.missing_target_count > 0 ? (
                          <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5">
                            {div.missing_target_count}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-300">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-[9px] font-semibold px-2 py-0.5 ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
