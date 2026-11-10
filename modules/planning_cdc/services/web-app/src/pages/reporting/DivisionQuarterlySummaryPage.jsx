/* eslint-disable complexity, no-restricted-syntax --
 * One cohesive reporting view: hero (division picker + quarter selector + PPTX/
 * XLSX/CSV export) → KPI cards → indicators table → activity reports. It branches
 * once per loading/empty/error/data state and once per indicator cell (same
 * shape as the sibling QuarterlyDashboardPage). The single no-restricted-syntax
 * hit is the 'division' URL search-param key (params.get('division') /
 * setFilter('division', …)), NOT an ENTITY_TYPES ref. */
// ── Division Quarterly Summary (VH-6 / D-1) ──
// Owned + contributed indicators, KPIs and the activity reports filed for
// one division × fiscal year × quarter. Filters live in the URL (division,
// quarter). Export (XLSX/CSV) is gated by quarterly_report:export.
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { RBAC_MODULES, RBAC_ACTIONS } from '@rbm/lib/rbac';
import ExportMenu from '@/components/shared/ExportMenu';
import SearchSelect from '@/components/shared/SearchSelect';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/QueryStates';
import { exportApi, triggerDownload } from '@/services/export.api';
import { usePermissions } from '@/hooks/usePermissions';
import { useActiveDivision } from '@/contexts/ActiveDivisionContext';
import { useDivisionCodes } from '@/hooks/useMiscQueries';
import { useDivisionQuarterlySummary, useReportingPeriods } from './hooks/useReportingQueries';
import { useReportingYear } from './hooks/useReportingYear';
import { QUARTERS, resolveQuarter } from './activity-report/reportingQuarter';
import DivisionActivityReportsPanel from './DivisionActivityReportsPanel';

const ROLE_BADGE = {
  OWNER: { bg: 'bg-[#E0F0E9]', text: 'text-[#1A5632]', label: 'Owner' },
  CONTRIB: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Contributor' },
};

function achievementStyle(pct) {
  if (pct === null || pct === undefined) return 'text-gray-300';
  if (pct >= 90) return 'text-[#1A5632]';
  if (pct >= 50) return 'text-amber-700';
  return 'text-red-600';
}

// ── KPI tile ──
function Kpi({ label, value, sub }) {
  return (
    <div className="px-5 py-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-[20px] font-bold text-gray-900 mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
    </div>
  );
}

// ── Narrative block ──
export default function DivisionQuarterlySummaryPage() {
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const { activeDivision } = useActiveDivision();
  const { data: divisionCodes = [] } = useDivisionCodes();

  const canExport = can(RBAC_MODULES.QUARTERLY_REPORT, RBAC_ACTIONS.EXPORT);
  // Year and quarter of the open reporting period, not the clock (D-20261106-01).
  const { data: periods = [], isLoading: periodsLoading } = useReportingPeriods();
  const { fiscalYear } = useReportingYear(periods, periodsLoading);
  const paramDivision = params.get('division');
  const divisionCode = (paramDivision || activeDivision?.code || '').toUpperCase();
  const quarter = resolveQuarter((params.get('quarter') || '').toUpperCase(), periods, fiscalYear);

  const divisionOptions = useMemo(
    () => divisionCodes
      .filter((d) => d.division_name)
      .map((d) => ({ value: d.code, label: d.division_name, sub: `${d.code}${d.directorate ? ' · ' + d.directorate : ''}` })),
    [divisionCodes],
  );

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const { data, isLoading, error, refetch } = useDivisionQuarterlySummary({ divisionCode, fiscalYear, quarter });

  const handleExport = async (format) => {
    try {
      const res = await exportApi.divisionSummary({ divisionCode, fiscalYear, quarter, format });
      triggerDownload(res, `division-summary-${divisionCode}-${fiscalYear}-${quarter}.${format}`);
    } catch {
      toast.error('Export failed. Please try again.');
    }
  };

  const kpis = data?.kpis || null;
  const indicators = data?.indicators || [];

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Reporting', path: '/reporting' }, { label: 'Division Summary' }]}>
      <div className="space-y-0">
        {/* Hero */}
        <div className="bg-[#1A5632] text-white px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-[17px] font-semibold leading-snug">Division Quarterly Summary</h1>
              <p className="text-[11px] text-white/60 mt-1">
                {data?.division?.name || divisionCode || 'Select a division'} — {quarter} FY{fiscalYear}
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-3">
                <div className="w-full sm:w-[280px]">
                  <SearchSelect
                    value={divisionCode || null}
                    options={divisionOptions}
                    onChange={(v) => setFilter('division', v)}
                    placeholder="Select a division"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  {QUARTERS.map((q) => (
                    <button
                      key={q}
                      onClick={() => setFilter('quarter', q)}
                      className={`px-3 py-1.5 text-[11px] font-medium border transition-colors ${
                        quarter === q
                          ? 'bg-white text-[#1A5632] border-white'
                          : 'border-white/30 text-white/70 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {canExport && divisionCode && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExport('pptx')}
                  className="px-3 py-1.5 text-[12px] border border-white/30 text-white/90 hover:bg-white/10 transition-colors"
                >
                  PPTX deck
                </button>
                <ExportMenu onExport={handleExport} label="Export summary" />
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        {!divisionCode ? (
          <div className="bg-white border border-gray-200 border-t-0 py-16">
            <EmptyState title="Select a division" hint="Pick a division above to see its quarterly summary." />
          </div>
        ) : isLoading ? (
          <div className="bg-white border border-gray-200 border-t-0 py-16"><LoadingState /></div>
        ) : error ? (
          <div className="bg-white border border-gray-200 border-t-0 py-16">
            <ErrorState message="Failed to load the division summary." onRetry={refetch} />
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 border border-gray-200 border-t-0 divide-x divide-gray-200 bg-white">
              <Kpi label="Owned indicators" value={kpis?.total_indicators ?? 0} sub={`${kpis?.reported_count ?? 0} reported`} />
              <Kpi label="Completion" value={`${kpis?.completion_pct ?? 0}%`} sub={`${kpis?.approved_count ?? 0} approved`} />
              <Kpi
                label="Achievement"
                value={kpis?.achievement_pct === null || kpis?.achievement_pct === undefined ? 'N/A' : `${kpis.achievement_pct}%`}
                sub="Avg vs quarter target"
              />
              <Kpi label="Indicators shown" value={indicators.length} sub="Owned + contributed" />
            </div>

            {/* Indicators table */}
            <div className="bg-white border border-gray-200 border-t-0">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-gray-800">Indicators</h3>
                <span className="text-[10px] text-gray-400">{indicators.length} indicators</span>
              </div>
              {indicators.length === 0 ? (
                <div className="py-12">
                  <EmptyState title="No indicators" hint={`No indicators reported for ${divisionCode} in ${quarter} FY${fiscalYear}.`} />
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] text-gray-500 border-b border-gray-200 bg-gray-50/50">
                      <th className="pl-5 pr-3 py-2 w-[120px]">Code</th>
                      <th className="px-3 py-2">Indicator</th>
                      <th className="px-3 py-2 text-center w-[70px]">Tier</th>
                      <th className="px-3 py-2 text-center w-[100px]">Role</th>
                      <th className="px-3 py-2 text-center w-[90px]">Target</th>
                      <th className="px-3 py-2 text-center w-[90px]">Actual</th>
                      <th className="px-3 py-2 text-center w-[100px]">Achievement</th>
                      <th className="px-3 py-2 text-center w-[100px]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indicators.map((ind, idx) => {
                      const role = ROLE_BADGE[ind.role] || ROLE_BADGE.OWNER;
                      return (
                        <tr key={`${ind.id}-${ind.role}`} className={`border-b border-gray-100 ${idx % 2 ? 'bg-gray-50/30' : ''}`}>
                          <td className="pl-5 pr-3 py-2.5 text-[11px] font-mono text-gray-600">{ind.code || '—'}</td>
                          <td className="px-3 py-2.5 text-[12px] text-gray-800">{ind.title || '—'}</td>
                          <td className="px-3 py-2.5 text-center text-[11px] text-gray-500">T{ind.tier_id}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`text-[9px] font-semibold px-2 py-0.5 ${role.bg} ${role.text}`}>{role.label}</span>
                          </td>
                          <td className="px-3 py-2.5 text-center text-[12px] text-gray-600">{ind.quarter_target ?? '—'}</td>
                          <td className="px-3 py-2.5 text-center text-[12px] text-gray-800">{ind.actual_value ?? '—'}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`text-[11px] font-semibold ${achievementStyle(ind.achievement_pct)}`}>
                              {ind.achievement_pct === null || ind.achievement_pct === undefined ? 'N/A' : `${ind.achievement_pct}%`}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center text-[11px] text-gray-600">{ind.status || 'Not started'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <DivisionActivityReportsPanel reports={data?.activities || []} />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
