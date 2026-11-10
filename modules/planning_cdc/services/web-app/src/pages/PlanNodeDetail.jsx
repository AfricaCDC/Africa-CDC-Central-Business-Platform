/* eslint-disable complexity, no-restricted-syntax, no-unused-vars, max-lines -- pre-existing legacy, tracked. */
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import SearchSelect from '@/components/shared/SearchSelect';
import api from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { NODE_TYPES, ACTIVITY_TYPE_LABELS, ACTIVITY_RISK_CONFIG } from '@rbm/lib/enums';
import { fyToYear } from '@rbm/lib/fiscalYear';
import { usePlanningYear } from '@/contexts/PlanningYearContext';
import { Loader2, ChevronRight, ArrowLeft, Edit2, X, Save, Check } from 'lucide-react';
import { toast } from 'sonner';
import { fmtBudget, fmtValue } from '@rbm/lib/formatters';
import NodeTypeBadge from '@/components/shared/NodeTypeBadge';
import PillarChip from '@/components/shared/PillarChip';
import ActivityBudgetExecution from '@/components/budget-execution/ActivityBudgetExecution';
import ActivityPlanningSummary from './specific-activity/ActivityPlanningSummary';
import ApprovalTrail from './specific-activity/ApprovalTrail';
import BroadBudgetCodes from './specific-activity/BroadBudgetCodes';
import { parseCodeList } from '@/utils/codeList';
// Node-type colours + labels are single-sourced (backlog H-7) so broad /
// specific / indicator are distinguished identically across the app.
import { getNodeBadge as getNodeConfig } from '@/config/nodeTypeBadges';

const CHILD_LABELS = {
  IMPACT:            'Impact Indicators (T1)',
  IMPACT_INDICATOR:  'Outcomes',
  OUTCOME_AREA:      'Outcome Indicators (T2)',
  OUTCOME_INDICATOR: 'Activities',
  BROAD_ACTIVITY:    'Specific Activities',
  SPECIFIC_ACTIVITY: null,
};

/**
 * Generic detail page for any plan-node tier (impact, outcome area, indicator,
 * broad activity, specific activity). Renders parent context, child entities and
 * any reports linked to the node.
 *
 * @returns {JSX.Element}
 */
export default function PlanNodeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions();
  const { fyNum } = usePlanningYear();
  const canEdit = can('activities', 'update');
  const queryClient = useQueryClient();
  const [editingDivisions, setEditingDivisions] = useState(false);
  const [divForm, setDivForm] = useState({ responsible: '', contributing: [] });
  const [divSaving, setDivSaving] = useState(false);

  const { data: node, isLoading: nodeLoading, error: nodeError } = useQuery({
    queryKey: ['plan', 'node', id],
    queryFn: () => api.get(`/plan-nodes/${id}`).then(r => r.data),
    staleTime: 60_000,
  });

  const { data: divisions = [] } = useQuery({
    queryKey: ['admin', 'division-codes'],
    queryFn: () => api.get('/admin/division-codes').catch(() => ({ data: [] })).then(r => Array.isArray(r.data) ? r.data : []),
    staleTime: 300_000,
  });

  const { data: parent } = useQuery({
    queryKey: ['plan', 'node', String(node?.parent_id)],
    queryFn: () => api.get(`/plan-nodes/${node.parent_id}`).then(r => r.data),
    enabled: !!node?.parent_id,
    staleTime: 60_000,
  });

  const { data: activityReports = [] } = useQuery({
    queryKey: ['plan', 'activity-reports', id],
    queryFn: () => api.get('/activity-reports', { params: { plan_node_id: id } }).catch(() => ({ data: [] })).then(r => Array.isArray(r.data) ? r.data : []),
    enabled: !!node && node.node_type === NODE_TYPES.SPECIFIC_ACTIVITY,
    staleTime: 60_000,
  });

  const loading = nodeLoading;

  useEffect(() => { setEditingDivisions(false); }, [id]);

  if (loading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" />
      </div>
    </DashboardLayout>
  );

  if (nodeError || !node) return (
    <DashboardLayout>
      <div className="p-6 text-red-600 text-[11px]">{nodeError?.message || 'Node not found'}</div>
    </DashboardLayout>
  );

  const cfg = getNodeConfig(node);
  const children = node.children || [];
  const childLabel = CHILD_LABELS[node.node_type];
  const isIndicator = node.node_type === NODE_TYPES.IMPACT_INDICATOR || node.node_type === NODE_TYPES.OUTCOME_INDICATOR;
  const hasBudget = Number(node.budget_total_2026 || 0) > 0;
  const uomLabel = node.uom?.label || null;
  const isActivity = node.node_type === NODE_TYPES.BROAD_ACTIVITY || node.node_type === NODE_TYPES.SPECIFIC_ACTIVITY;
  const fmtNodeValue = (v) => fmtValue(v, node.uom);

  const crumbs = [{ label: 'Plan', href: '/impact' }];
  if (parent) crumbs.push({ label: (parent.code ? parent.code + ' — ' : '') + (parent.title || '').substring(0, 40), href: `/plan/node/${parent.id}` });
  crumbs.push({ label: node.code || cfg.label });

  const divOpts = divisions.map(d => ({ value: d.code, label: d.division_name, sub: d.code }));
  // T3/T4 indicators, broad activities AND specific activities — contributors
  // on a specific gate contributor activity-reporting (D-20260708-01).
  const showDivOwnership = (isIndicator && (node.tier_id === 3 || node.tier_id === 4)) || isActivity;

  const startEditDivisions = () => {
    const mainCode = node.division?.code || node.responsible_division_code || '';
    let cd = node.contributing_divisions;
    if (typeof cd === 'string') { try { cd = JSON.parse(cd); } catch { cd = []; } }
    if (!Array.isArray(cd)) cd = [];
    // Also merge contributors from linked_specifics (for indicators)
    const specs = node.linked_specifics || [];
    specs.forEach(s => {
      const c = s.division?.code || s.responsible_division_code;
      if (c && c !== mainCode && !cd.includes(c)) cd.push(c);
    });
    // Also merge from children specifics (for broad activities)
    (children || []).forEach(s => {
      const c = s.division?.code || s.responsible_division_code;
      if (c && c !== mainCode && !cd.includes(c)) cd.push(c);
    });
    setDivForm({ responsible: mainCode, contributing: cd });
    setEditingDivisions(true);
  };

  const saveDivisions = async () => {
    setDivSaving(true);
    try {
      const endpoint = node.node_type === NODE_TYPES.BROAD_ACTIVITY
        ? `/plan-nodes/broad-activity/${node.id}`
        : node.node_type === NODE_TYPES.SPECIFIC_ACTIVITY
          ? `/plan-nodes/specific-activity/${node.id}`
          : `/plan-nodes/indicator/${node.id}`;
      const method = isActivity ? 'patch' : 'put';
      const payload = {
        responsible_division_code: divForm.responsible || null,
        contributing_divisions: divForm.contributing,
      };
      if (method === 'put') {
        payload.accountable_division_id = divForm.responsible || null;
        payload.indicator_name = node.title;
        payload.indicator_code = node.code;
        payload.tier_id = node.tier_id;
        payload.baseline_value = node.baseline_numeric;
        payload.target_fy1 = node.target_y1_numeric;
      }
      await api[method](endpoint, payload);
      queryClient.invalidateQueries({ queryKey: ['plan', 'node', id] });
      setEditingDivisions(false);
    } catch (err) {
      toast.error('Failed to save divisions');
    } finally {
      setDivSaving(false);
    }
  };

  return (
    <DashboardLayout breadcrumbs={crumbs}>
      <div className="space-y-0">

        {/* Hero Header */}
        <div className={`${cfg.bg} text-white`}>
          <div className="px-6 py-5">
            {/* Back button */}
            {parent && (
              <button
                onClick={() => navigate(`/plan/node/${parent.id}`)}
                className="flex items-center gap-1 text-[10px] text-white/60 hover:text-white mb-3 transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
                Back to {getNodeConfig(parent).label || 'parent'}
              </button>
            )}
            {!parent && node.node_type !== NODE_TYPES.OUTCOME && (
              <button
                onClick={() => navigate('/impact')}
                className="flex items-center gap-1 text-[10px] text-white/60 hover:text-white mb-3 transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
                Back to Impact
              </button>
            )}

            <div className="flex items-center gap-3 mb-2">
              {cfg.tierLabel && (
                <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">
                  {cfg.tierLabel}
                </span>
              )}
              <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">
                {cfg.label}
              </span>
              {node.code && <span className="text-[11px] font-mono text-white/70">#{node.code}</span>}
              {node.pillar && <PillarChip name={node.pillar.name} className="!bg-white/15 !text-white !border-white/30" />}
            </div>
            <h1 className="text-[16px] font-semibold leading-snug max-w-4xl">{node.title}</h1>
          </div>

          {/* Stats bar */}
          <div className="border-t border-white/15 px-6 py-2.5 flex items-center gap-6 text-[11px] text-white/70">
            {isIndicator && node.baseline_numeric !== null && (
              <span>Baseline: <strong className="text-white">{fmtNodeValue(node.baseline_numeric)}</strong></span>
            )}
            {isIndicator && [1, 2, 3, 4, 5].map((n) => {
              const v = node[`target_y${n}_numeric`];
              if (v === null || v === undefined) return null;
              const year = fyToYear(n);
              const active = n === fyNum;
              return (
                <span key={`fy${n}`}>
                  FY{n} · {year}{active ? ' (current)' : ''}:{' '}
                  <strong className={active ? 'text-[#B4A269]' : 'text-white'}>{fmtNodeValue(v)}</strong>
                </span>
              );
            })}
            {uomLabel && <span>Unit: <strong className="text-white">{uomLabel}</strong></span>}
            {node.division && (
              <span>Division: <strong className="text-white">{node.division.name}</strong></span>
            )}
            {node.status && (
              <span>Status: <strong className="text-white">{node.status}</strong></span>
            )}
            {children.length > 0 && (
              <span><strong className="text-white">{children.length}</strong> {childLabel || 'children'}</span>
            )}
            {hasBudget && (
              <span className="ml-auto text-white font-semibold">
                {fmtBudget(node.budget_total_2026)} <span className="text-white/60 font-normal">Total 2026</span>
              </span>
            )}
          </div>
        </div>

        {/* Responsible Division — only for node types that DON'T show Division Ownership */}
        {node.division && !showDivOwnership && (
          <div className="bg-white border border-gray-200 border-t-0 px-6 py-3 flex items-center gap-4">
            <span className="text-[9px] uppercase text-gray-400 font-semibold">Responsible Division</span>
            <span className="inline-flex items-center gap-2 text-[11px] font-medium text-gray-800">
              <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold bg-[#1A5632] text-white">{node.division.code}</span>
              {node.division.name}
            </span>
            {node.division.directorate && (
              <span className="text-[9px] text-gray-400">({node.division.directorate})</span>
            )}
            {node.focal_user?.name && (
              <>
                <span className="text-[9px] uppercase text-gray-400 font-semibold ml-4">Focal Person</span>
                <span className="text-[11px] font-medium text-gray-800">{node.focal_user.name}</span>
              </>
            )}
          </div>
        )}

        {/* Division Ownership: MAIN + CONTRIBUTORS (T3/T4 indicators + BROAD_ACTIVITY) */}
        {showDivOwnership && (
          <div className="bg-white border border-gray-200 border-t-0 px-6 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] uppercase text-gray-400 font-semibold">Division Ownership</p>
              {canEdit && !editingDivisions && (
                <button onClick={startEditDivisions} className="flex items-center gap-1 text-[9px] text-[#14442A] hover:underline font-semibold">
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
              )}
            </div>

            {!editingDivisions ? (
              <div className="flex flex-wrap items-center gap-2">
                {node.division ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#14442A] text-white text-[9px] font-semibold">
                    MAIN: {node.division.name}
                    <span className="text-white/60 font-mono ml-0.5">({node.division.code})</span>
                  </span>
                ) : node.responsible_division_code ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#14442A] text-white text-[9px] font-semibold">
                    MAIN: {node.responsible_division_code}
                  </span>
                ) : (
                  <span className="text-[9px] text-gray-400 italic">No main division assigned</span>
                )}
                {(() => {
                  const mainCode = node.division?.code || node.responsible_division_code;
                  const contribDivs = {};
                  let cd = node.contributing_divisions;
                  if (typeof cd === 'string') { try { cd = JSON.parse(cd); } catch { cd = []; } }
                  if (Array.isArray(cd)) {
                    cd.forEach(code => { if (code !== mainCode) contribDivs[code] = code; });
                  }
                  const specs = node.linked_specifics || [];
                  specs.forEach(s => {
                    const code = s.division?.code || s.responsible_division_code;
                    if (code && code !== mainCode) contribDivs[code] = s.division?.name || code;
                  });
                  const kids = children || [];
                  kids.forEach(s => {
                    const code = s.division?.code || s.responsible_division_code;
                    if (code && code !== mainCode) contribDivs[code] = s.division?.name || code;
                  });
                  const entries = Object.entries(contribDivs);
                  if (entries.length === 0) return null;
                  return entries.map(([code, name]) => (
                    <span key={code} className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 border border-orange-200 text-[9px] font-semibold text-[#B45309]">
                      CONTRIB: {name}
                      <span className="text-orange-400 font-mono ml-0.5">({code})</span>
                    </span>
                  ));
                })()}
              </div>
            ) : (
              <div className="space-y-3 border border-gray-200 bg-gray-50 p-3">
                <div>
                  <label className="text-[9px] font-semibold text-gray-500 uppercase block mb-1">Responsible Division (MAIN)</label>
                  <SearchSelect
                    value={divForm.responsible || null}
                    onChange={v => setDivForm(p => ({ ...p, responsible: v || '' }))}
                    options={divOpts}
                    placeholder="— Select —"
                    allowClear
                  />
                </div>
                <div>
                  <label className="text-[9px] font-semibold text-gray-500 uppercase block mb-1">Contributing Divisions</label>
                  <SearchSelect
                    value={null}
                    onChange={v => {
                      if (v && !divForm.contributing.includes(v) && v !== divForm.responsible) {
                        setDivForm(p => ({ ...p, contributing: [...p.contributing, v] }));
                      }
                    }}
                    options={divOpts.filter(d => d.value !== divForm.responsible && !divForm.contributing.includes(d.value))}
                    placeholder="— Add contributing division —"
                  />
                  {divForm.contributing.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {divForm.contributing.map(code => {
                        const d = divOpts.find(o => o.value === code);
                        return (
                          <span key={code} className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 border border-orange-200 text-[9px] font-semibold text-[#B45309]">
                            {d ? d.label : code} ({code})
                            <button onClick={() => setDivForm(p => ({ ...p, contributing: p.contributing.filter(c => c !== code) }))}
                              className="text-orange-400 hover:text-orange-600">
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={saveDivisions} disabled={divSaving}
                    className="flex items-center gap-1 text-[10px] px-3 py-1.5 bg-[#14442A] text-white font-semibold hover:bg-[#0F3D24] disabled:opacity-50">
                    {divSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                  </button>
                  <button onClick={() => setEditingDivisions(false)} disabled={divSaving}
                    className="text-[10px] px-3 py-1.5 border border-gray-300 text-gray-600 hover:bg-gray-100">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Activity Info (dates, division, status) */}
        {isActivity && (
          <div className="bg-white border border-gray-200 border-t-0 px-6 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Division shown here only for SPECIFIC_ACTIVITY — BROAD_ACTIVITY has Division Ownership section */}
              {node.division && !showDivOwnership && (
                <div>
                  <p className="text-[9px] uppercase text-gray-400 font-semibold mb-1">Responsible Division</p>
                  <div className="flex items-center gap-2">
                    <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold bg-[#1A5632] text-white">{node.division.code}</span>
                    <span className="text-[11px] font-medium text-gray-800">{node.division.name}</span>
                  </div>
                  {node.division.directorate && (
                    <p className="text-[9px] text-gray-400 mt-0.5">{node.division.directorate}</p>
                  )}
                </div>
              )}
              <div>
                <p className="text-[9px] uppercase text-gray-400 font-semibold mb-1">Status</p>
                <span className="inline-block px-2 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                  {node.status || 'APPROVED'}
                </span>
              </div>
              <div>
                <p className="text-[9px] uppercase text-gray-400 font-semibold mb-1">Fiscal Year</p>
                <p className="text-[11px] font-medium text-gray-800">{node.fiscal_year}</p>
              </div>
            </div>
          </div>
        )}

        {/* Indicator Details (T2/T3/T4) */}
        {node.node_type === 'OUTCOME_INDICATOR' && (
          <div className="bg-white border border-gray-200 border-t-0 px-6 py-4 space-y-4">
            <p className="text-[9px] uppercase text-gray-400 font-semibold mb-2">Indicator Details</p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <DetailField label="Unit of Measure" value={node.uom?.label || '—'} />
              <DetailField label="Baseline" value={node.baseline_numeric != null ? String(node.baseline_numeric) : '—'} />
              <DetailField label="Definition" value={node.description || '—'} />
            </div>

            <div>
              <p className="text-[9px] uppercase text-gray-400 font-semibold mb-2">
                Annual Targets <span className="text-gray-300 font-normal">(FY1 = 2023 → FY5 = 2027)</span>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {[1, 2, 3, 4, 5].map((n) => {
                  const year = fyToYear(n);
                  const active = n === fyNum;
                  const v = node[`target_y${n}_numeric`];
                  return (
                    <div key={`fy${n}`} className={`border p-2 ${active ? 'border-[#1A5632] bg-[#1A5632]/5' : 'border-gray-100'}`}>
                      <p className={`text-[9px] ${active ? 'text-[#1A5632] font-bold' : 'text-gray-400'}`}>
                        FY{n} · {year}{active ? ' (current)' : ''}
                      </p>
                      <p className={`text-[12px] font-semibold ${active ? 'text-[#1A5632]' : 'text-gray-700'}`}>{v != null ? String(v) : '—'}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-[9px] uppercase text-gray-400 font-semibold mb-2">
                Quarterly Targets <span className="text-gray-300 font-normal">(for FY{fyNum} · {fyToYear(fyNum)})</span>
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {['q1_target_numeric', 'q2_target_numeric', 'q3_target_numeric', 'q4_target_numeric'].map((k, i) => (
                  <div key={k} className="border border-gray-100 p-2">
                    <p className="text-[9px] text-gray-400">Q{i + 1}</p>
                    <p className="text-[12px] font-semibold text-[#1A5632]">{node[k] != null ? String(node[k]) : '—'}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailField label="Indicator Code" value={node.indicator_code || node.code || '—'} />
            </div>

            {/* Reporting Periods — only T3/T4 OUTCOME_INDICATOR rows are
                ever expected in the quarterly queue. T1 (impact) and T2
                (intermediate outcome) indicators don't report quarterly. */}
            {node.node_type === 'OUTCOME_INDICATOR' && (node.tier_id === 3 || node.tier_id === 4) && (() => {
              const periods = Array.isArray(node.active_periods) ? node.active_periods : [];
              const cy = fyNum;
              const hasPeriod = (fy, q) => periods.some((p) => p.fy === fy && p.q === q);
              // Prefer the admin-controlled open reporting period. If none
              // is open we fall back to the wall-clock quarter (preview).
              const openQ = node.open_reporting_period?.quarter_num;
              const fallbackQ = Math.floor(new Date().getMonth() / 3) + 1;
              const currentQuarterNum = openQ || fallbackQ;
              const quarterOpen = !!openQ;
              const dueThisQuarter = hasPeriod(cy, currentQuarterNum);
              return (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[9px] uppercase text-gray-400 font-semibold">
                      Reporting Periods <span className="text-gray-300 font-normal">(planned submissions)</span>
                    </p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 ${!quarterOpen ? 'bg-amber-50 text-amber-700' : dueThisQuarter ? 'bg-[#1A5632]/10 text-[#1A5632]' : 'bg-gray-100 text-gray-500'}`}>
                      {!quarterOpen
                        ? 'No reporting quarter currently open'
                        : dueThisQuarter
                          ? `Required this quarter · FY${cy} Q${currentQuarterNum} (open)`
                          : `Not expected · FY${cy} Q${currentQuarterNum} is the open quarter`}
                    </span>
                  </div>
                  <div className="border border-gray-200 overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-[9px] uppercase text-gray-500">
                          <th className="px-3 py-1.5 text-left font-medium w-[180px]">Fiscal year</th>
                          {[1, 2, 3, 4].map((q) => (
                            <th key={q} className="px-3 py-1.5 text-center font-medium">Q{q}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {[1, 2, 3, 4, 5].map((fy) => {
                          const isCurrentRow = fy === cy;
                          return (
                            <tr key={fy} className={isCurrentRow ? 'bg-[#1A5632]/[0.03]' : ''}>
                              <td className={`px-3 py-1.5 text-[11px] font-semibold ${isCurrentRow ? 'text-[#1A5632]' : 'text-gray-700'}`}>
                                FY{fy} · {fyToYear(fy)}
                                {isCurrentRow && <span className="ml-1.5 text-[8px] bg-[#1A5632] text-white px-1 py-0.5">CURRENT</span>}
                              </td>
                              {[1, 2, 3, 4].map((q) => {
                                const active = hasPeriod(fy, q);
                                const highlight = active && isCurrentRow && q === currentQuarterNum;
                                return (
                                  <td key={q} className="px-3 py-1.5 text-center">
                                    <span className={`inline-block w-5 h-5 leading-5 text-[11px] ${active ? (highlight ? 'bg-[#1A5632] text-white rounded-full font-bold' : 'text-[#1A5632] font-bold') : 'text-gray-300'}`}>
                                      {active ? '✓' : '·'}
                                    </span>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {periods.length === 0 && (
                    <p className="text-[10px] text-amber-700 mt-1 italic">
                      No reporting periods configured — this indicator will not appear in any quarterly report queue.
                      Edit the indicator to set its reporting schedule.
                    </p>
                  )}
                </div>
              );
            })()}

            {node.contributing_divisions && (
              <div>
                <p className="text-[9px] uppercase text-gray-400 font-semibold mb-1">Contributing Divisions</p>
                <div className="flex flex-wrap gap-1">
                  {(typeof node.contributing_divisions === 'string' ? JSON.parse(node.contributing_divisions) : node.contributing_divisions).map(c => (
                    <span key={c} className="inline-block px-1.5 py-0.5 text-[9px] font-bold bg-orange-50 border border-orange-200 text-[#B45309]">{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Extra fields for SPECIFIC_ACTIVITY */}
        {node.node_type === NODE_TYPES.SPECIFIC_ACTIVITY && (
          <div className="bg-white border border-gray-200 border-t-0 px-6 py-4">
            <p className="text-[9px] uppercase text-gray-400 font-semibold mb-3">Activity Details</p>

            <div className="mb-3">
              <p className="text-[9px] uppercase text-gray-400 font-semibold mb-1">Description</p>
              <p className="text-[11px] text-gray-800">{node.description || '—'}</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <DetailField label="Activity and Mission Type" value={ACTIVITY_TYPE_LABELS[node.activity_type] || node.activity_type || null} />
              <DetailField label="Implementation at RCC" value={node.implementation_at_rcc != null ? (node.implementation_at_rcc ? 'Yes' : 'No') : null} />
              <DetailField label="Risk Level" value={ACTIVITY_RISK_CONFIG[node.risk_level]?.label || null} />
              <DetailField label="Operational Activity" value={node.is_operational != null ? (node.is_operational ? 'Yes' : 'No') : null} />
              <DetailField label="Secondary Divisions" value={parseCodeList(node.secondary_division_codes).join(', ') || null} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
              <DetailField label="Start Date" value={node.start_date ? new Date(node.start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null} />
              <DetailField label="End Date" value={node.end_date ? new Date(node.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null} />
              <DetailField label="Location" value={node.location} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
              <DetailField label="Budgeting Arrangement" value={node.budgeting_arrangement} />
              <DetailField label="Primary Funding Source" value={node.primary_funding_source} />
              <DetailField label="Other Funding Source" value={node.other_funding_source} />
              <DetailField label="Grant Name" value={node.grant_name} />
            </div>

            <div className="mt-3">
              <p className="text-[9px] uppercase text-gray-400 font-semibold mb-1">Budget code (from the broad activity)</p>
              <BroadBudgetCodes codes={node.parent_broad?.budget_codes} />
            </div>

            <div className="mt-3">
              <p className="text-[9px] uppercase text-gray-400 font-semibold mb-2">Budget</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                <div className="border border-[#D97706] bg-orange-50 p-2">
                  <p className="text-[9px] text-gray-400">Total Cost</p>
                  <p className="text-[12px] font-semibold text-[#D97706]">${Number(node.budget_main || 0).toLocaleString()}</p>
                </div>
                  {['q1_budget', 'q2_budget', 'q3_budget', 'q4_budget'].map((k, i) => (
                    <div key={k} className="border border-gray-100 p-2">
                      <p className="text-[9px] text-gray-400">Q{i + 1}</p>
                      <p className="text-[11px] font-medium text-gray-700">${Number(node[k] || 0).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
          </div>
        )}

        {node.node_type === NODE_TYPES.SPECIFIC_ACTIVITY && <ActivityPlanningSummary activityId={node.id} />}
        {node.node_type === NODE_TYPES.SPECIFIC_ACTIVITY && <ApprovalTrail activityId={node.id} />}

        {/* Hierarchy Context — for SPECIFIC_ACTIVITY: parent broad + linked indicator. For BROAD_ACTIVITY: parent indicator + outcome area */}
        {(node.parent_broad || node.linked_indicator || node.parent_indicator || node.parent_outcome_area) && (
          <div className="bg-white border border-gray-200 border-t-0 px-6 py-4">
            <p className="text-[9px] uppercase text-gray-400 font-semibold mb-3">Hierarchy & Linked</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Parent Outcome Area (for broads) */}
              {node.parent_outcome_area && (
                <div className="border border-[#1A5632]/30 bg-[#1A5632]/5 p-3">
                  <p className="text-[8px] uppercase tracking-wider text-[#1A5632] font-bold mb-1">↑ Outcome Area</p>
                  <button onClick={() => navigate(`/plan/node/${node.parent_outcome_area.id}`)} className="text-[11px] font-medium text-gray-900 hover:underline text-left block w-full break-words">
                    <span className="inline-block px-1 py-0.5 text-[9px] font-bold bg-[#1A5632] text-white mr-1.5">{node.parent_outcome_area.code}</span>
                    {node.parent_outcome_area.title}
                  </button>
                </div>
              )}

              {/* Parent Indicator (for broads) */}
              {node.parent_indicator && (
                <div className="border border-purple-300 p-3">
                  <p className="text-[8px] uppercase tracking-wider text-purple-700 font-bold mb-1">↑ Outcome Indicator</p>
                  <button onClick={() => navigate(`/plan/node/${node.parent_indicator.id}`)} className="text-[11px] font-medium text-gray-900 hover:underline text-left block w-full break-words">
                    <span className={`inline-block px-1 py-0.5 text-[9px] font-bold text-white mr-1 ${node.parent_indicator.tier_id === 4 ? 'bg-[#D97706]' : node.parent_indicator.tier_id === 3 ? 'bg-[#14442A]' : 'bg-[#1A5632]'}`}>T{node.parent_indicator.tier_id}</span>
                    <span className="font-mono font-bold text-purple-700 mr-1">{node.parent_indicator.code}</span>
                    {node.parent_indicator.title}
                  </button>
                  {(node.parent_indicator.baseline_numeric !== null || node.parent_indicator.target_y1_numeric !== null) && (
                    <div className="text-[9px] text-gray-500 mt-1">
                      Baseline: <strong>{node.parent_indicator.baseline_numeric ?? '—'}</strong> · Y1 Target: <strong className="text-[#1A5632]">{node.parent_indicator.target_y1_numeric ?? '—'}</strong>
                      {node.parent_indicator.uom?.label && <span> ({node.parent_indicator.uom.label})</span>}
                    </div>
                  )}
                </div>
              )}

              {/* Parent Broad (for specifics) */}
              {node.parent_broad && (
                <div className="border border-[#B45309]/30 bg-[#B45309]/5 p-3">
                  <p className="text-[8px] uppercase tracking-wider text-[#B45309] font-bold mb-1">↑ Parent Broad Activity</p>
                  <button onClick={() => navigate(`/plan/node/${node.parent_broad.id}`)} className="text-[11px] font-medium text-gray-900 hover:underline text-left block w-full break-words">
                    <span className="inline-block px-1 py-0.5 text-[9px] font-bold bg-[#B45309] text-white mr-1.5">{node.parent_broad.code}</span>
                    {node.parent_broad.title}
                  </button>
                </div>
              )}

              {/* Linked Indicator (for specifics) */}
              {node.linked_indicator && (
                <div className="border border-purple-300 p-3">
                  <p className="text-[8px] uppercase tracking-wider text-purple-700 font-bold mb-1">→ Contributes to Indicator</p>
                  <button onClick={() => navigate(`/plan/node/${node.linked_indicator.id}`)} className="text-[11px] font-medium text-gray-900 hover:underline text-left block w-full break-words">
                    <span className={`inline-block px-1 py-0.5 text-[9px] font-bold text-white mr-1 ${node.linked_indicator.tier_id === 4 ? 'bg-[#D97706]' : 'bg-[#14442A]'}`}>T{node.linked_indicator.tier_id}</span>
                    <span className="font-mono font-bold text-purple-700 mr-1">{node.linked_indicator.code}</span>
                    {node.linked_indicator.title}
                  </button>
                  {(node.linked_indicator.baseline_numeric !== null || node.linked_indicator.target_y1_numeric !== null) && (
                    <div className="text-[9px] text-gray-500 mt-1">
                      Baseline: <strong>{node.linked_indicator.baseline_numeric ?? '—'}</strong> · Y1 Target: <strong className="text-[#1A5632]">{node.linked_indicator.target_y1_numeric ?? '—'}</strong>
                      {node.linked_indicator.uom?.label && <span> ({node.linked_indicator.uom.label})</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Budget Breakdown */}
        {hasBudget && (
          <div className="bg-white border border-gray-200 border-t-0 px-6 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
              <BudgetCell label="Main Budget" value={node.budget_main} />
              <BudgetCell label="Pass Through" value={node.budget_pass_through} />
              <BudgetCell label="Tech. Assistance" value={node.budget_tech_assistance} />
              <BudgetCell label="Special Projects" value={node.budget_special_projects} />
              <BudgetCell label="Total 2026" value={node.budget_total_2026} highlight />
              <BudgetCell label="Budget 2027" value={node.budget_2027} muted />
              <BudgetCell label="Budget 2028" value={node.budget_2028} muted />
            </div>
          </div>
        )}

        {/* Budget Codes (broad activities only) */}
        {(node.budget_codes || []).length > 0 && (
          <div className="bg-white border border-gray-200 border-t-0">
            <div className="px-5 py-3 border-b border-gray-200 bg-[#1A5632]/10 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold text-[#1A5632] uppercase tracking-wider">
                Budget Codes ({node.budget_codes.length})
              </h2>
              <span className="text-[11px] font-semibold text-[#1A5632]">
                {fmtBudget(node.budget_codes.reduce((s, b) => s + Number(b.amount || 0) + Number(b.technical_assistance || 0), 0))} total
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] text-gray-400 border-b border-gray-200 bg-gray-50">
                    <th className="px-3 py-2 font-normal w-[120px]">Budget Code</th>
                    <th className="px-3 py-2 font-normal w-[80px]">Fund Code</th>
                    <th className="px-3 py-2 font-normal min-w-[180px]">Fund Description</th>
                    <th className="px-3 py-2 font-normal w-[80px]">Func. Area</th>
                    <th className="px-3 py-2 font-normal w-[100px] text-right">Main Budget</th>
                    <th className="px-3 py-2 font-normal w-[100px] text-right">Tech. Assist.</th>
                    <th className="px-3 py-2 font-normal w-[100px] text-right">Total IPs</th>
                    <th className="px-3 py-2 font-normal w-[80px] text-right">Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {node.budget_codes.map((b, i) => (
                    <tr key={b.id} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                      <td className="px-3 py-2 text-[10px] font-mono font-bold text-[#1A5632]">{b.budget_code || '—'}</td>
                      <td className="px-3 py-2 text-[10px] text-gray-600">{b.fund_code || '—'}</td>
                      <td className="px-3 py-2 text-[10px] text-gray-800">{b.fund_description || '—'}</td>
                      <td className="px-3 py-2 text-[9px] text-gray-500">{b.functional_area || '—'}</td>
                      <td className="px-3 py-2 text-[10px] font-semibold text-gray-800 text-right">{fmtBudget(b.main_budget)}</td>
                      <td className="px-3 py-2 text-[10px] font-semibold text-[#9F2241] text-right">{fmtBudget(b.technical_assistance)}</td>
                      <td className="px-3 py-2 text-[10px] font-semibold text-[#1A5632] text-right">{fmtBudget(b.total_ips)}</td>
                      <td className="px-3 py-2 text-[10px] text-gray-500 text-right">{Number(b.gap || 0) > 0 ? fmtBudget(b.gap) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-bold border-t-2 border-gray-300">
                    <td colSpan={4} className="px-3 py-2 text-[10px] text-gray-700">TOTAL</td>
                    <td className="px-3 py-2 text-[10px] text-right text-[#1A5632]">{fmtBudget(node.budget_codes.reduce((s, b) => s + Number(b.main_budget || 0), 0))}</td>
                    <td className="px-3 py-2 text-[10px] text-right text-[#9F2241]">{fmtBudget(node.budget_codes.reduce((s, b) => s + Number(b.technical_assistance || 0), 0))}</td>
                    <td className="px-3 py-2 text-[10px] text-right text-[#1A5632]">{fmtBudget(node.budget_codes.reduce((s, b) => s + Number(b.total_ips || 0), 0))}</td>
                    <td className="px-3 py-2 text-[10px] text-right text-gray-500">{fmtBudget(node.budget_codes.reduce((s, b) => s + Number(b.gap || 0), 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Targets Detail (indicators only) */}
        {isIndicator && (
          <div className="bg-white border border-gray-200 border-t-0 px-6 py-4">
            <p className="text-[9px] uppercase text-gray-400 font-semibold mb-3">Targets</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
              <TargetCell label="Baseline" value={fmtNodeValue(node.baseline_numeric)} />
              {[1, 2, 3, 4, 5].map((n) => (
                <TargetCell
                  key={`fy${n}`}
                  label={`FY${n} · ${fyToYear(n)}${n === fyNum ? ' (current)' : ''}`}
                  value={fmtNodeValue(node[`target_y${n}_numeric`])}
                  active={n === fyNum}
                />
              ))}
              <TargetCell label="Unit of Measure" value={uomLabel} />
            </div>
          </div>
        )}

        {node.node_type === NODE_TYPES.BROAD_ACTIVITY && <ActivityBudgetExecution activityId={node.id} fiscalYear={node.fiscal_year} />}

        {/* Children List — split by tier for OUTCOME_AREA, single section otherwise */}
        {(() => {
          if (children.length === 0) return null;

          // For OUTCOME_AREA, split children by tier (T2, T3, T4)
          if (node.node_type === NODE_TYPES.OUTCOME_AREA) {
            const t2 = children.filter(c => c.tier_id === 2);
            const t3 = children.filter(c => c.tier_id === 3);
            const t4 = children.filter(c => c.tier_id === 4);
            return (
              <>
                {t2.length > 0 && <ChildrenSection title={`Outcome Indicators (T2) — ${t2.length}`} items={t2} navigate={navigate} accent="#1A5632" />}
                {t3.length > 0 && <ChildrenSection title={`Short-term Outcome Indicators (T3) — ${t3.length}`} items={t3} navigate={navigate} accent="#14442A" />}
                {t4.length > 0 && <ChildrenSection title={`Output Indicators (T4) — ${t4.length}`} items={t4} navigate={navigate} accent="#D97706" />}
              </>
            );
          }

          // Default: single section
          return <ChildrenSection title={`${childLabel || 'Children'} (${children.length})`} items={children} navigate={navigate} />;
        })()}

        {/* Linked Broad Activities (for T3/T4 indicators) */}
        {(node.linked_broads || []).length > 0 && (
          <div className="bg-white border border-gray-200 border-t-0">
            <div className="px-5 py-3 border-b border-gray-200 bg-[#B45309]/10">
              <h2 className="text-[11px] font-semibold text-[#B45309] uppercase tracking-wider">
                Linked Broad Activities ({node.linked_broads.length})
              </h2>
            </div>
            <table className="w-full text-left">
              <tbody>
                {node.linked_broads.map((b, idx) => (
                  <tr key={b.id} onClick={() => navigate(`/plan/node/${b.id}`)} className={`border-b border-gray-100 cursor-pointer hover:bg-orange-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="px-3 py-2.5 w-[110px] text-[10px] font-mono font-bold text-[#B45309]">{b.code}</td>
                    <td className="px-3 py-2.5 text-[11px] text-gray-900 font-medium">{b.title}</td>
                    <td className="px-3 py-2.5 w-[140px]">
                      {b.division && (
                        <span className="inline-block text-[9px] font-semibold px-1.5 py-0.5 bg-gray-100 text-gray-600 border border-gray-200 truncate max-w-[130px]" title={b.division.name}>
                          {b.division.name}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-semibold text-[#B45309] text-right w-[110px]">{fmtBudget(b.budget_total_2026)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Linked Specific Activities (for T3/T4 indicators) */}
        {(node.linked_specifics || []).length > 0 && (
          <div className="bg-white border border-gray-200 border-t-0">
            <div className="px-5 py-3 border-b border-gray-200 bg-[#D97706]/10 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold text-[#D97706] uppercase tracking-wider">
                Specific Activities Contributing ({node.linked_specifics.length})
              </h2>
              <span className="text-[11px] font-semibold text-[#D97706]">
                {fmtBudget(node.linked_specifics.reduce((s, a) => s + Number(a.budget_total_2026 || 0), 0))} total
              </span>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="text-[9px] text-gray-400 border-b border-gray-200">
                    <th className="px-3 py-2 font-normal w-[120px]">Code</th>
                    <th className="px-3 py-2 font-normal">Specific Activity</th>
                    <th className="px-3 py-2 font-normal w-[140px]">Division</th>
                    <th className="px-3 py-2 font-normal w-[100px] text-right">Budget</th>
                  </tr>
                </thead>
                <tbody>
                  {node.linked_specifics.map((s, idx) => (
                    <tr key={s.id} onClick={() => navigate(`/plan/node/${s.id}`)} className={`border-b border-gray-100 cursor-pointer hover:bg-orange-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                      <td className="px-3 py-2 text-[9px] font-mono font-bold text-[#D97706]">{s.code}</td>
                      <td className="px-3 py-2 text-[10px] text-gray-800">{s.title}</td>
                      <td className="px-3 py-2">
                        {s.division && (
                          <span className="inline-block text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-600 border border-gray-200 truncate max-w-[130px]" title={s.division.name}>
                            {s.division.name}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[10px] font-semibold text-[#D97706] text-right">{fmtBudget(s.budget_total_2026)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {children.length === 0 && (node.linked_broads || []).length === 0 && (node.linked_specifics || []).length === 0 && childLabel && (
          <div className="bg-white border border-gray-200 border-t-0 px-6 py-10 text-center">
            <p className="text-[11px] text-gray-400">No {childLabel?.toLowerCase()} linked yet.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function ChildrenSection({ title, items, navigate, accent }) {
  const fmtItemValue = (val, uom) => {
    if (val === null || val === undefined) return '—';
    const n = Number(val);
    if (uom?.display_format) return uom.display_format.replace('{value}', n % 1 === 0 ? n : n.toFixed(1));
    return String(val);
  };
  const accentColor = accent || '#1A5632';
  const showBaseline = items.some(c => c.baseline_numeric !== null && c.baseline_numeric !== undefined);
  const showTarget = items.some(c => c.target_y1_numeric !== null && c.target_y1_numeric !== undefined);
  const showDivision = items.some(c => c.division);

  return (
    <div className="bg-white border border-gray-200 border-t-0">
      <div className="px-5 py-3 border-b border-gray-200" style={{ backgroundColor: accentColor + '10' }}>
        <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: accentColor }}>{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] text-gray-400 border-b border-gray-200">
              <th className="px-3 py-2 font-normal w-[110px]">Code</th>
              <th className="px-3 py-2 font-normal w-[80px]">Type</th>
              <th className="px-3 py-2 font-normal min-w-[250px]">Description</th>
              {showBaseline && <th className="px-3 py-2 font-normal w-[80px] text-center">Baseline</th>}
              {showTarget && <th className="px-3 py-2 font-normal w-[80px] text-center">Y1 Target</th>}
              {showDivision && <th className="px-3 py-2 font-normal w-[120px]">Division</th>}
              <th className="px-3 py-2 font-normal w-[100px] text-right">Total 2026</th>
              <th className="px-3 py-2 font-normal w-[30px]"></th>
            </tr>
          </thead>
          <tbody>
            {items.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true })).map((child, idx) => (
              <tr key={child.id} className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`} onClick={() => navigate(`/plan/node/${child.id}`)}>
                <td className="px-3 py-3 text-[10px] font-mono font-bold" style={{ color: accentColor }}>{child.code || idx + 1}</td>
                <td className="px-3 py-3"><NodeTypeBadge node={child} /></td>
                <td className="px-3 py-3 text-[11px] text-gray-900 font-medium">{child.title}</td>
                {showBaseline && (
                  <td className="px-3 py-3 text-[10px] text-gray-600 text-center">{fmtItemValue(child.baseline_numeric, child.uom)}</td>
                )}
                {showTarget && (
                  <td className="px-3 py-3 text-[10px] font-semibold text-center" style={{ color: accentColor }}>{fmtItemValue(child.target_y1_numeric, child.uom)}</td>
                )}
                {showDivision && (
                  <td className="px-3 py-3">
                    {child.division ? <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-gray-100 text-gray-600 border border-gray-200 truncate inline-block max-w-[110px]" title={child.division.name}>{child.division.name}</span> : '—'}
                  </td>
                )}
                <td className="px-3 py-3 text-[11px] font-semibold text-right" style={{ color: accentColor }}>
                  {Number(child.budget_total_2026 || 0) > 0 ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(child.budget_total_2026)) : '—'}
                </td>
                <td className="px-3 py-3 text-center"><ChevronRight className="w-3.5 h-3.5 text-gray-300 inline pointer-events-none" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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

function DetailField({ label, value }) {
  return (
    <div>
      <p className="text-[9px] uppercase text-gray-400 font-semibold mb-1">{label}</p>
      <p className="text-[11px] font-medium text-gray-800">{value || '—'}</p>
    </div>
  );
}

function TargetCell({ label, value, active }) {
  return (
    <div className={`border p-2.5 ${active ? 'border-[#1A5632] bg-[#F0F7F2]' : 'border-gray-100'}`}>
      <p className="text-[9px] text-gray-400 uppercase">{label}</p>
      <p className={`text-[12px] font-semibold mt-0.5 ${active ? 'text-[#1A5632]' : 'text-gray-800'}`}>
        {value || '—'}
      </p>
    </div>
  );
}
