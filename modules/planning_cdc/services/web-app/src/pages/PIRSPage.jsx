/* eslint-disable max-lines, complexity, no-restricted-syntax, no-unused-vars --
 * Legacy page with baseline debt from pre-guardrails era. Scheduled refactor:
 * task #37 — migrate off pragma when React-Query cohort + RBAC matrix migration
 * lands on this page. Do NOT add new violations; this pragma is a ceiling,
 * not a green light.
 *
 * (cdc-rbm/no-inline-status-map cleared 2026-05-31: the inline status→class map
 *  is now the shared <StatusBadge> backed by getStatusConfig.)
 */
import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePIRSIndicators } from '@/hooks/usePlanNodeQueries';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveBuCodes } from '@/hooks/useActiveBuCodes';
import { RBAC_MODULES } from '@rbm/lib/rbac';
import { usePermissions } from '@/hooks/usePermissions';
import { Loader2, Search, X, Plus } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/services/api';
import { adminService } from '@/services/adminService';
import IndicatorRowActions from '@/components/indicators/IndicatorRowActions';
import { Button } from '@/components/ui/button';
import ExportMenu from '@/components/shared/ExportMenu';
import { exportApi, triggerDownload } from '@/services/export.api';
import PillarChip from '@/components/shared/PillarChip';
import { usePillarNameById } from '@/hooks/usePillars';
import { fyToYear } from '@rbm/lib/fiscalYear';
import { usePlanningYear } from '@/contexts/PlanningYearContext';

const TIER_COLORS = { 1: '#9F2241', 2: '#1A5632', 3: '#B4A269', 4: '#58595B' };
const TIER_LABELS = { 1: 'Impact', 2: 'Outcome', 3: 'Short-term Outcome', 4: 'Output' };

/**
 * PIRS (Performance Indicator Reference Sheet) page: the indicators as imported,
 * with their PIRS metadata, for the BU of the BU selector (D-20261105-06). It no
 * longer lists the activities linked to each indicator.
 *
 * @returns {JSX.Element}
 */
export default function PIRSPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManage = can('pirs', 'create');
  const canDelete = can('pirs', 'delete');

  const [search, setSearch] = React.useState('');
  const [filterTier, setFilterTier] = React.useState('all');
  const pillarName = usePillarNameById();
  const [deleteTarget, setDeleteTarget] = React.useState(null);

  const confirmDeleteIndicator = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/plan-nodes/indicator/${deleteTarget.id}`);
      toast.success('Indicator deleted');
      queryClient.invalidateQueries({ queryKey: ['plan', 'pirs-indicators'] });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    } finally {
      setDeleteTarget(null);
    }
  };

  const { planningYear: fiscalYear, fyNum } = usePlanningYear();
  const canExport = can('pirs', 'export');
  const [isExporting, setIsExporting] = React.useState(false);

  const handleExport = async (format) => {
    setIsExporting(true);
    try {
      const res = await exportApi.pirs({ fiscalYear, format });
      triggerDownload(res, `pirs-indicators-${fiscalYear}.${format}`);
    } catch {
      toast.error('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const { data: allIndicators = [], isLoading: loading } = usePIRSIndicators(fiscalYear);
  // The PIRS as imported, filtered on the active BU (D-20261105-06).
  const buCodes = useActiveBuCodes(RBAC_MODULES.PIRS);
  const indicators = useMemo(() => (buCodes
    ? allIndicators.filter(i => buCodes.includes(String(i.responsible_division_code || '').toUpperCase()))
    : allIndicators), [allIndicators, buCodes]);
  const filtered = useMemo(() => {
    let list = indicators;
    if (filterTier !== 'all') list = list.filter(i => String(i.tier_id) === filterTier);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i => [i.indicator_name, i.indicator_code, i.definition, i.data_source, i.strategic_priority].filter(Boolean).join(' ').toLowerCase().includes(q));
    }
    return list.sort((a, b) => {
      if (a.tier_id !== b.tier_id) return a.tier_id - b.tier_id;
      return (a.indicator_code || '').localeCompare(b.indicator_code || '', undefined, { numeric: true });
    });
  }, [indicators, search, filterTier]);

  const tierCounts = useMemo(() => {
    const c = {};
    indicators.forEach(i => { c[i.tier_id] = (c[i.tier_id] || 0) + 1; });
    return c;
  }, [indicators]);

  const withBaseline = indicators.filter(i => i.baseline_value ?? i.baseline_numeric).length;
  const withTarget = indicators.filter(i => i.target_fy1 ?? i.target_y1_numeric).length;

  if (loading) return <DashboardLayout breadcrumbs={[{ label: 'PIRS' }, { label: 'Indicators' }]}><div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" /></div></DashboardLayout>;

  return (
    <DashboardLayout breadcrumbs={[{ label: 'PIRS' }, { label: 'Indicators' }]}>
      <div className="space-y-0">

        {/* Hero */}
        <div className="bg-[#1A5632] text-white">
          <div className="px-6 py-5 flex items-start justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">PIRS</span>
              <h1 className="text-[20px] font-semibold mt-2">Performance Indicator Reference Sheets</h1>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {canExport && (
                <ExportMenu onExport={handleExport} isExporting={isExporting} label="Export" />
              )}
              {canManage && (
                <Button variant="inverse" size="md" onClick={() => navigate('/pirs/new')}>
                  <Plus className="w-3.5 h-3.5" /> New Indicator
                </Button>
              )}
            </div>
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex items-center gap-6 text-[12px] text-white/70">
            <span><strong className="text-white">{indicators.length}</strong> Indicators</span>
            <span><strong className="text-white">{withBaseline}</strong> with Baseline</span>
            <span><strong className="text-white">{withTarget}</strong> with Target</span>
          </div>
        </div>

        {/* Tier cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 border border-gray-200 border-t-0 divide-x divide-gray-200">
          {[1, 2, 3, 4].map(t => (
            <button key={t} onClick={() => setFilterTier(filterTier === String(t) ? 'all' : String(t))}
              className={`px-5 py-3 text-left transition-colors ${filterTier === String(t) ? 'bg-gray-100' : 'bg-white hover:bg-gray-50'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-bold text-white px-1.5 py-0.5" style={{ backgroundColor: TIER_COLORS[t] }}>T{t}</span>
                <span className="text-[10px] text-gray-500">{TIER_LABELS[t]}</span>
              </div>
              <div className="text-[22px] font-bold text-gray-900">{tierCounts[t] || 0}</div>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 border-t-0 px-5 py-3 flex items-center gap-3">
          <div className="relative flex-1 max-w-[300px]">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, code, definition..."
              className="w-full text-[12px] border border-gray-200 pl-8 pr-8 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1A5632] focus:border-[#1A5632]" />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3 h-3 text-gray-400" /></button>}
          </div>
          {filterTier !== 'all' && (
            <button onClick={() => setFilterTier('all')} className="text-[10px] text-[#1A5632] hover:underline font-medium">Clear filter</button>
          )}
          <span className="text-[11px] text-gray-400 ml-auto">{filtered.length} indicators</span>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 border-t-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#1A5632] text-white text-[10px]">
                  <th className="px-3 py-2.5 font-semibold w-[40px] text-center">Tier</th>
                  <th className="px-3 py-2.5 font-semibold w-[60px]">Code</th>
                  <th className="px-3 py-2.5 font-semibold">Indicator</th>
                  <th className="px-3 py-2.5 font-semibold w-[70px] text-center">Baseline</th>
                  <th className="px-3 py-2.5 font-semibold w-[70px] text-center">Target · {fyToYear(fyNum)}</th>
                  <th className="px-3 py-2.5 font-semibold w-[70px] text-center">Overall</th>
                  <th className="px-3 py-2.5 font-semibold w-[100px]">Data Source</th>
                  <th className="px-3 py-2.5 font-semibold w-[70px] text-center">Frequency</th>
                  <th className="w-[40px]"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ind, idx) => {
                  return (
                    <React.Fragment key={ind.id}>
                      <tr className={`border-b border-gray-100 hover:bg-gray-50 group ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-[9px] font-bold text-white px-1.5 py-0.5" style={{ backgroundColor: TIER_COLORS[ind.tier_id] || '#666' }}>T{ind.tier_id}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Link to={`/plan/node/${ind.id}`} className="text-[11px] font-mono font-semibold text-[#1A5632] hover:underline">{ind.indicator_code || ind.code}</Link>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <Link to={`/plan/node/${ind.id}`} className="text-[12px] text-gray-800 hover:text-[#1A5632] hover:underline line-clamp-1">{ind.indicator_name || ind.title}</Link>
                            <PillarChip name={pillarName(ind.pillar_id)} className="flex-shrink-0" />
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-[12px] text-gray-700 text-center font-medium">{ind.baseline_value ?? ind.baseline_numeric ?? '-'}</td>
                        <td className="px-3 py-2.5 text-[12px] text-center font-semibold text-[#1A5632]">{ind[`target_fy${fyNum}`] ?? ind[`target_y${fyNum}_numeric`] ?? ind.target_fy1 ?? ind.target_y1_numeric ?? '-'}</td>
                        <td className="px-3 py-2.5 text-[12px] text-gray-600 text-center">{ind.overall_target || '-'}</td>
                        <td className="px-3 py-2.5 text-[10px] text-gray-500 truncate" style={{ maxWidth: 100 }}>{ind.data_source || '-'}</td>
                        <td className="px-3 py-2.5 text-[10px] text-gray-500 text-center">{ind.reporting_frequency || '-'}</td>
                        <td className="px-3 py-2.5">
                          <IndicatorRowActions
                            detailUrl={`/plan/node/${ind.id}`}
                            onEdit={canManage ? () => navigate(`/pirs/${ind.id}/edit`) : null}
                            onDelete={canDelete ? () => setDeleteTarget(ind) : null}
                          />
                        </td>
                      </tr>

                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="px-5 py-12 text-center text-[12px] text-gray-400">No indicators match your search</div>}
        </div>
        {/* Delete confirmation modal */}
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
      </div>
    </DashboardLayout>
  );
}
