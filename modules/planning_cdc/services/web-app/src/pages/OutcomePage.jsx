/* eslint-disable complexity, max-lines -- pre-existing legacy, tracked. */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import api from '@/services/api';
import { useOutcomePageData } from '@/hooks/usePlanNodeQueries';
import { Loader2, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { fmtBudget, fmtValue as fmt } from '@rbm/lib/formatters';
import { fyToYear, TOTAL_FISCAL_YEARS } from '@rbm/lib/fiscalYear';
import RowActions, { planNodeActions } from '@/components/shared/RowActions';
import { usePlanningYear } from '@/contexts/PlanningYearContext';

/**
 * Page that lists outcome-tier nodes (long-term outcomes) below the impact level,
 * with their child indicators and progress against targets.
 *
 * @returns {JSX.Element}
 */
export default function OutcomePage() {
  const [expanded, setExpanded] = useState({});
  const [childIndicators, setChildIndicators] = useState({});

  const { planningYear: fiscalYear } = usePlanningYear();
  const navigate = useNavigate();

  const { data, isLoading: loading } = useOutcomePageData(fiscalYear);
  const impact = data?.impact || null;
  const impactIndicators = data?.impactIndicators || [];
  const outcomes = data?.outcomes || [];

  const toggle = async (id) => {
    const isOpen = expanded[id];
    setExpanded(prev => ({ ...prev, [id]: !isOpen }));
    if (!isOpen && !childIndicators[id]) {
      try {
        const res = await api.get(`/plan-nodes/${id}`);
        const children = res.data?.children || [];
        setChildIndicators(prev => ({ ...prev, [id]: children }));
      } catch {
        toast.error('Failed to load outcome indicators');
      }
    }
  };

  // Build parent lookup: impact indicator id → indicator object
  const indById = {};
  impactIndicators.forEach(i => { indById[i.id] = i; });

  const totalBudget = outcomes.reduce((s, o) => s + Number(o.budget_total_2026 || 0), 0);

  if (loading) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Planning' }, { label: 'Outcomes' }]}>
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Planning' }, { label: 'Outcomes' }]}>
      <div className="space-y-0">

        {/* Hero */}
        <div className="bg-[#1A5632] text-white">
          <div className="px-6 py-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">
                Outcomes
              </span>
              <span className="text-[11px] font-mono text-white/70">{fiscalYear}–{parseInt(fiscalYear) + 2}</span>
            </div>
            <h1 className="text-[18px] font-semibold leading-snug max-w-3xl">
              {impact?.title || 'Programme Outcomes'}
            </h1>
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex items-center gap-6 text-[12px] text-white/70">
            <span><strong className="text-white">{outcomes.length}</strong> Outcomes</span>
            <span><strong className="text-white">{impactIndicators.length}</strong> Impact Indicators</span>
            {totalBudget > 0 && (
              <span className="ml-auto text-white font-semibold">{fmtBudget(totalBudget)} <span className="text-white/60 font-normal">Total {fiscalYear}</span></span>
            )}
          </div>
        </div>

        {/* Budget Summary */}
        {impact && (
          <div className="bg-white border border-gray-200 border-t-0 px-6 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
              <BudgetCell label="Main Budget" value={impact.budget_main} />
              <BudgetCell label="Pass Through" value={impact.budget_pass_through} />
              <BudgetCell label="Tech. Assistance" value={impact.budget_tech_assistance} />
              <BudgetCell label="Special Projects" value={impact.budget_special_projects} />
              <BudgetCell label={`Total ${fiscalYear}`} value={impact.budget_total_2026} highlight />
              <BudgetCell label={`Budget ${parseInt(fiscalYear) + 1}`} value={impact.budget_2027} muted />
              <BudgetCell label={`Budget ${parseInt(fiscalYear) + 2}`} value={impact.budget_2028} muted />
            </div>
          </div>
        )}

        {/* Outcomes Table */}
        <div className="bg-white border border-gray-200 border-t-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#1A5632] text-white text-[10px]">
                  <th className="px-3 py-2.5 font-semibold w-[40px]"></th>
                  <th className="px-3 py-2.5 font-semibold w-[50px] text-center">No.</th>
                  <th className="px-3 py-2.5 font-semibold min-w-[280px]">Outcome</th>
                  <th className="px-3 py-2.5 font-semibold w-[180px]">Impact Indicator</th>
                  <th className="px-3 py-2.5 font-semibold w-[120px] text-right">Total {fiscalYear}</th>
                  <th className="px-3 py-2.5 font-semibold w-[80px] text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {outcomes.map((out, idx) => {
                  const parentInd = indById[out.parent_id];
                  return (
                    <React.Fragment key={out.id}>
                      <tr
                        className={`border-b border-gray-200 cursor-pointer hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-[#1A5632]/5' : 'bg-white'}`}
                        onClick={() => toggle(out.id)}
                      >
                        <td className="px-3 py-3 text-center">
                          {expanded[out.id]
                            ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 inline pointer-events-none" />
                            : <ChevronRight className="w-3.5 h-3.5 text-gray-400 inline pointer-events-none" />
                          }
                        </td>
                        <td className="px-3 py-3 text-[12px] font-mono font-bold text-[#1A5632] text-center">
                          {out.code}
                        </td>
                        <td className="px-3 py-3 text-[11px] font-medium text-gray-900">
                          {out.title}
                        </td>
                        <td className="px-3 py-3">
                          {parentInd && (
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/plan/node/${parentInd.id}`); }}
                              className="flex items-center gap-1.5 text-[10px] text-[#9F2241] hover:underline"
                            >
                              <span className="inline-flex items-center justify-center w-4 h-4 bg-[#9F2241] text-white text-[8px] font-bold flex-shrink-0">
                                {parentInd.code}
                              </span>
                              <span className="truncate max-w-[140px]">{parentInd.title}</span>
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-3 text-[11px] font-semibold text-[#1A5632] text-right">
                          {fmtBudget(out.budget_total_2026)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <RowActions id={out.id} actions={planNodeActions(out.id)} />
                        </td>
                      </tr>

                      {/* Expanded: T2 Indicators + Budget */}
                      {expanded[out.id] && (
                        <tr>
                          <td colSpan={6} className="border-b border-gray-200">
                            {/* Budget row */}
                            <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
                              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                                <BudgetCell label="Main Budget" value={out.budget_main} />
                                <BudgetCell label="Pass Through" value={out.budget_pass_through} />
                                <BudgetCell label="Tech. Assistance" value={out.budget_tech_assistance} />
                                <BudgetCell label="Special Projects" value={out.budget_special_projects} />
                                <BudgetCell label={`Total ${fiscalYear}`} value={out.budget_total_2026} highlight />
                                <BudgetCell label={`Budget ${parseInt(fiscalYear) + 1}`} value={out.budget_2027} muted />
                                <BudgetCell label={`Budget ${parseInt(fiscalYear) + 2}`} value={out.budget_2028} muted />
                              </div>
                            </div>

                            {/* Indicators split by tier (T2, T3, T4) */}
                            <div className="px-6 py-3">
                              {(!childIndicators[out.id]) ? (
                                <div className="flex items-center gap-2 py-2">
                                  <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                                  <span className="text-[10px] text-gray-400">Loading...</span>
                                </div>
                              ) : childIndicators[out.id].length === 0 ? (
                                <p className="text-[10px] text-gray-400 py-2">No indicators linked yet.</p>
                              ) : (
                                <>
                                  <IndicatorTierTable items={childIndicators[out.id].filter(c => c.tier_id === 2)} title="Outcome Indicators (T2)" accent="#1A5632" navigate={navigate} fiscalYear={fiscalYear} />
                                  <IndicatorTierTable items={childIndicators[out.id].filter(c => c.tier_id === 3)} title="Short-term Outcome Indicators (T3)" accent="#14442A" navigate={navigate} fiscalYear={fiscalYear} />
                                  <IndicatorTierTable items={childIndicators[out.id].filter(c => c.tier_id === 4)} title="Output Indicators (T4)" accent="#D97706" navigate={navigate} fiscalYear={fiscalYear} />
                                </>
                              )}
                            </div>

                            {/* Links */}
                            <div className="px-6 py-2 border-t border-gray-100 flex items-center gap-3">
                              <button
                                onClick={() => navigate(`/plan/node/${out.id}`)}
                                className="flex items-center gap-1.5 text-[10px] font-semibold text-[#1A5632] hover:underline"
                              >
                                <ExternalLink className="w-3 h-3" />
                                View full outcome details
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {outcomes.length === 0 && (
            <div className="px-5 py-12 text-center">
              <p className="text-[11px] text-gray-500">No outcomes found.</p>
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}

// The strategic plan runs over TOTAL_FISCAL_YEARS years; the table used to stop
// at FY3, hiding the FY4/FY5 targets entirely.
const FY_COLUMNS = Array.from({ length: TOTAL_FISCAL_YEARS }, (_, i) => i + 1);

function IndicatorTierTable({ items, title, accent, navigate, fiscalYear }) {
  const { fyNum } = usePlanningYear();
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-4">
      <p className="text-[9px] uppercase font-semibold mb-2" style={{ color: accent }}>
        {title} — {items.length}
      </p>
      <table className="w-full text-left">
        <thead>
          <tr className="text-[9px] text-gray-400 border-b border-gray-100">
            <th className="py-1.5 pr-2 font-normal w-[110px]">Code</th>
            <th className="py-1.5 pr-2 font-normal">Indicator</th>
            <th className="py-1.5 pr-2 font-normal w-[80px] text-center">UOM</th>
            <th className="py-1.5 pr-2 font-normal w-[70px] text-center">Baseline</th>
            {FY_COLUMNS.map((n) => (
              <th
                key={`fy${n}`}
                className="py-1.5 pr-2 font-normal w-[62px] text-center"
                style={n === fyNum ? { color: accent } : undefined}
              >
                FY{n} · {fyToYear(n)}
              </th>
            ))}
            <th className="py-1.5 font-normal w-[100px] text-right">Total {fiscalYear}</th>
          </tr>
        </thead>
        <tbody>
          {items.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true })).map((ind) => (
            <tr
              key={ind.id}
              className="border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => navigate(`/plan/node/${ind.id}`)}
            >
              <td className="py-2 pr-2 text-[10px] font-mono font-bold" style={{ color: accent }}>{ind.code}</td>
              <td className="py-2 pr-2 text-[10px] text-gray-800">{ind.title}</td>
              <td className="py-2 pr-2 text-[9px] text-gray-400 text-center">{ind.uom?.label || '—'}</td>
              <td className="py-2 pr-2 text-[10px] font-semibold text-gray-700 text-center">{fmt(ind.baseline_numeric, ind.uom)}</td>
              {FY_COLUMNS.map((n) => (
                <td
                  key={`fy${n}`}
                  className={`py-2 pr-2 text-[10px] text-center ${n === fyNum ? 'font-semibold' : 'text-gray-500'}`}
                  style={n === fyNum ? { color: accent } : undefined}
                >
                  {fmt(ind[`target_y${n}_numeric`], ind.uom)}
                </td>
              ))}
              <td className="py-2 text-[10px] font-semibold text-right" style={{ color: accent }}>{fmtBudget(ind.budget_total_2026)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
