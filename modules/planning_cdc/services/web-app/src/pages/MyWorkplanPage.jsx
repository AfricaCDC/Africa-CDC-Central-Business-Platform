/* eslint-disable complexity, max-lines, no-restricted-syntax -- pre-existing legacy, tracked. */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useMyWorkplanData } from '@/hooks/usePlanNodeQueries';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveDivision } from '@/contexts/ActiveDivisionContext';
import { Loader2, ChevronDown, ChevronRight, Search, ExternalLink } from 'lucide-react';
import { fmtBudgetCompact as fmt, fmtValue as fmtVal } from '@rbm/lib/formatters';
import { fyToYear } from '@rbm/lib/fiscalYear';
import { toast } from 'sonner';
import ExportMenu from '@/components/shared/ExportMenu';
import { exportApi, triggerDownload } from '@/services/export.api';
import { usePermissions } from '@/hooks/usePermissions';
import { RBAC_MODULES, RBAC_ACTIONS } from '@rbm/lib/rbac';
import { usePlanningYear } from '@/contexts/PlanningYearContext';

/**
 * "My workplan" page. Combined view of broad activities, specific activities,
 * indicators and outcomes scoped to the current user, organised hierarchically.
 *
 * @returns {JSX.Element}
 */
export default function MyWorkplanPage() {
  const { user } = useAuth();
  const { activeCodes, activeDivision, loaded: divLoaded, divisions: myDivisions } = useActiveDivision();
  // Legacy users.division_code is NULL for multi-division-era assignments.
  const divCode = activeDivision?.code || myDivisions?.[0]?.code || user?.division_code;
  const [openBroad, setOpenBroad] = useState({});
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { planningYear: fiscalYear } = usePlanningYear();

  // Workplan export is gated by the RBAC matrix (workplan:export). Focal persons
  // hold workplan:export:division (B-2) — they use THIS page (/my-workplan), not
  // the org-wide /workplan, so the export button must live here too. The backend
  // applies row-level scope; we pass the focal's division to scope the file.
  const { can } = usePermissions();
  const canExport = can(RBAC_MODULES.WORKPLAN, RBAC_ACTIONS.EXPORT);
  const [isExporting, setIsExporting] = useState(false);
  const handleExport = async (format) => {
    setIsExporting(true);
    try {
      const res = await exportApi.workplan({ fiscalYear, format, division: divCode });
      triggerDownload(res, `my-workplan-${divCode}-${fiscalYear}.${format}`);
    } catch {
      toast.error('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const { data: raw, isLoading: loading } = useMyWorkplanData(fiscalYear);

  const { broads, specifics, indicators, outcomes } = useMemo(() => {
    if (!raw || !divLoaded || !divCode) return { broads: [], specifics: [], indicators: [], outcomes: [] };
    const allBroads = raw.broads || [];
    const allSpecs = raw.specifics || [];
    const myBroads = allBroads.filter(b => activeCodes.has(String(b.responsible_division_code || '').toUpperCase()));
    const broadIds = new Set(myBroads.map(b => b.id));
    const mySpecs = allSpecs.filter(s => activeCodes.has(String(s.responsible_division_code || '').toUpperCase()) || broadIds.has(s.parent_id));
    return { broads: myBroads, specifics: mySpecs, indicators: [...(raw.t3 || []), ...(raw.t4 || [])], outcomes: raw.areas || [] };
  }, [raw, divLoaded, divCode, activeCodes]);

  if (loading) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/report' }, { label: 'Workplan' }]}>
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" />
        </div>
      </DashboardLayout>
    );
  }

  if (!divCode) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/report' }, { label: 'Workplan' }]}>
        <div className="p-6 text-[11px] text-gray-500">No division assigned to your account.</div>
      </DashboardLayout>
    );
  }

  const outcomeById = {};
  outcomes.forEach(o => { outcomeById[o.id] = o; });
  const specsByBroad = {};
  specifics.forEach(s => {
    if (!specsByBroad[s.parent_id]) specsByBroad[s.parent_id] = [];
    specsByBroad[s.parent_id].push(s);
  });
  const indicatorById = {};
  indicators.forEach(i => { indicatorById[i.id] = i; });

  // For each broad: collect linked T3/T4 indicators
  // Logic: parent indicator of broad + indicators linked from its specifics
  const broadIndicators = (broad) => {
    const indMap = new Map();
    if (broad.parent_id && indicatorById[broad.parent_id]) {
      indMap.set(broad.parent_id, indicatorById[broad.parent_id]);
    }
    (specsByBroad[broad.id] || []).forEach(s => {
      if (s.linked_indicator_id && indicatorById[s.linked_indicator_id]) {
        indMap.set(s.linked_indicator_id, indicatorById[s.linked_indicator_id]);
      }
    });
    return [...indMap.values()].sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
  };

  // Search across broads, indicators, AND specifics
  const matchStr = (v, q) => (v || '').toString().toLowerCase().includes(q);
  const q = search.trim().toLowerCase();
  const filtered = broads.filter(b => {
    if (!q) return true;
    // Match the broad itself
    if (matchStr(b.title, q) || matchStr(b.code, q)) return true;
    // Match any linked indicator (T3/T4) — parent of broad or linked via specifics
    const inds = broadIndicators(b);
    if (inds.some(i => matchStr(i.title, q) || matchStr(i.code, q))) return true;
    // Match any specific activity under this broad
    const specs = specsByBroad[b.id] || [];
    if (specs.some(s => matchStr(s.title, q) || matchStr(s.code, q))) return true;
    return false;
  });

  const toggle = (id) => setOpenBroad(prev => ({ ...prev, [id]: !prev[id] }));
  const expandAll = () => {
    const op = {};
    filtered.forEach(b => { op[b.id] = true; });
    setOpenBroad(op);
  };
  const collapseAll = () => setOpenBroad({});

  const totalBudget = broads.reduce((s, b) => s + Number(b.budget_total_2026 || 0), 0);
  const totalSpecs = specifics.length;
  const totalT3 = new Set(broads.flatMap(b => broadIndicators(b).filter(i => i.tier_id === 3).map(i => i.id))).size;
  const totalT4 = new Set(broads.flatMap(b => broadIndicators(b).filter(i => i.tier_id === 4).map(i => i.id))).size;

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/report' }, { label: 'Workplan' }]}>
      <div className="space-y-0">

        {/* Hero */}
        <div className="bg-[#1A5632] text-white">
          <div className="px-6 py-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">
                FY {fiscalYear} Workplan
              </span>
              <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold bg-white/15">{activeDivision?.code || user.division_code}</span>
              {(activeDivision?.parent_code || user.directorate) && <span className="text-[10px] text-white/60">{activeDivision?.parent_code || user.directorate}</span>}
            </div>
            <h1 className="text-[18px] font-semibold leading-snug">{activeDivision?.division_name || user.division_name} — Annual Workplan</h1>
            <p className="text-[11px] text-white/70 mt-1">Each broad activity expands to show its T3/T4 indicators and specific activities</p>
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex items-center gap-6 text-[12px] text-white/70">
            <span><strong className="text-white">{broads.length}</strong> Broad Activities</span>
            <span><strong className="text-white">{totalT3}</strong> T3 Indicators</span>
            <span><strong className="text-white">{totalT4}</strong> T4 Indicators</span>
            <span><strong className="text-white">{totalSpecs}</strong> Specific Activities</span>
            <span className="ml-auto text-white font-semibold">{fmt(totalBudget)}</span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white border border-gray-200 border-t-0 px-5 py-3 flex items-center gap-3">
          <div className="relative max-w-[340px] flex-1">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search broad, indicator or specific activity..."
              className="w-full text-[11px] border border-gray-200 pl-8 pr-3 py-1.5 outline-none focus:border-[#1A5632]"
            />
          </div>
          <button onClick={expandAll} className="text-[10px] text-gray-500 hover:text-[#1A5632]">Expand all</button>
          <span className="text-gray-300">·</span>
          <button onClick={collapseAll} className="text-[10px] text-gray-500 hover:text-[#1A5632]">Collapse all</button>
          {canExport && (
            <div className="ml-auto">
              <ExportMenu onExport={handleExport} isExporting={isExporting} label="Export" />
            </div>
          )}
        </div>

        {/* Tree */}
        {filtered.length === 0 && (
          <div className="bg-white border border-gray-200 border-t-0 px-5 py-12 text-center text-[11px] text-gray-400">
            No broad activities found.
          </div>
        )}

        {filtered.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true })).map((broad, i) => {
          const specs = (specsByBroad[broad.id] || []).sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
          const inds = broadIndicators(broad);
          const t3 = inds.filter(x => x.tier_id === 3);
          const t4 = inds.filter(x => x.tier_id === 4);
          const parentArea = broad.parent_id && indicatorById[broad.parent_id]
            ? outcomeById[indicatorById[broad.parent_id].parent_id]
            : null;
          // Force open if search is active (so user sees why it matched)
          const isOpen = q ? true : openBroad[broad.id];

          return (
            <div key={broad.id} className={`bg-white border border-gray-200 border-t-0 ${i % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
              {/* Broad header */}
              <button
                onClick={() => toggle(broad.id)}
                className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-orange-50/70 border-b border-gray-100"
              >
                {isOpen
                  ? <ChevronDown className="w-3.5 h-3.5 text-[#B45309] flex-shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 text-[#B45309] flex-shrink-0" />
                }
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-[#B45309] text-white text-[9px] font-bold flex-shrink-0">
                  {broad.code}
                </span>
                <span className="text-[11px] font-semibold text-gray-900 flex-1 truncate">{broad.title}</span>
                {parentArea && <span className="text-[9px] text-gray-400 hidden md:inline">{parentArea.code}</span>}
                <span className="text-[9px] text-gray-400 hidden md:inline">{t3.length + t4.length} ind / {specs.length} specs</span>
                <span className="text-[11px] font-semibold text-[#B45309] w-[80px] text-right">{fmt(broad.budget_total_2026)}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/plan/node/${broad.id}`); }}
                  className="text-[9px] text-gray-400 hover:text-[#B45309] hover:underline px-2 py-0.5 border border-gray-200 hover:border-[#B45309] flex-shrink-0 flex items-center gap-1"
                >
                  <ExternalLink className="w-2.5 h-2.5" /> Detail
                </button>
              </button>

              {/* Nested: each indicator → its own specifics */}
              {isOpen && (
                <div className="bg-gradient-to-b from-orange-50/30 to-white px-5 py-3 space-y-4">
                  {inds.length === 0 && specs.length === 0 && (
                    <p className="text-[10px] text-gray-400 italic">No indicators or specifics linked yet.</p>
                  )}

                  {inds.map(ind => {
                    const indSpecs = specs.filter(s => s.linked_indicator_id === ind.id);
                    const accent = ind.tier_id === 4 ? '#D97706' : '#14442A';
                    const tierLabel = ind.tier_id === 4 ? 'T4 — Output Indicator' : 'T3 — Short-term Outcome Indicator';
                    return (
                      <IndicatorBlock
                        key={ind.id}
                        indicator={ind}
                        specifics={indSpecs}
                        accent={accent}
                        tierLabel={tierLabel}
                        navigate={navigate}
                        fmt={fmt}
                        fmtVal={fmtVal}
                      />
                    );
                  })}

                  {/* Orphan specifics: not linked to any indicator in this broad */}
                  {(() => {
                    const linkedSpecIds = new Set(
                      inds.flatMap(ind => specs.filter(s => s.linked_indicator_id === ind.id).map(s => s.id))
                    );
                    const orphans = specs.filter(s => !linkedSpecIds.has(s.id));
                    if (orphans.length === 0) return null;
                    return (
                      <div>
                        <p className="text-[9px] uppercase font-semibold mb-1.5 text-gray-500">
                          Unlinked Specific Activities — {orphans.length}
                        </p>
                        <div className="border border-gray-200 bg-white">
                          {orphans.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true })).map(s => (
                            <SpecRow key={s.id} spec={s} navigate={navigate} fmt={fmt} />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </DashboardLayout>
  );
}

function IndicatorBlock({ indicator, specifics, accent, tierLabel, navigate, fmt, fmtVal }) {
  const { fyNum } = usePlanningYear();
  return (
    <div className="border border-gray-200 bg-white">
      {/* Indicator header */}
      <div
        className="px-3 py-2 cursor-pointer hover:opacity-90 flex items-center gap-2"
        style={{ backgroundColor: accent + '12', borderBottom: `1px solid ${accent}20` }}
        onClick={() => navigate(`/plan/node/${indicator.id}`)}
      >
        <span className="inline-flex items-center justify-center px-1 py-0.5 text-[8px] font-bold text-white" style={{ backgroundColor: accent }}>
          T{indicator.tier_id}
        </span>
        <span className="text-[9px] font-mono font-bold" style={{ color: accent }}>{indicator.code}</span>
        <span className="text-[10px] text-gray-800 flex-1 truncate">{indicator.title}</span>
        <span className="text-[9px] text-gray-500 hidden md:inline">{indicator.uom?.label || '—'}</span>
        <span className="text-[9px] text-gray-400">Baseline <strong className="text-gray-700">{fmtVal(indicator.baseline_numeric, indicator.uom)}</strong></span>
        <span className="text-[9px] text-gray-400">Target · {fyToYear(fyNum)} <strong style={{ color: accent }}>{fmtVal(indicator[`target_y${fyNum}_numeric`] ?? indicator.target_y1_numeric, indicator.uom)}</strong></span>
        <span className="text-[8px] uppercase text-gray-400 font-semibold hidden md:inline">{tierLabel}</span>
      </div>

      {/* Specifics under this indicator */}
      {specifics.length === 0 ? (
        <p className="text-[10px] text-gray-400 italic px-3 py-2">No specific activities under this indicator.</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="text-[8px] text-gray-400 border-b border-gray-100 bg-gray-50/50">
              <th className="px-3 py-1 font-normal uppercase tracking-wider w-[120px]">Code</th>
              <th className="px-3 py-1 font-normal uppercase tracking-wider">Specific Activity</th>
              <th className="px-3 py-1 font-normal uppercase tracking-wider w-[100px] text-right">Budget</th>
            </tr>
          </thead>
          <tbody>
            {specifics.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true })).map(s => (
              <tr
                key={s.id}
                onClick={() => navigate(`/plan/node/${s.id}`)}
                className="border-b border-gray-50 hover:bg-orange-50/30 cursor-pointer last:border-b-0"
              >
                <td className="px-3 py-1.5 text-[9px] font-mono font-bold text-[#D97706]">{s.code}</td>
                <td className="px-3 py-1.5 text-[10px] text-gray-800">{s.title}</td>
                <td className="px-3 py-1.5 text-[10px] font-semibold text-[#D97706] text-right">{fmt(s.budget_total_2026)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SpecRow({ spec, navigate, fmt }) {
  return (
    <div
      onClick={() => navigate(`/plan/node/${spec.id}`)}
      className="px-3 py-1.5 border-b border-gray-50 hover:bg-orange-50/30 cursor-pointer last:border-b-0 flex items-center gap-3"
    >
      <span className="text-[9px] font-mono font-bold text-[#D97706] w-[120px] flex-shrink-0">{spec.code}</span>
      <span className="text-[10px] text-gray-800 flex-1 truncate">{spec.title}</span>
      <span className="text-[10px] font-semibold text-[#D97706] w-[100px] text-right flex-shrink-0">{fmt(spec.budget_total_2026)}</span>
    </div>
  );
}
