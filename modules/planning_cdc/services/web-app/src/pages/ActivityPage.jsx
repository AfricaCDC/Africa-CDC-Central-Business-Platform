/* eslint-disable complexity --
 * Pre-existing debt: ActivityPage branches by node status and by filter
 * (complexity 11, ceiling 10). Pragma is a ceiling: do NOT grow it.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useActivityBrowseData } from '@/hooks/usePlanNodeQueries';
import { Loader2, ChevronDown, ChevronRight, ExternalLink, Search } from 'lucide-react';
import { fmtBudget } from '@rbm/lib/formatters';
import RowActions, { planNodeActions } from '@/components/shared/RowActions';
import { usePlanningYear } from '@/contexts/PlanningYearContext';

/**
 * Page that lists workplan activities grouped by their parent outcome indicator,
 * with division and free-text filtering. Used by admins/staff to browse activities
 * across the AMERT plan.
 *
 * @returns {JSX.Element}
 */
export default function ActivityPage() {
  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState('');
  const [divFilter, setDivFilter] = useState('all');

  const { planningYear: fiscalYear } = usePlanningYear();
  const navigate = useNavigate();

  const { data, isLoading: loading } = useActivityBrowseData(fiscalYear);
  const activities = data?.activities || [];
  const outcomeIndicators = data?.outcomeIndicators || [];
  const divCodes = data?.divCodes || {};

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const indById = {};
  outcomeIndicators.forEach(i => { indById[i.id] = i; });

  const divisions = [...new Set(activities.map(a => a.responsible_division_code).filter(Boolean))].sort();
  const divName = (code) => divCodes[code] || code;

  const filtered = activities.filter(a => {
    if (divFilter !== 'all' && a.responsible_division_code !== divFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (a.title || '').toLowerCase().includes(s) || (a.code || '').toLowerCase().includes(s);
    }
    return true;
  });

  const grouped = {};
  filtered.forEach(a => {
    const key = a.parent_id || 'unlinked';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  });

  const totalBudget = filtered.reduce((s, a) => s + Number(a.budget_total_2026 || 0), 0);

  if (loading) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Planning' }, { label: 'Broad Activities' }]}>
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-[#B45309]" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Planning' }, { label: 'Broad Activities' }]}>
      <div className="space-y-0">

        {/* Hero */}
        <div className="bg-[#B45309] text-white">
          <div className="px-6 py-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">
                Broad Activities
              </span>
              <span className="text-[11px] font-mono text-white/70">{fiscalYear}</span>
            </div>
            <h1 className="text-[16px] font-semibold leading-snug max-w-3xl">
              All broad activities linked to Outcome Indicators
            </h1>
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex flex-wrap items-center gap-6 text-[12px] text-white/70">
            <span><strong className="text-white">{filtered.length}</strong> Activities{filtered.length !== activities.length && ` / ${activities.length} total`}</span>
            <span><strong className="text-white">{Object.keys(grouped).length}</strong> Indicators</span>
            {totalBudget > 0 && (
              <span className="ml-auto text-white font-semibold">{fmtBudget(totalBudget)} <span className="text-white/60 font-normal">Total {fiscalYear}</span></span>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 border-t-0 px-6 py-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 border border-gray-200 px-2.5 py-1.5 flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search activities..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-[11px] outline-none w-full bg-transparent"
            />
          </div>
          <select
            value={divFilter}
            onChange={(e) => setDivFilter(e.target.value)}
            className="text-[10px] border border-gray-200 px-2.5 py-1.5 text-gray-700 bg-white outline-none"
          >
            <option value="all">All Divisions ({activities.length})</option>
            {divisions.map(d => (
              <option key={d} value={d}>{divName(d)} ({activities.filter(a => a.responsible_division_code === d).length})</option>
            ))}
          </select>
        </div>

        {/* Grouped by Outcome Indicator */}
        {Object.entries(grouped).sort(([, a], [, b]) => (a[0]?.code || '').localeCompare(b[0]?.code || '', undefined, { numeric: true })).map(([parentId, acts]) => {
          const parentInd = indById[parentId];
          return (
            <div key={parentId} className="bg-white border border-gray-200 border-t-0">
              {/* Indicator group header */}
              <div className="px-5 py-2.5 bg-[#14442A] flex flex-wrap items-center gap-3">
                {parentInd ? (
                  <button
                    onClick={() => navigate(`/plan/node/${parentInd.id}`)}
                    className="flex items-center gap-2 min-w-0 text-white hover:underline"
                  >
                    <span className="inline-flex items-center justify-center w-5 h-5 border border-white/30 text-[9px] font-bold flex-shrink-0">
                      {parentInd.code}
                    </span>
                    <span className="text-[10px] font-medium truncate">{parentInd.title}</span>
                  </button>
                ) : (
                  <span className="text-[10px] text-white/60">Unlinked activities</span>
                )}
                <span className="ml-auto text-[10px] text-white/60">{acts.length} activities</span>
              </div>

              {/* Activities rows */}
              <table className="w-full text-left">
                <tbody>
                  {acts.map((act, idx) => (
                    <React.Fragment key={act.id}>
                      <tr
                        className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                        onClick={() => toggle(act.id)}
                      >
                        <td className="px-3 py-2.5 w-[40px] text-center">
                          {expanded[act.id]
                            ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 inline pointer-events-none" />
                            : <ChevronRight className="w-3.5 h-3.5 text-gray-400 inline pointer-events-none" />
                          }
                        </td>
                        <td className="px-3 py-2.5 text-[10px] font-mono font-bold text-[#B45309] w-[80px]">
                          {act.code}
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-gray-900 font-medium">
                          {act.title}
                        </td>
                        <td className="px-3 py-2.5 w-[80px]">
                          {act.responsible_division_code && (
                            <span className="inline-block text-[9px] font-semibold px-1.5 py-0.5 bg-gray-100 text-gray-600 border border-gray-200 truncate max-w-[120px]" title={divName(act.responsible_division_code)}>
                              {divName(act.responsible_division_code)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-[11px] font-semibold text-[#B45309] text-right w-[100px]">
                          {fmtBudget(act.budget_total_2026)}
                        </td>
                        <td className="px-3 py-2.5 w-[80px] text-center">
                          <RowActions id={act.id} actions={planNodeActions(act.id)} />
                        </td>
                      </tr>

                      {expanded[act.id] && (
                        <tr>
                          <td colSpan={6} className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 mb-3">
                              <BudgetCell label="Main Budget" value={act.budget_main} />
                              <BudgetCell label="Pass Through" value={act.budget_pass_through} />
                              <BudgetCell label="Tech. Assistance" value={act.budget_tech_assistance} />
                              <BudgetCell label="Special Projects" value={act.budget_special_projects} />
                              <BudgetCell label={`Total ${fiscalYear}`} value={act.budget_total_2026} highlight />
                              <BudgetCell label={`Budget ${parseInt(fiscalYear) + 1}`} value={act.budget_2027} muted />
                              <BudgetCell label={`Budget ${parseInt(fiscalYear) + 2}`} value={act.budget_2028} muted />
                            </div>
                            <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
                              <button
                                onClick={() => navigate(`/plan/node/${act.id}`)}
                                className="flex items-center gap-1.5 text-[10px] font-semibold text-[#B45309] hover:underline"
                              >
                                <ExternalLink className="w-3 h-3" />
                                View activity details
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="bg-white border border-gray-200 border-t-0 px-5 py-12 text-center">
            <p className="text-[11px] text-gray-500">No activities found.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function BudgetCell({ label, value, highlight, muted }) {
  return (
    <div className={`border p-2.5 ${highlight ? 'border-[#1A5632] bg-[#F0F7F2]' : 'border-gray-100'}`}>
      <p className="text-[9px] text-gray-400 uppercase">{label}</p>
      <p className={`text-[11px] font-semibold mt-0.5 ${highlight ? 'text-[#1A5632]' : muted ? 'text-gray-400' : 'text-gray-800'}`}>
        {fmtBudget(value)}
      </p>
    </div>
  );
}
