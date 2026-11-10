/* eslint-disable no-unused-vars -- pre-existing legacy, tracked. */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAMERTTree } from '@/hooks/usePlanNodeQueries';
import { Loader2, ChevronRight, ChevronDown } from 'lucide-react';
import { fmtBudgetCompact as fmtBudget, fmtValue as fmt } from '@rbm/lib/formatters';
import { fyToYear } from '@rbm/lib/fiscalYear';
import { usePlanningYear } from '@/contexts/PlanningYearContext';

/**
 * Top-level AMERT (African Monitoring & Evaluation Results Tracker) browse page.
 * Lists impacts, outcomes and indicators from the AMERT hierarchy.
 *
 * @returns {JSX.Element}
 */
export default function AMERTPage() {
  const [openImpact, setOpenImpact] = useState({});
  const [openOutcome, setOpenOutcome] = useState({});
  const { planningYear: fiscalYear } = usePlanningYear();
  const navigate = useNavigate();

  const { data: tree, isLoading: loading } = useAMERTTree(fiscalYear);

  const toggleImpact = (id) => setOpenImpact(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleOutcome = (id) => setOpenOutcome(prev => ({ ...prev, [id]: !prev[id] }));

  if (loading) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Planning' }, { label: 'AMERT' }]}>
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" />
        </div>
      </DashboardLayout>
    );
  }

  if (!tree) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Planning' }, { label: 'AMERT' }]}>
        <div className="p-6 text-[11px] text-gray-500">No data found.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Planning' }, { label: 'Project Proposal (AMERT)' }]}>
      <div className="space-y-0">

        {/* Impact Hero */}
        <div className="bg-[#9F2241] text-white">
          <div className="px-6 py-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">
                AMERT — Project Proposal
              </span>
              <span className="text-[11px] font-mono text-white/70">{fiscalYear}–{parseInt(fiscalYear) + 2}</span>
            </div>
            <h1 className="text-[16px] font-semibold leading-snug max-w-4xl">{tree.title}</h1>
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex items-center gap-6 text-[12px] text-white/70">
            <span><strong className="text-white">{tree.children.length}</strong> Impact Indicators (T1)</span>
            <span><strong className="text-white">{tree.children.reduce((s, ii) => s + ii.outcomes.length, 0)}</strong> Outcomes</span>
            <span><strong className="text-white">{tree.children.reduce((s, ii) => s + ii.outcomes.reduce((s2, o) => s2 + o.t2.length + o.t3.length + o.t4.length, 0), 0)}</strong> Indicators (T2/T3/T4)</span>
            {tree.budget_total_2026 > 0 && (
              <span className="ml-auto text-white font-semibold">{fmtBudget(tree.budget_total_2026)} <span className="text-white/60 font-normal">Total {fiscalYear}</span></span>
            )}
          </div>
        </div>

        {/* T1 Impact Indicators */}
        {tree.children.map((ii) => (
          <div key={ii.id} className="bg-white border border-gray-200 border-t-0">
            <button
              onClick={() => toggleImpact(ii.id)}
              className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-gray-50 border-b border-gray-200"
            >
              {openImpact[ii.id]
                ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              }
              <span className="inline-flex items-center justify-center w-7 h-7 bg-[#9F2241] text-white text-[10px] font-bold flex-shrink-0">
                {ii.code}
              </span>
              <span className="text-[11px] font-semibold text-gray-900 flex-1 truncate">{ii.title}</span>
              <span className="text-[9px] text-gray-400">{ii.outcomes.length} outcomes</span>
              <span className="text-[11px] font-semibold text-[#9F2241] w-[100px] text-right">{fmtBudget(ii.budget_total_2026)}</span>
              <ExternalLinkBtn onClick={(e) => { e.stopPropagation(); navigate(`/plan/node/${ii.id}`); }} />
            </button>

            {openImpact[ii.id] && ii.outcomes.map((out) => {
              const totalIndicators = out.t2.length + out.t3.length + out.t4.length;
              return (
                <div key={out.id} className="border-b border-gray-100">
                  <button
                    onClick={() => toggleOutcome(out.id)}
                    className="w-full px-5 py-2.5 pl-12 flex items-center gap-3 text-left hover:bg-gray-50 bg-gray-50/50"
                  >
                    {openOutcome[out.id]
                      ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    }
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-[#1A5632] text-white text-[9px] font-bold flex-shrink-0">
                      {out.code}
                    </span>
                    <span className="text-[10px] font-medium text-gray-800 flex-1 truncate">{out.title}</span>
                    <span className="text-[9px] text-gray-400">{totalIndicators} indicators</span>
                    <span className="text-[10px] font-semibold text-[#1A5632] w-[100px] text-right">{fmtBudget(out.budget_total_2026)}</span>
                    <ExternalLinkBtn onClick={(e) => { e.stopPropagation(); navigate(`/plan/node/${out.id}`); }} />
                  </button>

                  {openOutcome[out.id] && (
                    <div className="pl-20 pr-5 py-3 bg-gradient-to-b from-green-50/30 to-white">
                      <IndicatorList items={out.t2} title="T2 Outcome Indicators" accent="#1A5632" navigate={navigate} />
                      <IndicatorList items={out.t3} title="T3 Short-term Outcome Indicators" accent="#14442A" navigate={navigate} />
                      <IndicatorList items={out.t4} title="T4 Output Indicators" accent="#D97706" navigate={navigate} />
                      {totalIndicators === 0 && (
                        <p className="text-[10px] text-gray-400 italic py-2">No indicators linked.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}

function ExternalLinkBtn({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-[9px] text-gray-400 hover:text-[#1A5632] hover:underline px-2 py-0.5 border border-gray-200 hover:border-[#1A5632] flex-shrink-0"
    >
      Detail →
    </button>
  );
}

function IndicatorList({ items, title, accent, navigate }) {
  const { fyNum } = usePlanningYear();
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="text-[9px] uppercase font-semibold mb-1.5" style={{ color: accent }}>
        {title} — {items.length}
      </p>
      <div className="border border-gray-200 bg-white">
        {items.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true })).map((ind, idx) => (
          <div
            key={ind.id}
            onClick={() => navigate(`/plan/node/${ind.id}`)}
            className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 ${idx > 0 ? 'border-t border-gray-100' : ''}`}
          >
            <span className="text-[9px] font-mono font-bold w-[110px] flex-shrink-0" style={{ color: accent }}>{ind.code}</span>
            <span className="text-[10px] text-gray-800 flex-1 truncate">{ind.title}</span>
            <span className="text-[9px] text-gray-400 w-[60px] text-center flex-shrink-0">{ind.uom?.label || '—'}</span>
            <span className="text-[10px] font-semibold text-gray-700 w-[60px] text-center flex-shrink-0">{fmt(ind.baseline_numeric, ind.uom)}</span>
            <span className="text-[10px] font-semibold w-[60px] text-center flex-shrink-0" style={{ color: accent }} title={`Target FY${fyNum} · ${fyToYear(fyNum)}`}>{fmt(ind[`target_y${fyNum}_numeric`] ?? ind.target_y1_numeric, ind.uom)}</span>
            <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
