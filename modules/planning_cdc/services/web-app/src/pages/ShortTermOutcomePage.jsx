/* eslint-disable max-lines, complexity, no-restricted-syntax, no-unused-vars --
 * Legacy page with baseline debt from pre-guardrails era. Scheduled refactor:
 * task #37 — migrate off pragma when React-Query cohort + RBAC matrix migration
 * lands on this page. Do NOT add new violations; this pragma is a ceiling,
 * not a green light.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useQueryClient } from '@tanstack/react-query';
import { useShortTermOutcomeData } from '@/hooks/usePlanNodeQueries';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { Loader2, ChevronDown, ChevronRight, ExternalLink, Search, Plus } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/services/api';
import RowActions, { indicatorActions } from '@/components/shared/RowActions';
import { Button } from '@/components/ui/button';
import { usePlanningYear } from '@/contexts/PlanningYearContext';

const fmtNumeric = (val, uom) => {
  if (val === null || val === undefined) return '—';
  const n = Number(val);
  if (uom?.display_format) return uom.display_format.replace('{value}', n % 1 === 0 ? n : n.toFixed(1));
  return String(val);
};

export default function ShortTermOutcomePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { planningYear: fiscalYear } = usePlanningYear();
  const { data: raw, isLoading: loading } = useShortTermOutcomeData(fiscalYear);
  const { t3 = [], t4 = [], areas = [], broads = [], specifics = [], divisions = [] } = raw || {};

  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [areaFilter, setAreaFilter] = useState('all');
  const [buFilter, setBuFilter] = useState('all');
  const [divFilter, setDivFilter] = useState('all');

  const { can } = usePermissions();
  const canEdit = can('short_term_outcome', 'update');
  const canDelete = can('short_term_outcome', 'delete');
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState(null);

  const confirmDeleteIndicator = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/plan-nodes/indicator/${deleteTarget.id}`);
      toast.success('Indicator deleted');
      queryClient.invalidateQueries({ queryKey: ['plan'] });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    } finally {
      setDeleteTarget(null);
    }
  };

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const areaById = {};
  areas.forEach(a => { areaById[a.id] = a; });

  const divByCode = {};
  divisions.forEach(d => { divByCode[d.code] = d; });

  // Build lookup: for each indicator, the specifics linked to it
  const specsByIndId = {};
  specifics.forEach(s => {
    if (s.linked_indicator_id) {
      if (!specsByIndId[s.linked_indicator_id]) specsByIndId[s.linked_indicator_id] = [];
      specsByIndId[s.linked_indicator_id].push(s);
    }
  });

  // Build lookup: linked broads via specific.parent_id
  const broadById = {};
  broads.forEach(b => { broadById[b.id] = b; });

  const all = [...t3, ...t4];
  const directorates = [...new Set(divisions.map(d => d.directorate).filter(Boolean))].sort();
  const divCodes = [...new Set(all.map(i => i.responsible_division_code).filter(Boolean))].sort();
  const divsInBu = buFilter === 'all' ? divCodes : divCodes.filter(c => divByCode[c]?.directorate === buFilter);

  const filtered = all.filter(i => {
    if (tierFilter !== 'all' && i.tier_id !== Number(tierFilter)) return false;
    if (areaFilter !== 'all' && i.parent_id !== Number(areaFilter)) return false;
    if (buFilter !== 'all' && divByCode[i.responsible_division_code]?.directorate !== buFilter) return false;
    if (divFilter !== 'all' && i.responsible_division_code !== divFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (i.title || '').toLowerCase().includes(s) || (i.code || '').toLowerCase().includes(s);
    }
    return true;
  });

  const grouped = {};
  filtered.forEach(i => {
    const key = i.parent_id || 'unlinked';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(i);
  });

  if (loading) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Planning' }, { label: 'Short Term Outcomes (T3/T4)' }]}>
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-[#14442A]" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Planning' }, { label: 'Short Term Outcomes (T3/T4)' }]}>
      <div className="space-y-0">

        <div className="bg-[#14442A] text-white">
          <div className="px-6 py-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">
                Tier 3 / Tier 4
              </span>
              <span className="text-[11px] font-mono text-white/70">{fiscalYear}</span>
            </div>
            <div className="flex items-center justify-between">
              <h1 className="text-[16px] font-semibold leading-snug max-w-3xl">
                Short-term outcomes and output indicators
              </h1>
              {canEdit && (
                <Button
                  variant="inverse"
                  size="md"
                  onClick={() => navigate('/pirs/new')}
                  className="flex-shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Indicator
                </Button>
              )}
            </div>
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex flex-wrap items-center gap-6 text-[12px] text-white/70">
            <span><strong className="text-white">{t3.length}</strong> T3 indicators</span>
            <span><strong className="text-white">{t4.length}</strong> T4 indicators</span>
            <span><strong className="text-white">{filtered.length}</strong> shown</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 border-t-0 px-6 py-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 border border-gray-200 px-2.5 py-1.5 flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by code or title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-[11px] outline-none w-full bg-transparent"
            />
          </div>
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="text-[10px] border border-gray-200 px-2.5 py-1.5 text-gray-700 bg-white outline-none"
          >
            <option value="all">All Tiers ({all.length})</option>
            <option value="3">T3 only ({t3.length})</option>
            <option value="4">T4 only ({t4.length})</option>
          </select>
          <select
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            className="text-[10px] border border-gray-200 px-2.5 py-1.5 text-gray-700 bg-white outline-none"
          >
            <option value="all">All Outcomes</option>
            {areas.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true })).map(a => (
              <option key={a.id} value={a.id}>{a.code} — {a.title.substring(0, 50)}</option>
            ))}
          </select>
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
            {divsInBu.map(c => (
              <option key={c} value={c}>{divByCode[c]?.division_name || c}</option>
            ))}
          </select>
        </div>

        {Object.entries(grouped).sort(([a], [b]) => {
          const aa = areaById[a]?.code || '';
          const bb = areaById[b]?.code || '';
          return aa.localeCompare(bb, undefined, { numeric: true });
        }).map(([parentId, inds]) => {
          const area = areaById[parentId];
          return (
            <div key={parentId} className="bg-white border border-gray-200 border-t-0">
              <div className="px-5 py-2.5 bg-[#1A5632] flex items-center gap-3">
                {area ? (
                  <button
                    onClick={() => navigate(`/plan/node/${area.id}`)}
                    className="flex items-center gap-2 min-w-0 text-white hover:underline"
                  >
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 border border-white/30 text-[9px] font-bold flex-shrink-0">
                      {area.code}
                    </span>
                    <span className="text-[10px] font-medium truncate max-w-[600px]">{area.title}</span>
                  </button>
                ) : (
                  <span className="text-[10px] text-white/60">Unlinked</span>
                )}
                <span className="ml-auto text-[10px] text-white/60">{inds.length} indicators</span>
              </div>

              <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] text-gray-400 border-b border-gray-100 bg-gray-50">
                    <th className="px-3 py-1.5 font-normal w-[40px]"></th>
                    <th className="px-3 py-1.5 font-normal w-[50px] text-center">Tier</th>
                    <th className="px-3 py-1.5 font-normal w-[140px]">Code</th>
                    <th className="px-3 py-1.5 font-normal">Indicator</th>
                    <th className="px-3 py-1.5 font-normal w-[80px] text-center">Unit</th>
                    <th className="px-3 py-1.5 font-normal w-[60px] text-center">Baseline</th>
                    <th className="px-3 py-1.5 font-normal w-[60px] text-center">Target</th>
                    <th className="px-3 py-1.5 font-normal w-[40px] text-center">Q1</th>
                    <th className="px-3 py-1.5 font-normal w-[40px] text-center">Q2</th>
                    <th className="px-3 py-1.5 font-normal w-[40px] text-center">Q3</th>
                    <th className="px-3 py-1.5 font-normal w-[40px] text-center">Q4</th>
                    <th className="px-3 py-1.5 font-normal w-[80px] text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {inds.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true })).map((ind, idx) => (
                    <React.Fragment key={ind.id}>
                      <tr
                        className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                        onClick={() => toggle(ind.id)}
                      >
                        <td className="px-3 py-2.5 text-center">
                          {expanded[ind.id]
                            ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 inline pointer-events-none" />
                            : <ChevronRight className="w-3.5 h-3.5 text-gray-400 inline pointer-events-none" />
                          }
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold ${ind.tier_id === 3 ? 'bg-[#14442A] text-white' : 'bg-[#D97706] text-white'}`}>
                            T{ind.tier_id}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[10px] font-mono font-bold text-gray-700">
                          {ind.code}
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-gray-900 font-medium">
                          {ind.title}
                        </td>
                        <td className="px-3 py-2.5 text-[10px] text-gray-500 text-center">
                          {ind.uom?.label || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-[10px] font-semibold text-gray-700 text-center">
                          {fmtNumeric(ind.baseline_numeric, ind.uom)}
                        </td>
                        <td className="px-3 py-2.5 text-[10px] font-semibold text-[#14442A] text-center">
                          {fmtNumeric(ind.target_y1_numeric, ind.uom)}
                        </td>
                        <td className="px-3 py-2.5 text-[10px] text-gray-500 text-center">{ind.q1_target_numeric != null ? (ind.uom?.code === 'NUMBER' ? Math.round(Number(ind.q1_target_numeric)) : Number(ind.q1_target_numeric)) : '—'}</td>
                        <td className="px-3 py-2.5 text-[10px] text-gray-500 text-center">{ind.q2_target_numeric != null ? (ind.uom?.code === 'NUMBER' ? Math.round(Number(ind.q2_target_numeric)) : Number(ind.q2_target_numeric)) : '—'}</td>
                        <td className="px-3 py-2.5 text-[10px] text-gray-500 text-center">{ind.q3_target_numeric != null ? (ind.uom?.code === 'NUMBER' ? Math.round(Number(ind.q3_target_numeric)) : Number(ind.q3_target_numeric)) : '—'}</td>
                        <td className="px-3 py-2.5 text-[10px] text-gray-500 text-center">{ind.q4_target_numeric != null ? (ind.uom?.code === 'NUMBER' ? Math.round(Number(ind.q4_target_numeric)) : Number(ind.q4_target_numeric)) : '—'}</td>
                        <td className="px-3 py-2.5 text-center">
                          <RowActions id={ind.id} actions={indicatorActions(ind.id, { onDelete: canDelete ? (id) => setDeleteTarget(ind) : null })} />
                        </td>
                      </tr>

                      {expanded[ind.id] && (() => {
                        const linkedSpecs = specsByIndId[ind.id] || [];
                        const linkedBroadIds = [...new Set(linkedSpecs.map(s => s.parent_id).filter(Boolean))];
                        const linkedBroads = linkedBroadIds.map(id => broadById[id]).filter(Boolean);
                        const totalSpecBudget = linkedSpecs.reduce((s, sp) => s + Number(sp.budget_total_2026 || 0), 0);
                        return (
                          <tr>
                            <td colSpan={8} className="px-6 py-4 bg-gradient-to-b from-green-50 to-white border-b border-gray-200">
                              {/* Division Ownership: MAIN + CONTRIBUTORS */}
                              <div className="mb-4">
                                <p className="text-[9px] uppercase text-gray-400 font-semibold mb-2">Division Ownership</p>
                                <div className="flex flex-wrap items-center gap-2">
                                  {ind.responsible_division_code ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#14442A] text-white text-[9px] font-semibold">
                                      MAIN: {divByCode[ind.responsible_division_code]?.division_name || ind.responsible_division_code}
                                      <span className="text-white/60 font-mono ml-0.5">({ind.responsible_division_code})</span>
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-gray-400 italic">No main division assigned</span>
                                  )}
                                  {(() => {
                                    // Explicit contributing_divisions on the indicator (persisted via form)
                                    let explicit = ind.contributing_divisions;
                                    if (typeof explicit === 'string') { try { explicit = JSON.parse(explicit); } catch { explicit = []; } }
                                    if (!Array.isArray(explicit)) explicit = [];
                                    // + divisions that contribute via linked specifics
                                    const fromSpecs = linkedSpecs
                                      .map(s => s.responsible_division_code)
                                      .filter(Boolean);
                                    const contribCodes = [...new Set([...explicit, ...fromSpecs])]
                                      .filter(c => c && c !== ind.responsible_division_code);
                                    if (contribCodes.length === 0) return null;
                                    return contribCodes.map(code => (
                                      <span key={code} className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 border border-orange-200 text-[9px] font-semibold text-[#B45309]">
                                        CONTRIB: {divByCode[code]?.division_name || code}
                                        <span className="text-orange-400 font-mono ml-0.5">({code})</span>
                                      </span>
                                    ));
                                  })()}
                                </div>
                              </div>

                              {/* Targets row */}
                              <div className="mb-4">
                                <p className="text-[9px] uppercase text-gray-400 font-semibold mb-2">Quarterly Targets</p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                                  <TargetCell label="Baseline" value={fmtNumeric(ind.baseline_numeric, ind.uom)} />
                                  <TargetCell label="Q1" value={fmtNumeric(ind.q1_target_numeric, ind.uom)} />
                                  <TargetCell label="Q2" value={fmtNumeric(ind.q2_target_numeric, ind.uom)} />
                                  <TargetCell label="Q3" value={fmtNumeric(ind.q3_target_numeric, ind.uom)} />
                                  <TargetCell label={`Target ${fiscalYear}`} value={fmtNumeric(ind.target_y1_numeric, ind.uom)} highlight />
                                </div>
                              </div>

                              {/* Linked Broad Activities */}
                              {linkedBroads.length > 0 && (
                                <div className="mb-4">
                                  <p className="text-[9px] uppercase text-gray-400 font-semibold mb-2">
                                    Linked Broad Activities ({linkedBroads.length})
                                  </p>
                                  <div className="space-y-1">
                                    {linkedBroads.map(b => (
                                      <button
                                        key={b.id}
                                        onClick={() => navigate(`/plan/node/${b.id}`)}
                                        className="flex items-center gap-2 w-full text-left px-2 py-1.5 bg-white border border-[#B45309]/30 hover:border-[#B45309] hover:bg-orange-50 transition-colors"
                                      >
                                        <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold bg-[#B45309] text-white">{b.code}</span>
                                        <span className="text-[9px] text-gray-500 font-mono">{b.responsible_division_code || ''}</span>
                                        <span className="text-[10px] text-gray-800 truncate flex-1">{b.title}</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Linked Specific Activities */}
                              {linkedSpecs.length > 0 && (
                                <div className="mb-4">
                                  <p className="text-[9px] uppercase text-gray-400 font-semibold mb-2">
                                    Specific Activities Contributing ({linkedSpecs.length}) — Total Budget: <span className="text-[#14442A] font-bold">${totalSpecBudget.toLocaleString('en-US')}</span>
                                  </p>
                                  <div className="border border-gray-200 bg-white max-h-[300px] overflow-y-auto">
                                    <table className="w-full text-left">
                                      <thead className="sticky top-0 bg-gray-50">
                                        <tr className="text-[9px] text-gray-400 border-b border-gray-100">
                                          <th className="px-3 py-1.5 font-normal w-[100px]">Code</th>
                                          <th className="px-3 py-1.5 font-normal">Task</th>
                                          <th className="px-3 py-1.5 font-normal w-[90px]">Division</th>
                                          <th className="px-3 py-1.5 font-normal w-[80px] text-center">Status</th>
                                          <th className="px-3 py-1.5 font-normal w-[90px] text-right">Budget</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {linkedSpecs.slice(0, 50).map((s, i) => (
                                          <tr key={s.id} onClick={() => navigate(`/plan/node/${s.id}`)} className={`border-b border-gray-50 cursor-pointer hover:bg-orange-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                                            <td className="px-3 py-1.5 text-[9px] font-mono font-bold text-[#D97706]">{s.code}</td>
                                            <td className="px-3 py-1.5 text-[10px] text-gray-800">{(s.title || '').slice(0, 80)}{(s.title || '').length > 80 ? '...' : ''}</td>
                                            <td className="px-3 py-1.5 text-[9px] text-gray-500 font-mono">{s.responsible_division_code || '—'}</td>
                                            <td className="px-3 py-1.5 text-center">
                                              <span className={`text-[8px] font-semibold px-1.5 py-0.5 ${s.status === 'APPROVED' ? 'bg-green-50 text-green-700' : s.status === 'IN_REVIEW' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                                                {s.status || 'DRAFT'}
                                              </span>
                                            </td>
                                            <td className="px-3 py-1.5 text-[10px] font-semibold text-[#D97706] text-right">${Number(s.budget_total_2026 || 0).toLocaleString('en-US')}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* Empty states */}
                              {linkedBroads.length === 0 && linkedSpecs.length === 0 && (
                                <p className="text-[10px] text-gray-400 italic mb-3">No activities linked to this indicator yet.</p>
                              )}

                              <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
                                <button
                                  onClick={() => navigate(`/plan/node/${ind.id}`)}
                                  className="flex items-center gap-1.5 text-[10px] font-semibold text-[#14442A] hover:underline"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Open full indicator page
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
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="bg-white border border-gray-200 border-t-0 px-5 py-12 text-center">
            <p className="text-[11px] text-gray-500">No indicators found.</p>
          </div>
        )}
      </div>


      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white border border-gray-200 w-full max-w-[400px] p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-[14px] font-semibold text-gray-900 mb-2">Delete indicator</h3>
            <p className="text-[12px] text-gray-600 mb-4">
              Are you sure you want to delete <strong>{deleteTarget.indicator_code || deleteTarget.code}</strong>?
              This cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-[11px] border border-gray-300 text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={confirmDeleteIndicator}
                className="px-4 py-2 text-[11px] bg-red-600 text-white hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function TargetCell({ label, value, highlight }) {
  return (
    <div className={`border p-2.5 ${highlight ? 'border-[#14442A] bg-[#F0F7F2]' : 'border-gray-100'}`}>
      <p className="text-[9px] text-gray-400 uppercase">{label}</p>
      <p className={`text-[12px] font-semibold mt-0.5 ${highlight ? 'text-[#14442A]' : 'text-gray-800'}`}>
        {value}
      </p>
    </div>
  );
}
