import { useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { toast } from 'sonner';
import { Loader2, Search, ChevronDown, ChevronRight, Filter, X } from 'lucide-react';
import { fmtBudgetCompact } from '@rbm/lib/formatters';
import { STATUSES, STATUS_COLORS, NODE_TYPES } from '@rbm/lib/enums';
import RowActions, { planNodeActions } from '@/components/shared/RowActions';
import NodeTypeBadge from '@/components/shared/NodeTypeBadge';
import { NODE_TYPE_BADGES } from '@/config/nodeTypeBadges';
import { useWorkplanRows, useUpdateWorkplanRow } from './workplans/hooks/useWorkplansQueries';
import { usePermissions } from '@/hooks/usePermissions';
import ExportMenu from '@/components/shared/ExportMenu';
import { exportApi, triggerDownload } from '@/services/export.api';
import { RBAC_MODULES, RBAC_ACTIONS } from '@rbm/lib/rbac';
import { useWorkplanFilters } from '@/hooks/filters/useWorkplanFilters';
import { useDivisionCodes } from '@/hooks/useMiscQueries';
import { useReferenceValues } from '@/hooks/useReferenceQueries';
import { REFERENCE_TYPES } from '@rbm/lib/enums';
import SearchSelect from '@/components/shared/SearchSelect';
import { directorateOptions, divisionOptions, matchesDivisionFilter, indexByCode } from '@/utils/divisionHierarchy';
import { usePlanningYear } from '@/contexts/PlanningYearContext';

// UI label, not an entity-type discriminator — exempt from P-31 here.
// eslint-disable-next-line no-restricted-syntax -- breadcrumb display label
const BREADCRUMBS = [{ label: 'Execution' }, { label: 'Workplan' }];

// Subset of canonical statuses surfaced in the workplan inline editors.
const WORKPLAN_STATUSES = [
  STATUSES.NOT_STARTED,
  STATUSES.IN_PROGRESS,
  STATUSES.COMPLETED,
  STATUSES.BLOCKED,
  STATUSES.CANCELLED,
];

// Fallback config for an unknown / missing status key.
const FALLBACK_STATUS = STATUS_COLORS[STATUSES.NOT_STARTED];

// Local: returns '' on empty values to keep table cells visually clean.
const fmt = (v) => fmtBudgetCompact(v, '');

// SearchSelect uses null for "nothing selected"; our filter sentinel is 'all'.
const nullIfAll = (v) => (v === 'all' ? null : v);

function ProgressBar({ pct }) {
  const p = Math.min(100, Math.max(0, Number(pct) || 0));
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-[6px] bg-gray-100">
        <div className="h-full" style={{ width: `${p}%`, backgroundColor: p >= 100 ? '#059669' : p >= 50 ? '#2563EB' : p > 0 ? '#E8A838' : '#E5E7EB' }} />
      </div>
      <span className="text-[10px] text-gray-400 w-[28px] text-right">{p}%</span>
    </div>
  );
}

function ProgressInput({ id, currentPct, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(currentPct || 0));

  const commit = () => {
    setEditing(false);
    const n = Math.min(100, Math.max(0, parseInt(val) || 0));
    if (n === (currentPct || 0)) return;
    onUpdated(id, { percent_complete: n });
    toast.success('Progress updated (local)');
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <input
          type="number" min="0" max="100" value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          className="w-12 text-[11px] border border-[#1A5632] px-1 py-0.5 text-center focus:outline-none"
          autoFocus
        />
        <span className="text-[10px] text-gray-400">%</span>
      </div>
    );
  }

  const p = Math.min(100, Math.max(0, Number(currentPct) || 0));
  return (
    <div className="flex items-center gap-1.5 cursor-pointer group" onClick={e => { e.stopPropagation(); setEditing(true); setVal(String(p)); }}>
      <div className="flex-1 h-[5px] bg-gray-100 w-16">
        <div className="h-full" style={{ width: `${p}%`, backgroundColor: p >= 100 ? '#059669' : p >= 50 ? '#2563EB' : p > 0 ? '#E8A838' : '#E5E7EB' }} />
      </div>
      <span className="text-[10px] text-gray-400 group-hover:text-[#1A5632] w-[28px] text-right">{p}%</span>
    </div>
  );
}

function StatusDropdown({ id, currentStatus, onUpdated }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (status) => {
    if (status === currentStatus) { setOpen(false); return; }
    setOpen(false);
    onUpdated(id, { status });
    toast.success('Status updated (local)');
  };

  const info = STATUS_COLORS[currentStatus] || FALLBACK_STATUS;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className={`text-[10px] font-medium px-1.5 py-0.5 ${info.bg} ${info.text} flex items-center gap-1 hover:opacity-80 cursor-pointer`}
      >
        {info.label}
        <ChevronDown className="w-2.5 h-2.5 opacity-50" />
      </button>
      {open && (
        <div className="absolute z-50 left-0 top-full mt-0.5 bg-white border border-gray-200 shadow-md min-w-[120px]">
          {WORKPLAN_STATUSES.map((k) => {
            const v = STATUS_COLORS[k] || FALLBACK_STATUS;
            return (
              <button
                key={k}
                onClick={(e) => { e.stopPropagation(); handleSelect(k); }}
                className={`w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-gray-50 flex items-center gap-2 ${k === currentStatus ? 'font-semibold' : ''}`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${v.dot}`} />
                {v.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Workplans browse page. Lists workplan activities and tasks grouped by outcome,
 * with inline status/progress editing, search, status filter and quarter filter.
 *
 * @returns {JSX.Element}
 */
export default function Workplans() {
  const { planningYear: fiscalYear } = usePlanningYear();
  const { can } = usePermissions();
  const canExport = can(RBAC_MODULES.WORKPLAN, RBAC_ACTIONS.EXPORT);
  const [isExporting, setIsExporting] = useState(false);
  const [isDonorExporting, setIsDonorExporting] = useState(false);
  const [donorSource, setDonorSource] = useState(null);
  const { filters, setFilter, setFilters, clearAllFilters, activeFilterCount } = useWorkplanFilters();
  const [expandedOutcomes, setExpandedOutcomes] = useState({});
  const [expandedActivities, setExpandedActivities] = useState({});

  const { data: divisions = [] } = useDivisionCodes();
  const { data: fundingSources = [] } = useReferenceValues(REFERENCE_TYPES.FUNDING_SOURCE);
  const fundingSourceOptions = useMemo(
    () => fundingSources.map((v) => ({ value: v, label: v })),
    [fundingSources],
  );
  const divByCode = useMemo(() => indexByCode(divisions), [divisions]);
  const dirOptions = useMemo(() => directorateOptions(divisions), [divisions]);
  const divOptions = useMemo(
    () => divisionOptions(divisions, filters.directorateId),
    [divisions, filters.directorateId],
  );

  const handleExport = async (format) => {
    setIsExporting(true);
    try {
      const res = await exportApi.workplan({ fiscalYear, format });
      triggerDownload(res, `workplan-${fiscalYear}.${format}`);
    } catch {
      toast.error('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDonorExport = async (format) => {
    setIsDonorExporting(true);
    try {
      const res = await exportApi.donor({ fiscalYear, fundingSource: donorSource || undefined, format });
      const slug = (donorSource || 'all').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      triggerDownload(res, `donor-${slug}-${fiscalYear}.${format}`);
    } catch {
      toast.error('Donor export failed. Please try again.');
    } finally {
      setIsDonorExporting(false);
    }
  };

  const { data, isLoading } = useWorkplanRows(fiscalYear);
  const updateRow = useUpdateWorkplanRow(fiscalYear);
  const activities = useMemo(() => data?.activities || [], [data]);
  const outcomesList = useMemo(() => data?.outcomesList || [], [data]);
  const indicatorsByArea = useMemo(() => data?.indicatorsByArea || {}, [data]);

  const outcomes = useMemo(() => {
    return [...outcomesList].sort((a, b) => (a.amert_index || '').localeCompare(b.amert_index || '', undefined, { numeric: true }));
  }, [outcomesList]);

  const filtered = useMemo(() => {
    let list = activities;
    if (filters.q) {
      const q = filters.q.toLowerCase();
      list = list.filter(a => a.title?.toLowerCase().includes(q) || a.code?.toLowerCase().includes(q) || a.responsible_division?.toLowerCase().includes(q));
    }
    if (filters.status !== 'all') list = list.filter(a => a.status === filters.status);
    if (filters.divisionId !== 'all' || filters.directorateId !== 'all') {
      list = list.filter(a => matchesDivisionFilter(
        a, { divisionId: filters.divisionId, directorate: filters.directorateId }, divByCode,
      ));
    }
    if (filters.quarter !== 'all') {
      const qMonth = (parseInt(filters.quarter) - 1) * 3;
      list = list.filter(a => {
        if (!a.start_date) return false;
        const sm = new Date(a.start_date).getMonth();
        const em = a.end_date ? new Date(a.end_date).getMonth() : sm;
        return sm <= qMonth + 2 && em >= qMonth;
      });
    }
    return list;
  }, [activities, filters, divByCode]);

  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(a => {
      const k = a.result_id || 'unlinked';
      if (!map[k]) map[k] = [];
      map[k].push(a);
    });
    return map;
  }, [filtered]);

  const toggleOutcome = (id) => setExpandedOutcomes(p => ({ ...p, [id]: !p[id] }));
  const toggleActivity = (id) => setExpandedActivities(p => ({ ...p, [id]: !p[id] }));

  const totalBudget = filtered.reduce((s, a) => s + Number(a.budget_total || 0), 0);
  const totalTasks = filtered.reduce((s, a) => s + (a.tasks?.length || 0), 0);
  const avgProgress = filtered.length ? Math.round(filtered.reduce((s, a) => s + Number(a.percent_complete || 0), 0) / filtered.length) : 0;
  const hasFilters = activeFilterCount > 0;

  if (isLoading) {
    return (
      <DashboardLayout breadcrumbs={BREADCRUMBS}>
        <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout breadcrumbs={BREADCRUMBS}>
      <div className="space-y-0">

        {/* Hero */}
        <div className="bg-[#1A5632] text-white">
          <div className="px-6 py-5">
            <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">FY 2026</span>
            <h1 className="text-[20px] font-semibold mt-2">Workplan Execution</h1>
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex flex-wrap items-center gap-6 text-[12px] text-white/70">
            <span><strong className="text-white">{filtered.length}</strong> Activities</span>
            <span><strong className="text-white">{totalTasks}</strong> Tasks</span>
            <span><strong className="text-white">{outcomes.length}</strong> Outcomes</span>
            <span><strong className="text-white">{avgProgress}%</strong> Avg Progress</span>
            {totalBudget > 0 && <span className="ml-auto text-white font-semibold">{fmt(totalBudget)}</span>}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 border-t-0 px-5 py-3 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-[300px]">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={filters.q} onChange={e => setFilter('q', e.target.value)} placeholder="Search activities, divisions..."
              className="w-full text-[12px] border border-gray-200 pl-8 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1A5632] focus:border-[#1A5632]" />
            {filters.q && <button onClick={() => setFilter('q', '')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3 h-3 text-gray-400" /></button>}
          </div>
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          {/* Directorate filter (autocomplete — long list) */}
          <div className="w-[190px]">
            <SearchSelect
              value={nullIfAll(filters.directorateId)}
              options={dirOptions}
              onChange={(v) => setFilters({ directorateId: v || 'all', divisionId: 'all' })}
              placeholder="All Directorates"
              allowClear
            />
          </div>
          {/* Division filter (autocomplete — long list, narrowed by directorate) */}
          <div className="w-[190px]">
            <SearchSelect
              value={nullIfAll(filters.divisionId)}
              options={divOptions}
              onChange={(v) => setFilter('divisionId', v || 'all')}
              placeholder="All Divisions"
              allowClear
            />
          </div>
          <div className="relative">
            <select value={filters.status} onChange={e => setFilter('status', e.target.value)}
              className="appearance-none text-[11px] border border-gray-200 bg-white pl-2 pr-6 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1A5632]">
              <option value="all">All Status</option>
              {WORKPLAN_STATUSES.map((k) => {
                const v = STATUS_COLORS[k] || FALLBACK_STATUS;
                return <option key={k} value={k}>{v.label}</option>;
              })}
            </select>
            <ChevronDown className="w-3 h-3 text-gray-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <div className="relative">
            <select value={filters.quarter} onChange={e => setFilter('quarter', e.target.value)}
              className="appearance-none text-[11px] border border-gray-200 bg-white pl-2 pr-6 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1A5632]">
              <option value="all">All Quarters</option>
              <option value="1">Q1 (Jan-Mar)</option>
              <option value="2">Q2 (Apr-Jun)</option>
              <option value="3">Q3 (Jul-Sep)</option>
              <option value="4">Q4 (Oct-Dec)</option>
            </select>
            <ChevronDown className="w-3 h-3 text-gray-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          {hasFilters && (
            <button onClick={clearAllFilters}
              className="text-[10px] text-[#1A5632] hover:underline font-medium">Clear all</button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-3 text-[10px] text-gray-400">
            {canExport && (
              <>
                <ExportMenu onExport={handleExport} isExporting={isExporting} label="Export" />
                <div className="flex items-center gap-1.5">
                  <div className="w-[160px]">
                    <SearchSelect
                      value={donorSource}
                      options={fundingSourceOptions}
                      onChange={setDonorSource}
                      placeholder="All donors"
                      allowClear
                    />
                  </div>
                  <ExportMenu onExport={handleDonorExport} isExporting={isDonorExporting} label="Donor export" />
                </div>
              </>
            )}
            <Link to="/gantt" className="text-[#1A5632] hover:underline font-medium">Gantt Chart</Link>
            <Link to="/budget-base" className="text-[#1A5632] hover:underline font-medium">Budget Base</Link>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 border-t-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ minWidth: 900 }}>
              <thead>
                <tr className="bg-gray-100 text-[10px] text-gray-500 uppercase">
                  <th className="px-3 py-2 font-semibold w-[40px]"></th>
                  <th className="px-3 py-2 font-semibold w-[50px]">Code</th>
                  <th className="px-3 py-2 font-semibold">Activity</th>
                  <th className="px-3 py-2 font-semibold w-[80px]">Status</th>
                  <th className="px-3 py-2 font-semibold w-[120px]">Progress</th>
                  <th className="px-3 py-2 font-semibold w-[50px] text-center">Tasks</th>
                  <th className="px-3 py-2 font-semibold w-[80px] text-right">Budget</th>
                  <th className="px-3 py-2 font-semibold w-[120px]">Responsible</th>
                  <th className="px-3 py-2 font-semibold w-[80px] text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {outcomes
                  // Show areas that have matching activities OR carry indicator
                  // tiers at all — indicators aren't filtered by division/status/
                  // quarter, so tiers 2/3/4 must never disappear just because an
                  // unrelated filter left this area's activities empty (H-7).
                  .filter(o => grouped[o.id] || indicatorsByArea[o.id]?.length)
                  .map(outcome => {
                    const acts = grouped[outcome.id] || [];
                    const isOpen = expandedOutcomes[outcome.id] !== false; // default open
                    const outcomeBudget = acts.reduce((s, a) => s + Number(a.budget_total || 0), 0);
                    const outcomeProgress = acts.length ? Math.round(acts.reduce((s, a) => s + Number(a.percent_complete || 0), 0) / acts.length) : 0;

                    return (
                      <OutcomeRows
                        key={outcome.id}
                        outcome={outcome}
                        acts={acts}
                        indicators={indicatorsByArea[outcome.id] || []}
                        isOpen={isOpen}
                        outcomeBudget={outcomeBudget}
                        outcomeProgress={outcomeProgress}
                        expandedActivities={expandedActivities}
                        onToggleOutcome={toggleOutcome}
                        onToggleActivity={toggleActivity}
                        onUpdated={updateRow}
                      />
                    );
                  })}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="px-5 py-12 text-center text-[13px] text-gray-400">No activities match your filters</div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function OutcomeRows({ outcome, acts, indicators, isOpen, outcomeBudget, outcomeProgress, expandedActivities, onToggleOutcome, onToggleActivity, onUpdated }) {
  // Activities are rendered nested under their parent indicator (below). Any
  // activity whose parent indicator isn't in this area's indicator set falls
  // back to a direct list so nothing is ever dropped.
  const actIds = new Set(acts.map((a) => a.id));
  const nestedActIds = new Set(
    indicators.flatMap((ind) => (ind.activities || []).map((a) => a.id)),
  );
  const leftoverActs = [...acts]
    .filter((a) => !nestedActIds.has(a.id))
    .sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));

  return (
    <>
      {/* Outcome header */}
      <tr className="bg-[#1A5632]/[0.06] border-b border-[#1A5632]/10 cursor-pointer hover:bg-[#1A5632]/10" onClick={() => onToggleOutcome(outcome.id)}>
        <td className="px-3 py-2.5">
          {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-[#1A5632]" /> : <ChevronRight className="w-3.5 h-3.5 text-[#1A5632]" />}
        </td>
        <td className="px-3 py-2.5 text-[11px] font-mono font-bold text-[#1A5632]">{outcome.amert_index || outcome.code}</td>
        <td className="px-3 py-2.5" colSpan={2}>
          {(outcome.strategicPlan || outcome.impact) && (
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wide mb-0.5">
              {outcome.strategicPlan && (
                <span className="font-bold text-[#1A5632]">
                  {outcome.strategicPlan.sp_code} · {outcome.strategicPlan.short_name}
                </span>
              )}
              {outcome.impact && (
                <span className="normal-case text-gray-400 truncate max-w-[380px]" title={outcome.impact.title}>
                  {outcome.strategicPlan && <span className="text-gray-300 mx-1">/</span>}
                  Impact: {outcome.impact.title}
                </span>
              )}
            </div>
          )}
          <Link to={`/plan/node/${outcome.id}`} onClick={e => e.stopPropagation()} className="text-[12px] font-semibold text-gray-900 hover:text-[#1A5632] hover:underline">
            {outcome.name}
          </Link>
        </td>
        <td className="px-3 py-2.5"><ProgressBar pct={outcomeProgress} /></td>
        <td className="px-3 py-2.5 text-center text-[10px] text-gray-400">{acts.reduce((s, a) => s + (a.tasks?.length || 0), 0)}</td>
        <td className="px-3 py-2.5 text-right text-[12px] font-semibold text-[#1A5632]">{fmt(outcomeBudget)}</td>
        <td className="px-3 py-2.5" />
        <td className="px-3 py-2.5" />
      </tr>

      {/* Indicator tiers (T2/T3/T4) with their embedded activities */}
      {isOpen && indicators.map((ind) => (
        <IndicatorRow
          key={ind.id}
          ind={ind}
          actIds={actIds}
          expandedActivities={expandedActivities}
          onToggleActivity={onToggleActivity}
          onUpdated={onUpdated}
        />
      ))}

      {/* Activities not attached to a listed indicator (fallback) */}
      {isOpen && leftoverActs.map((act, idx) => (
        <ActivityRow
          key={act.id}
          act={act}
          idx={idx}
          tasks={act.tasks || []}
          isActOpen={expandedActivities[act.id]}
          status={act.status || STATUSES.NOT_STARTED}
          onToggleActivity={onToggleActivity}
          onUpdated={onUpdated}
        />
      ))}
    </>
  );
}

function IndicatorRow({ ind, actIds, expandedActivities, onToggleActivity, onUpdated }) {
  // Respect the page filters: only show activities that survived filtering.
  const acts = (ind.activities || [])
    .filter((a) => actIds.has(a.id))
    .sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
  const indent = ind.level * 14;
  return (
    <>
      <tr className="border-b border-gray-100 bg-[#1A5632]/[0.02]">
        <td className="px-3 py-1.5" />
        <td className="px-3 py-1.5 text-[10px] font-mono text-gray-500" style={{ paddingLeft: 12 + indent }}>{ind.code}</td>
        <td className="px-3 py-1.5" colSpan={6}>
          <div className="flex items-center gap-2" style={{ paddingLeft: indent }}>
            <NodeTypeBadge node={ind} />
            <Link to={`/plan/node/${ind.id}`} className="text-[11px] text-gray-700 hover:text-[#1A5632] hover:underline line-clamp-1">
              {ind.title}
            </Link>
          </div>
        </td>
        <td className="px-3 py-1.5 text-center">
          <RowActions id={ind.id} actions={planNodeActions(ind.id)} />
        </td>
      </tr>

      {acts.map((act, idx) => (
        <ActivityRow
          key={act.id}
          act={act}
          idx={idx}
          tasks={act.tasks || []}
          isActOpen={expandedActivities[act.id]}
          status={act.status || STATUSES.NOT_STARTED}
          onToggleActivity={onToggleActivity}
          onUpdated={onUpdated}
        />
      ))}
    </>
  );
}

// Single-source colours (H-7): broad activities are amber, specific
// activities/tasks are blue — read from the same config the indicator
// badges use so every surface distinguishes the hierarchy identically.
const BROAD_COLOR = NODE_TYPE_BADGES[NODE_TYPES.BROAD_ACTIVITY].color;
const SPECIFIC_COLOR = NODE_TYPE_BADGES[NODE_TYPES.SPECIFIC_ACTIVITY].color;

function ActivityRow({ act, idx, tasks, isActOpen, status, onToggleActivity, onUpdated }) {
  return (
    <>
      <tr className={`border-b border-gray-100 hover:bg-amber-50/40 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
        <td className="px-3 py-2">
          {tasks.length > 0 && (
            <button onClick={() => onToggleActivity(act.id)} className="p-0.5 hover:bg-gray-100">
              {isActOpen ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
            </button>
          )}
        </td>
        <td className="px-3 py-2 text-[11px] font-mono font-medium" style={{ color: BROAD_COLOR }}>{act.code}</td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            <NodeTypeBadge node={act} />
            <Link to={`/plan/node/${act.id}`} className="text-[12px] text-gray-800 hover:text-[#B45309] hover:underline leading-snug line-clamp-2">
              {act.title}
            </Link>
          </div>
        </td>
        <td className="px-3 py-2">
          <StatusDropdown id={act.id} currentStatus={status} onUpdated={onUpdated} />
        </td>
        <td className="px-3 py-2"><ProgressInput id={act.id} currentPct={act.percent_complete} onUpdated={onUpdated} /></td>
        <td className="px-3 py-2 text-[11px] text-gray-500 text-center font-medium">{tasks.length || ''}</td>
        <td className="px-3 py-2 text-[11px] text-gray-700 text-right font-medium">{fmt(act.budget_total)}</td>
        <td className="px-3 py-2 text-[10px] text-gray-500 truncate" style={{ maxWidth: 120 }}>{act.responsible_division || ''}</td>
        <td className="px-3 py-2 text-center">
          <RowActions id={act.id} actions={planNodeActions(act.id)} />
        </td>
      </tr>

      {/* Tasks (Specific Activities) — blue accent, distinct from the amber Broad Activity above */}
      {isActOpen && tasks.map((task, tIdx) => (
        <tr key={task.id} className={`border-b border-gray-50 hover:bg-blue-50/50 ${tIdx % 2 === 0 ? 'bg-blue-50/20' : 'bg-blue-50/40'}`}>
          <td className="px-3 py-1.5" />
          <td className="px-3 py-1.5 text-[10px] font-mono pl-6" style={{ color: SPECIFIC_COLOR }}>{task.code || ''}</td>
          <td className="px-3 py-1.5 pl-6">
            <div className="flex items-center gap-1.5">
              <NodeTypeBadge node={task} />
              <Link to={`/plan/node/${task.id}`} className="text-[11px] text-gray-600 hover:text-[#2563EB] hover:underline">{task.title}</Link>
            </div>
          </td>
          <td className="px-3 py-1.5">
            <StatusDropdown id={task.id} currentStatus={task.status || STATUSES.NOT_STARTED} onUpdated={onUpdated} />
          </td>
          <td className="px-3 py-1.5"><ProgressInput id={task.id} currentPct={task.percent_complete} onUpdated={onUpdated} /></td>
          <td className="px-3 py-1.5" />
          <td className="px-3 py-1.5" />
          <td className="px-3 py-1.5 text-[10px] text-gray-400 truncate" style={{ maxWidth: 120 }}>{task.responsible_division || ''}</td>
          <td className="px-3 py-1.5" />
        </tr>
      ))}
    </>
  );
}
