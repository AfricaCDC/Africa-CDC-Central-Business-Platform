/* eslint-disable complexity, max-lines, no-unused-vars --
 * Legacy file with baseline debt from pre-guardrails era. Scheduled refactor:
 * task #37 — migrate off pragma when React-Query cohort + RBAC matrix migration
 * lands on this page. Do NOT add new violations; this pragma is a ceiling,
 * not a green light.
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveDivision } from '@/contexts/ActiveDivisionContext';
import { useFocalDashboardRaw } from '@/hooks/usePlanNodeQueries';
import { Loader2, Activity, DollarSign, TrendingUp, ArrowRight } from 'lucide-react';
import { fmtBudgetCompact, fmtValue as fmtVal } from '@rbm/lib/formatters';
import { ORG_LEVEL_TYPES } from '@rbm/lib/enums';
import { usePlanningYear } from '@/contexts/PlanningYearContext';
import BudgetExecutionWidget from '@/components/budget-execution/BudgetExecutionWidget';
import ActivityProgressStrip from '@/components/dashboard/ActivityProgressStrip';

// Local: returns '$0' rather than '—' for empty values, matching the dashboard
// design where the total amount card always shows a value.
const fmt = (v) => fmtBudgetCompact(v, '$0');

/**
 * Landing page for focal-point users. Shows the broad and specific activities the
 * current user is responsible for, with totals and quick links into reporting.
 *
 * @returns {JSX.Element}
 */
export default function FocalDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { planningYear: fiscalYear } = usePlanningYear();

  const { activeDivision, activeCodes, loaded: divLoaded, divisions: divisionsFromContext } = useActiveDivision();
  // Context divisions first — users.division_code is the legacy single-division
  // column, NULL for anyone assigned via the admin since the multi-division model.
  const divCode = activeDivision?.code || divisionsFromContext?.[0]?.code || user?.division_code;
  const divName = activeDivision?.division_name || user?.division_name || 'Your Division';
  const directorate = activeDivision?.parent_code || user?.directorate;

  const { data: raw, isLoading: rawLoading } = useFocalDashboardRaw(fiscalYear);
  const loading = rawLoading || !divLoaded;

  const data = useMemo(() => {
    if (!raw || !divLoaded || !activeCodes || activeCodes.size === 0) {
      return { broads: [], specifics: [], indById: {}, areaById: {}, divMeta: {} };
    }
    const { broads: allBroads, specifics: allSpecifics, t2, t3, t4, areas: allAreas, budgetCodes: allBC, divisions: allDivs } = raw;

    const divMetaMap = {};
    allDivs.forEach((d) => {
      divMetaMap[d.code] = {
        name: d.division_name,
        focal_name: '',
        responsible_name: '',
        level_type: d.level_type,
        parent_code: d.parent_code,
        alias_of: d.alias_of,
        canonical_code: d.alias_of || d.code,
      };
    });
    (divisionsFromContext || []).forEach((d) => {
      divMetaMap[d.code] = {
        name: d.division_name,
        focal_name: d.focal_name || '',
        responsible_name: d.responsible_name || '',
        m_and_e_name: d.m_and_e_name || '',
        level_type: d.level_type,
        parent_code: d.parent_code,
        alias_of: d.alias_of,
        canonical_code: d.alias_of || d.code,
      };
    });

    const divCodesSet = new Set(Array.from(activeCodes || []).map((c) => String(c).toUpperCase()));
    const inScope = (code) => divCodesSet.has(String(code || '').toUpperCase());

    const broads = allBroads.filter(b => inScope(b.responsible_division_code));
    const broadIds = new Set(broads.map(b => b.id));
    const specifics = allSpecifics.filter(s => inScope(s.responsible_division_code) || broadIds.has(s.parent_id));

    const indById = {};
    t2.forEach(i => { indById[i.id] = { ...i, tier_id: 2 }; });
    t3.forEach(i => { indById[i.id] = { ...i, tier_id: 3 }; });
    t4.forEach(i => { indById[i.id] = { ...i, tier_id: 4 }; });
    const areaById = {};
    allAreas.forEach(a => { areaById[a.id] = a; });

    const bcByBroad = {};
    allBC.forEach(bc => {
      if (!bcByBroad[bc.plan_node_id]) bcByBroad[bc.plan_node_id] = [];
      bcByBroad[bc.plan_node_id].push(bc);
    });

    const specsByBroad = {};
    specifics.forEach(s => {
      if (!specsByBroad[s.parent_id]) specsByBroad[s.parent_id] = [];
      specsByBroad[s.parent_id].push(s);
    });

    const enrichedBroads = broads.map(b => {
      const parentInd = indById[b.parent_id];
      const parentArea = parentInd ? areaById[parentInd.parent_id] : null;
      return {
        ...b,
        parent_indicator: parentInd,
        parent_area: parentArea,
        budget_codes: bcByBroad[b.id] || [],
        specs: specsByBroad[b.id] || [],
      };
    });

    const enrichedSpecs = specifics.map(s => ({
      ...s,
      linked_indicator: s.linked_indicator_id ? indById[s.linked_indicator_id] : null,
    }));

    return { broads: enrichedBroads, specifics: enrichedSpecs, indById, areaById, divMeta: divMetaMap };
  }, [raw, divLoaded, activeCodes, divisionsFromContext]);

  if (loading) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Dashboard' }]}>
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" />
        </div>
      </DashboardLayout>
    );
  }

  if (!divCode) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Dashboard' }]}>
        <div className="p-6 text-[11px] text-gray-500">No division assigned to your account.</div>
      </DashboardLayout>
    );
  }

  const { broads, specifics, divMeta = {} } = data;

  const totalBudget = broads.reduce((s, b) => s + Number(b.budget_total_2026 || 0), 0);
  const mainBudget = broads.reduce((s, b) => s + Number(b.budget_main || 0), 0);
  const taBudget = broads.reduce((s, b) => s + Number(b.budget_tech_assistance || 0), 0);
  const budget2027 = broads.reduce((s, b) => s + Number(b.budget_2027 || 0), 0);
  const budget2028 = broads.reduce((s, b) => s + Number(b.budget_2028 || 0), 0);
  const q1 = specifics.reduce((s, sp) => s + Number(sp.q1_budget || 0), 0);
  const q2 = specifics.reduce((s, sp) => s + Number(sp.q2_budget || 0), 0);
  const q3 = specifics.reduce((s, sp) => s + Number(sp.q3_budget || 0), 0);
  const q4 = specifics.reduce((s, sp) => s + Number(sp.q4_budget || 0), 0);

  const totalBudgetCodes = broads.reduce((s, b) => s + (b.budget_codes?.length || 0), 0);

  // Indicators the division contributes to (via broads' parent_indicator AND specifics' linked_indicator)
  const indById = data.indById || {};
  const indicatorMap = new Map();
  broads.forEach(b => {
    if (b.parent_indicator) indicatorMap.set(b.parent_indicator.id, b.parent_indicator);
  });
  specifics.forEach(s => {
    if (s.linked_indicator && !indicatorMap.has(s.linked_indicator.id)) {
      indicatorMap.set(s.linked_indicator.id, s.linked_indicator);
    }
  });
  const allInds = [...indicatorMap.values()];
  const t2Inds = allInds.filter(i => i.tier_id === 2);
  const t3Inds = allInds.filter(i => i.tier_id === 3);
  const t4Inds = allInds.filter(i => i.tier_id === 4);

  // Outcomes the division contributes to
  const outcomeMap = new Map();
  broads.forEach(b => {
    if (b.parent_area) outcomeMap.set(b.parent_area.id, b.parent_area);
  });
  const linkedOutcomes = [...outcomeMap.values()].sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
  const linkedIndicators = new Set(allInds.map(i => i.id));

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Home' }]}>
      <div className="space-y-0">

        {/* Hero */}
        <div className="bg-[#1A5632] text-white">
          <div className="px-6 py-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">
                FY {fiscalYear}
              </span>
              <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[9px] font-bold bg-white/15">
                {divCode}
              </span>
              {directorate && <span className="text-[10px] text-white/60">{directorate}</span>}
            </div>
            <h1 className="text-[18px] font-semibold leading-snug">{divName}</h1>
            <p className="text-[11px] text-white/60 mt-1">Welcome back, {user?.full_name}</p>
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex items-center gap-6 text-[12px] text-white/70 flex-wrap">
            <span><strong className="text-white">{broads.length}</strong> Broad Activities</span>
            <span><strong className="text-white">{specifics.length}</strong> Specific Activities</span>
            <span><strong className="text-white">{linkedOutcomes.length}</strong> Outcomes</span>
            <span><strong className="text-white">{t3Inds.length}</strong> T3 / <strong className="text-white">{t4Inds.length}</strong> T4</span>
            <span><strong className="text-white">{totalBudgetCodes}</strong> Budget Codes</span>
            {totalBudget > 0 && (
              <span className="ml-auto text-white font-semibold">{fmt(totalBudget)} <span className="text-white/60 font-normal">Total {fiscalYear}</span></span>
            )}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-6 border border-gray-200 border-t-0 divide-x divide-gray-200">
          <div className="px-4 py-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-semibold text-gray-400 uppercase">Total {fiscalYear}</span>
              <DollarSign className="w-3.5 h-3.5 text-[#1A5632]" />
            </div>
            <div className="text-[20px] font-bold text-gray-900 leading-none">{fmt(totalBudget)}</div>
            <div className="text-[10px] text-gray-500 mt-1">{broads.length} broad activities</div>
          </div>
          <div className="px-4 py-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-semibold text-gray-400 uppercase">Main</span>
              <DollarSign className="w-3.5 h-3.5 text-[#348F41]" />
            </div>
            <div className="text-[20px] font-bold text-gray-900 leading-none">{fmt(mainBudget)}</div>
            <div className="text-[10px] text-gray-500 mt-1">{totalBudget > 0 ? Math.round((mainBudget / totalBudget) * 100) : 0}% of total</div>
          </div>
          <div className="px-4 py-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-semibold text-gray-400 uppercase">TA</span>
              <TrendingUp className="w-3.5 h-3.5 text-[#E8A838]" />
            </div>
            <div className="text-[20px] font-bold text-gray-900 leading-none">{fmt(taBudget)}</div>
            <div className="text-[10px] text-gray-500 mt-1">{totalBudget > 0 ? Math.round((taBudget / totalBudget) * 100) : 0}% of total</div>
          </div>
          <div className="px-4 py-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-semibold text-gray-400 uppercase">{parseInt(fiscalYear) + 1}</span>
              <DollarSign className="w-3.5 h-3.5 text-gray-300" />
            </div>
            <div className="text-[20px] font-bold text-gray-400 leading-none">{fmt(budget2027)}</div>
            <div className="text-[10px] text-gray-400 mt-1">forecast</div>
          </div>
          <div className="px-4 py-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-semibold text-gray-400 uppercase">{parseInt(fiscalYear) + 2}</span>
              <DollarSign className="w-3.5 h-3.5 text-gray-300" />
            </div>
            <div className="text-[20px] font-bold text-gray-400 leading-none">{fmt(budget2028)}</div>
            <div className="text-[10px] text-gray-400 mt-1">forecast</div>
          </div>
          <div className="px-4 py-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-semibold text-gray-400 uppercase">Activities</span>
              <Activity className="w-3.5 h-3.5 text-[#D97706]" />
            </div>
            <div className="text-[20px] font-bold text-gray-900 leading-none">{specifics.length}</div>
            <div className="text-[10px] text-gray-500 mt-1">{totalBudgetCodes} budget codes</div>
          </div>
        </div>

        {/* Budget execution (D-20261015-04) */}
        <BudgetExecutionWidget fiscalYear={fiscalYear} division={divCode} />
        <ActivityProgressStrip fiscalYear={fiscalYear} division={divCode} />

        {/* Quarterly breakdown */}
        <div className="bg-white border border-gray-200 border-t-0">
          <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">Quarterly Budget Breakdown</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-100">
            <QCell label="Q1" value={q1} active={new Date().getMonth() < 3} />
            <QCell label="Q2" value={q2} active={new Date().getMonth() >= 3 && new Date().getMonth() < 6} />
            <QCell label="Q3" value={q3} active={new Date().getMonth() >= 6 && new Date().getMonth() < 9} />
            <QCell label="Q4" value={q4} active={new Date().getMonth() >= 9} />
          </div>
        </div>

        {/* Division contacts — show focal + HOD for every division in
            the current scope so users know who to ping. */}
        {Array.from(activeCodes || []).length > 0 && (
          <div className="bg-white border border-gray-200 border-t-0">
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">Division contacts</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0">
              {Array.from(activeCodes || [])
                .map((c) => divMeta[c])
                .filter(Boolean)
                .filter((m) => !m.alias_of)   // hide aliases (ADIM, HRMD, etc.) — canonical row carries the contacts
                .sort((a, b) => {
                  // Directorates first
                  if (a.level_type === ORG_LEVEL_TYPES.DIRECTORATE && b.level_type !== ORG_LEVEL_TYPES.DIRECTORATE) return -1;
                  if (a.level_type !== ORG_LEVEL_TYPES.DIRECTORATE && b.level_type === ORG_LEVEL_TYPES.DIRECTORATE) return 1;
                  return (a.name || '').localeCompare(b.name || '');
                })
                .map((m) => (
                  <div key={m.canonical_code + (m.name || '')} className="px-5 py-3 border-b border-gray-100 border-r-0 md:border-r border-gray-100">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 bg-gray-100 text-gray-700">{m.canonical_code}</span>
                      <span className="text-[11px] font-semibold text-gray-800 truncate">{m.name}</span>
                      {m.level_type === ORG_LEVEL_TYPES.DIRECTORATE && <span className="text-[8px] uppercase font-bold text-purple-700">Directorate</span>}
                    </div>
                    <div className="text-[10px] text-gray-600 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <div className="text-[8px] uppercase text-gray-400 font-semibold">Focal</div>
                        <div className="truncate">{m.focal_name || <span className="text-gray-300">—</span>}</div>
                      </div>
                      <div>
                        <div className="text-[8px] uppercase text-gray-400 font-semibold">{m.level_type === ORG_LEVEL_TYPES.DIRECTORATE ? 'Director' : 'Head'}</div>
                        <div className="truncate">{m.responsible_name || <span className="text-gray-300">—</span>}</div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Broad Activities list */}
        <div className="bg-white border border-gray-200 border-t-0">
          <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">
              Broad Activities ({broads.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[9px] text-gray-400 border-b border-gray-100 bg-gray-50/50">
                  <th className="px-3 py-2 font-normal w-[100px]">Code</th>
                  <th className="px-3 py-2 font-normal w-[110px]">Division</th>
                  <th className="px-3 py-2 font-normal min-w-[240px]">Description</th>
                  <th className="px-3 py-2 font-normal w-[140px]">Outcome</th>
                  <th className="px-3 py-2 font-normal w-[140px]">Indicator</th>
                  <th className="px-3 py-2 font-normal w-[60px] text-center">Tasks</th>
                  <th className="px-3 py-2 font-normal w-[60px] text-center">B.Codes</th>
                  <th className="px-3 py-2 font-normal w-[100px] text-right">Main</th>
                  <th className="px-3 py-2 font-normal w-[80px] text-right">TA</th>
                  <th className="px-3 py-2 font-normal w-[100px] text-right">Total</th>
                  <th className="px-3 py-2 font-normal w-[30px]"></th>
                </tr>
              </thead>
              <tbody>
                {broads.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true })).map((b, i) => (
                  <tr key={b.id} onClick={() => navigate(`/plan/node/${b.id}`)} className={`border-b border-gray-100 cursor-pointer hover:bg-orange-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <td className="px-3 py-2.5 text-[10px] font-mono font-bold text-[#B45309]">{b.code}</td>
                    <td className="px-3 py-2.5 text-[10px]">
                      {b.responsible_division_code && (
                        <span className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-700 font-mono font-semibold" title={b.responsible_division_code}>
                          {b.responsible_division_code}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-gray-800">{b.title}</td>
                    <td className="px-3 py-2.5 text-[10px]">
                      {b.parent_area && (
                        <span className="inline-block px-1.5 py-0.5 bg-[#1A5632]/10 text-[#1A5632] font-semibold" title={b.parent_area.title}>
                          {b.parent_area.code}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[10px]">
                      {b.parent_indicator && (
                        <span className="inline-block px-1.5 py-0.5 font-mono font-semibold text-[#14442A] truncate max-w-[130px]" title={b.parent_indicator.title}>
                          {b.parent_indicator.code}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[10px] text-gray-600 text-center font-semibold">{(b.specs || []).length}</td>
                    <td className="px-3 py-2.5 text-[10px] text-gray-600 text-center font-semibold">{(b.budget_codes || []).length}</td>
                    <td className="px-3 py-2.5 text-[10px] text-gray-700 text-right">{fmt(b.budget_main)}</td>
                    <td className="px-3 py-2.5 text-[10px] text-[#E8A838] text-right">{fmt(b.budget_tech_assistance)}</td>
                    <td className="px-3 py-2.5 text-[11px] font-semibold text-[#B45309] text-right">{fmt(b.budget_total_2026)}</td>
                    <td className="px-3 py-2.5 text-center"><ArrowRight className="w-3 h-3 text-gray-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {broads.length === 0 && (
            <div className="px-5 py-12 text-center text-[11px] text-gray-400">
              No broad activities assigned to your division yet.
            </div>
          )}
        </div>

        {/* Indicators the division contributes to (T3 + T4 only — T2 is the outcome itself) */}
        {(t3Inds.length + t4Inds.length) > 0 && (
          <>
            <IndicatorList title="Short-term Outcome Indicators (T3)" items={t3Inds} accent="#14442A" navigate={navigate} fiscalYear={fiscalYear} />
            <IndicatorList title="Output Indicators (T4)" items={t4Inds} accent="#D97706" navigate={navigate} fiscalYear={fiscalYear} />
          </>
        )}

        {/* Specific Activities */}
        {specifics.length > 0 && (
          <div className="bg-white border border-gray-200 border-t-0">
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">
                Specific Activities ({specifics.length})
              </h2>
              <span className="text-[11px] font-semibold text-[#D97706]">{fmt(specifics.reduce((s, sp) => s + Number(sp.budget_total_2026 || 0), 0))} total</span>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="text-[9px] text-gray-400 border-b border-gray-100">
                    <th className="px-3 py-2 font-normal w-[120px]">Code</th>
                    <th className="px-3 py-2 font-normal w-[110px]">Division</th>
                    <th className="px-3 py-2 font-normal min-w-[220px]">Description</th>
                    <th className="px-3 py-2 font-normal w-[120px]">Linked Indicator</th>
                    <th className="px-3 py-2 font-normal w-[80px] text-right">Q1</th>
                    <th className="px-3 py-2 font-normal w-[80px] text-right">Q2</th>
                    <th className="px-3 py-2 font-normal w-[80px] text-right">Q3</th>
                    <th className="px-3 py-2 font-normal w-[80px] text-right">Q4</th>
                    <th className="px-3 py-2 font-normal w-[100px] text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {specifics.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true })).map((s, i) => (
                    <tr key={s.id} onClick={() => navigate(`/plan/node/${s.id}`)} className={`border-b border-gray-100 cursor-pointer hover:bg-orange-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                      <td className="px-3 py-2 text-[9px] font-mono font-bold text-[#D97706]">{s.code}</td>
                      <td className="px-3 py-2 text-[9px]">
                        {s.responsible_division_code && (
                          <span className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-700 font-mono font-semibold" title={s.responsible_division_code}>
                            {s.responsible_division_code}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[10px] text-gray-800">{s.title}</td>
                      <td className="px-3 py-2 text-[9px]">
                        {s.linked_indicator && (
                          <span className={`inline-block px-1.5 py-0.5 font-mono font-semibold text-white ${s.linked_indicator.tier_id === 4 ? 'bg-[#D97706]' : 'bg-[#14442A]'}`} title={s.linked_indicator.title}>
                            T{s.linked_indicator.tier_id} {s.linked_indicator.code}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[10px] text-gray-700 text-right">{Number(s.q1_budget || 0) > 0 ? fmt(s.q1_budget) : '—'}</td>
                      <td className="px-3 py-2 text-[10px] text-gray-700 text-right">{Number(s.q2_budget || 0) > 0 ? fmt(s.q2_budget) : '—'}</td>
                      <td className="px-3 py-2 text-[10px] text-gray-700 text-right">{Number(s.q3_budget || 0) > 0 ? fmt(s.q3_budget) : '—'}</td>
                      <td className="px-3 py-2 text-[10px] text-gray-700 text-right">{Number(s.q4_budget || 0) > 0 ? fmt(s.q4_budget) : '—'}</td>
                      <td className="px-3 py-2 text-[10px] font-semibold text-[#D97706] text-right">{fmt(s.budget_total_2026)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function IndicatorList({ title, items, accent, navigate, fiscalYear }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="bg-white border border-gray-200 border-t-0">
      <div className="px-5 py-3 border-b border-gray-200" style={{ backgroundColor: accent + '15' }}>
        <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
          {title} — {items.length}
        </h2>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr className="text-[9px] text-gray-400 border-b border-gray-100">
            <th className="px-4 py-1.5 font-normal w-[140px]">Code</th>
            <th className="px-4 py-1.5 font-normal w-[100px]">Division</th>
            <th className="px-4 py-1.5 font-normal">Indicator</th>
            <th className="px-4 py-1.5 font-normal w-[90px] text-center">UOM</th>
            <th className="px-4 py-1.5 font-normal w-[90px] text-center">Baseline</th>
            <th className="px-4 py-1.5 font-normal w-[90px] text-center">Target {fiscalYear}</th>
          </tr>
        </thead>
        <tbody>
          {items.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true })).map((ind, i) => (
            <tr key={ind.id} onClick={() => navigate(`/plan/node/${ind.id}`)} className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
              <td className="px-4 py-2 text-[10px] font-mono font-bold" style={{ color: accent }}>{ind.code}</td>
              <td className="px-4 py-2 text-[9px]">
                {ind.responsible_division_code && (
                  <span className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-700 font-mono font-semibold" title={ind.responsible_division_code}>
                    {ind.responsible_division_code}
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-[10px] text-gray-800">{ind.title}</td>
              <td className="px-4 py-2 text-[9px] text-gray-400 text-center">{ind.uom?.label || '—'}</td>
              <td className="px-4 py-2 text-[10px] font-semibold text-gray-700 text-center">{fmtVal(ind.baseline_numeric, ind.uom)}</td>
              <td className="px-4 py-2 text-[10px] font-semibold text-center" style={{ color: accent }}>{fmtVal(ind.target_y1_numeric, ind.uom)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QCell({ label, value, active }) {
  return (
    <div className={`px-4 py-3 ${active ? 'bg-[#F0F7F2]' : ''}`}>
      <div className={`text-[9px] font-semibold uppercase tracking-wider mb-1 ${active ? 'text-[#1A5632]' : 'text-gray-400'}`}>
        {label}{active ? ' (current)' : ''}
      </div>
      <div className={`text-[16px] font-bold ${active ? 'text-[#1A5632]' : 'text-gray-700'}`}>{fmt(value)}</div>
    </div>
  );
}
