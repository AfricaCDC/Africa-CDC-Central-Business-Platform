/* eslint-disable complexity, max-lines, no-unused-vars, no-restricted-syntax -- pre-existing legacy, tracked. */
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useQueryClient } from '@tanstack/react-query';
import { useSpecificActivityData } from '@/hooks/usePlanNodeQueries';
import api from '@/services/api';
import { Loader2, ChevronDown, ChevronRight, ExternalLink, Search, Plus } from 'lucide-react';
import { fmtBudget } from '@rbm/lib/formatters';
import { fyToYear } from '@rbm/lib/fiscalYear';
import { toast } from 'sonner';
import RowActions, { specificActivityActions } from '@/components/shared/RowActions';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import { usePlanningYear } from '@/contexts/PlanningYearContext';

/**
 * Page that lists specific activities (T6 nodes) grouped under their parent broad
 * activities, with search, filtering, and links to detail/edit views.
 *
 * @returns {JSX.Element}
 */
export default function SpecificActivityPage() {
  const queryClient = useQueryClient();
  const { planningYear: fiscalYear, fyNum } = usePlanningYear();
  const navigate = useNavigate();
  // Create is governed by the RBAC matrix (tasks:create) — not a hardcoded role.
  // M&E holds tasks:create:all (B-1, D-20260621-06) so they can add activities
  // org-wide from this page; admins too. Focal persons use /my-specifics.
  const { can } = usePermissions();
  const canCreateActivity = can('tasks', 'create');
  const { data: raw, isLoading: loading } = useSpecificActivityData(fiscalYear);
  const { specifics: activities = [], broads = [], t3 = [], t4 = [], divisions: divList = [] } = raw || {};
  const indicators = [...t3, ...t4];

  const divCodes = useMemo(() => {
    const map = {};
    divList.forEach(d => { map[d.code] = d.division_name || d.name; });
    return map;
  }, [divList]);

  const divDirectorates = useMemo(() => {
    const map = {};
    divList.forEach(d => { map[d.code] = d.directorate || ''; });
    return map;
  }, [divList]);

  // Codes promoted to directorate in the org chart (level_type) — they must
  // appear in the Directorates filter, not the Divisions one, even when they
  // carry activities of their own (e.g. IMZ → Directorate of Immunization).
  const directorateCodes = useMemo(
    () => new Set(divList.filter(d => d.level_type === 'directorate').map(d => d.code)),
    [divList],
  );

  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState('');
  const [buFilter, setBuFilter] = useState('all');
  const [divFilter, setDivFilter] = useState('all');
  const [donorFilter, setDonorFilter] = useState('all');
  const [arrangementFilter, setArrangementFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const PAGE_SIZE = 50;

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/plan-nodes/specific-activity/${deleteTarget}`);
      queryClient.invalidateQueries({ queryKey: ['plan', 'spec-act'] });
      toast.success('Activity deleted');
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Delete failed');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };
  const divName = (code) => divCodes[code] || code;

  const broadById = {};
  broads.forEach(b => { broadById[b.id] = b; });

  const indById = {};
  const indByCode = {};
  indicators.forEach(i => { indById[i.id] = i; if (i.code) indByCode[i.code] = i; });

  // Division options: codes carrying activities, minus org-chart directorates.
  const divisions = [...new Set(activities.map(a => a.responsible_division_code).filter(Boolean))]
    .filter(code => !directorateCodes.has(code))
    .sort();
  // Directorate options: parent-directorate names, plus directorate-level codes
  // that carry activities themselves (shown under their own name, e.g. IMZ).
  const directorates = [...new Set([
    ...Object.values(divDirectorates).filter(Boolean),
    ...activities.map(a => a.responsible_division_code)
      .filter(code => code && directorateCodes.has(code))
      .map(code => divCodes[code] || code),
  ])].sort();
  const divsInBu = buFilter === 'all' ? divisions : divisions.filter(d => divDirectorates[d] === buFilter);

  // An activity belongs to a directorate if its division reports to it, or if
  // it is carried by the directorate itself (code with level_type=directorate).
  const matchesDirectorate = (a) => {
    const code = a.responsible_division_code;
    if (divDirectorates[code] === buFilter) return true;
    return directorateCodes.has(code) && (divCodes[code] || code) === buFilter;
  };

  // Donor options come from the data (primary + other funding source) so new
  // donors (CEPI, ...) appear automatically once used on an activity.
  const donors = [...new Set(
    activities.flatMap(a => [a.primary_funding_source, a.other_funding_source])
      .map(v => (v || '').trim())
      .filter(v => v && v.toUpperCase() !== 'N/A'),
  )].sort((x, y) => x.localeCompare(y));

  const matchesDonor = (a) =>
    (a.primary_funding_source || '').trim() === donorFilter
    || (a.other_funding_source || '').trim() === donorFilter;

  const filtered = activities.filter(a => {
    if (buFilter !== 'all' && !matchesDirectorate(a)) return false;
    if (divFilter !== 'all' && a.responsible_division_code !== divFilter) return false;
    if (donorFilter !== 'all' && !matchesDonor(a)) return false;
    if (arrangementFilter !== 'all' && a.budgeting_arrangement !== arrangementFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (a.title || '').toLowerCase().includes(s) || (a.code || '').toLowerCase().includes(s) || (a.indicator_code || '').toLowerCase().includes(s);
    }
    return true;
  });

  const grouped = {};
  filtered.forEach(a => {
    const key = a.parent_id || 'unlinked';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  });

  // Sort groups by parent broad code
  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
    const ba = broadById[a]?.code || '';
    const bb = broadById[b]?.code || '';
    return ba.localeCompare(bb, undefined, { numeric: true });
  });
  const totalGroups = sortedGroups.length;
  const totalPages = Math.max(1, Math.ceil(totalGroups / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageGroups = sortedGroups.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const totalBudget = filtered.reduce((s, a) => s + Number(a.budget_total_2026 || 0), 0);

  if (loading) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Planning' }, { label: 'Specific Activities' }]}>
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-[#D97706]" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Planning' }, { label: 'Specific Activities' }]}>
      <div className="space-y-0">

        <div className="bg-[#D97706] text-white">
          <div className="px-6 py-5 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">
                  Specific Activities
                </span>
                <span className="text-[11px] font-mono text-white/70">{fiscalYear}</span>
              </div>
              <h1 className="text-[16px] font-semibold leading-snug max-w-3xl">
                All specific activities linked to broad activities
              </h1>
            </div>
            {canCreateActivity && (
              <Button
                variant="inverse"
                size="md"
                onClick={() => navigate('/my-specifics/new')}
                className="flex-shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                New activity
              </Button>
            )}
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex flex-wrap items-center gap-6 text-[12px] text-white/70">
            <span><strong className="text-white">{filtered.length}</strong> Specific Activities{filtered.length !== activities.length && ` / ${activities.length} total`}</span>
            <span><strong className="text-white">{Object.keys(grouped).length}</strong> Broad Activities</span>
            {totalBudget > 0 && (
              <span className="ml-auto text-white font-semibold">{fmtBudget(totalBudget)} <span className="text-white/60 font-normal">Total {fiscalYear}</span></span>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 border-t-0 px-6 py-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 border border-gray-200 px-2.5 py-1.5 flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by code, title, indicator..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-[11px] outline-none w-full bg-transparent"
            />
          </div>
          <select
            value={buFilter}
            onChange={(e) => { setBuFilter(e.target.value); setDivFilter('all'); }}
            className="text-[10px] border border-gray-200 px-2.5 py-1.5 text-gray-700 bg-white outline-none"
          >
            <option value="all">All Directorates</option>
            {directorates.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select
            value={divFilter}
            onChange={(e) => setDivFilter(e.target.value)}
            className="text-[10px] border border-gray-200 px-2.5 py-1.5 text-gray-700 bg-white outline-none"
          >
            <option value="all">All Divisions ({filtered.length})</option>
            {divsInBu.map(d => (
              <option key={d} value={d}>{divName(d)} ({activities.filter(a => a.responsible_division_code === d).length})</option>
            ))}
          </select>
          <select
            value={donorFilter}
            onChange={(e) => setDonorFilter(e.target.value)}
            className="text-[10px] border border-gray-200 px-2.5 py-1.5 text-gray-700 bg-white outline-none"
          >
            <option value="all">All Donors</option>
            {donors.map(d => (
              <option key={d} value={d}>
                {d} ({activities.filter(a => ((a.primary_funding_source || '').trim() === d) || ((a.other_funding_source || '').trim() === d)).length})
              </option>
            ))}
          </select>
          <select
            value={arrangementFilter}
            onChange={(e) => setArrangementFilter(e.target.value)}
            className="text-[10px] border border-gray-200 px-2.5 py-1.5 text-gray-700 bg-white outline-none"
          >
            <option value="all">All Budgeting</option>
            <option value="Intramural">
              Intramural ({activities.filter(a => a.budgeting_arrangement === 'Intramural').length})
            </option>
            <option value="Extramural">
              Extramural ({activities.filter(a => a.budgeting_arrangement === 'Extramural').length})
            </option>
          </select>
        </div>

        {pageGroups.map(([parentId, acts]) => {
          const broad = broadById[parentId];
          return (
            <div key={parentId} className="bg-white border border-gray-200 border-t-0">
              <div className="px-5 py-2.5 bg-[#B45309] flex items-center gap-3">
                {broad ? (
                  <button
                    onClick={() => navigate(`/plan/node/${broad.id}`)}
                    className="flex items-center gap-2 min-w-0 text-white hover:underline"
                  >
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 border border-white/30 text-[9px] font-bold flex-shrink-0">
                      {broad.code}
                    </span>
                    <span className="text-[10px] font-medium truncate max-w-[600px]">{broad.title}</span>
                  </button>
                ) : (
                  <span className="text-[10px] text-white/60">Unlinked specific activities</span>
                )}
                <span className="ml-auto text-[10px] text-white/60">{acts.length} specific activities</span>
              </div>

              <table className="w-full text-left">
                <tbody>
                  {acts.sort((a, b) => a.sort_order - b.sort_order).map((act, idx) => (
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
                        <td className="px-3 py-2.5 text-[10px] font-mono font-bold text-[#D97706] w-[110px]">
                          {act.code}
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-gray-900 font-medium">
                          {act.title}
                        </td>
                        <td className="px-3 py-2.5 w-[110px]">
                          {act.indicator_code && (
                            <span className="inline-block text-[9px] font-mono px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200">
                              {act.indicator_code}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 w-[140px]">
                          {act.responsible_division_code && (
                            <span className="inline-block text-[9px] font-semibold px-1.5 py-0.5 bg-gray-100 text-gray-600 border border-gray-200 truncate max-w-[130px]" title={divName(act.responsible_division_code)}>
                              {divName(act.responsible_division_code)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-[11px] font-semibold text-[#D97706] text-right w-[90px]">
                          {fmtBudget(act.budget_total_2026)}
                        </td>
                        <td className="px-3 py-2.5 w-[50px] text-center">
                          <RowActions id={act.id} actions={specificActivityActions(act.id, { onDelete: setDeleteTarget })} />
                        </td>
                      </tr>

                      {expanded[act.id] && (() => {
                        const linkedInd = act.linked_indicator_id ? indById[act.linked_indicator_id] : (act.indicator_code ? indByCode[act.indicator_code] : null);
                        const parentBroad = broadById[act.parent_id];
                        return (
                          <tr>
                            <td colSpan={7} className="px-6 py-4 bg-gradient-to-b from-orange-50 to-white border-b border-gray-200">
                              {/* Linked entities row */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                                {/* Parent Broad Activity */}
                                {parentBroad && (
                                  <div className="border border-[#B45309] bg-white p-3">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-[8px] uppercase tracking-wider text-[#B45309] font-bold">↑ Broad Activity</span>
                                      <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold bg-[#B45309] text-white">{parentBroad.code}</span>
                                    </div>
                                    <button onClick={() => navigate(`/plan/node/${parentBroad.id}`)} className="text-[11px] font-medium text-gray-900 hover:text-[#B45309] hover:underline text-left">
                                      {parentBroad.title}
                                    </button>
                                  </div>
                                )}

                                {/* Linked Indicator T3/T4 */}
                                {linkedInd ? (
                                  <div className="border border-purple-300 bg-white p-3">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-[8px] uppercase tracking-wider text-purple-700 font-bold">→ Contributes to</span>
                                      <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold text-white ${linkedInd.tier_id === 3 ? 'bg-[#14442A]' : 'bg-[#D97706]'}`}>
                                        T{linkedInd.tier_id}
                                      </span>
                                      <span className="inline-block px-1.5 py-0.5 text-[9px] font-mono bg-purple-100 text-purple-700 border border-purple-200">{linkedInd.code}</span>
                                    </div>
                                    <button onClick={() => navigate(`/plan/node/${linkedInd.id}`)} className="text-[11px] font-medium text-gray-900 hover:text-purple-700 hover:underline text-left block">
                                      {linkedInd.title}
                                    </button>
                                    <div className="flex items-center gap-3 mt-1.5 text-[9px] text-gray-500">
                                      <span>Baseline: <strong>{linkedInd.baseline_numeric ?? '—'}</strong></span>
                                      <span>Target · {fyToYear(fyNum)}: <strong className="text-[#14442A]">{linkedInd[`target_y${fyNum}_numeric`] ?? linkedInd.target_y1_numeric ?? '—'}</strong></span>
                                      {linkedInd.uom?.label && <span>({linkedInd.uom.label})</span>}
                                    </div>
                                  </div>
                                ) : act.indicator_code ? (
                                  <div className="border border-gray-200 bg-white p-3">
                                    <span className="text-[8px] uppercase tracking-wider text-gray-400 font-bold">→ Contributes to</span>
                                    <p className="text-[10px] text-gray-500 mt-1">Indicator code: <strong>{act.indicator_code}</strong> (not yet linked)</p>
                                  </div>
                                ) : null}
                              </div>

                              {/* Budget breakdown */}
                              <div className="mb-3">
                                <p className="text-[9px] uppercase text-gray-400 font-semibold mb-2">Budget Breakdown</p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                                  <BudgetCell label="Approved Total" value={act.budget_total_2026} highlight />
                                  <BudgetCell label="Q1 Budget" value={act.q1_budget} />
                                  <BudgetCell label="Q2 Budget" value={act.q2_budget} />
                                  <BudgetCell label="Q3 Budget" value={act.q3_budget} />
                                  <BudgetCell label="Q4 Budget" value={act.q4_budget} />
                                </div>
                              </div>

                              {/* Meta info */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                <div className="border border-gray-100 p-2.5 bg-white">
                                  <p className="text-[9px] text-gray-400 uppercase">Responsible Division</p>
                                  <p className="text-[11px] font-medium text-gray-800 mt-0.5 truncate" title={divName(act.responsible_division_code)}>
                                    {divName(act.responsible_division_code) || '—'}
                                  </p>
                                </div>
                                <div className="border border-gray-100 p-2.5 bg-white">
                                  <p className="text-[9px] text-gray-400 uppercase">Status</p>
                                  <p className="text-[11px] font-medium text-gray-800 mt-0.5">{act.status || 'APPROVED'}</p>
                                </div>
                                <div className="border border-gray-100 p-2.5 bg-white">
                                  <p className="text-[9px] text-gray-400 uppercase">Funding Source</p>
                                  <p className="text-[11px] font-medium text-gray-800 mt-0.5 truncate" title={[act.primary_funding_source, act.other_funding_source].filter(Boolean).join(' + ')}>
                                    {[act.primary_funding_source, act.other_funding_source].filter(Boolean).join(' + ') || '—'}
                                  </p>
                                </div>
                                <div className="border border-gray-100 p-2.5 bg-white">
                                  <p className="text-[9px] text-gray-400 uppercase">Budgeting</p>
                                  <p className="text-[11px] font-medium text-gray-800 mt-0.5">{act.budgeting_arrangement || '—'}</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
                                <button
                                  onClick={() => navigate(`/plan/node/${act.id}`)}
                                  className="flex items-center gap-1.5 text-[10px] font-semibold text-[#D97706] hover:underline"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Open full specific activity page
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })()}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="bg-white border border-gray-200 border-t-0 px-5 py-12 text-center">
            <p className="text-[11px] text-gray-500">No specific activities found.</p>
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          open
          title="Delete Specific Activity"
          description="Are you sure you want to delete this specific activity? This action cannot be undone."
          confirmLabel={deleting ? 'Deleting...' : 'Delete'}
          variant="danger"
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </DashboardLayout>
  );
}

function BudgetCell({ label, value, highlight }) {
  return (
    <div className={`border p-2.5 ${highlight ? 'border-[#D97706] bg-orange-50' : 'border-gray-100'}`}>
      <p className="text-[9px] text-gray-400 uppercase">{label}</p>
      <p className={`text-[11px] font-semibold mt-0.5 ${highlight ? 'text-[#D97706]' : 'text-gray-800'}`}>
        {fmtBudget(value)}
      </p>
    </div>
  );
}
