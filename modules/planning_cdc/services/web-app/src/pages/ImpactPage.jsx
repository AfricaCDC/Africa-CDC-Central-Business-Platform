/* eslint-disable complexity -- pre-existing legacy, tracked. */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useImpactData } from '@/hooks/usePlanNodeQueries';
import { Loader2, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { fmtBudget } from '@rbm/lib/formatters';
import { usePlanningYear } from '@/contexts/PlanningYearContext';

/**
 * Page that shows the impact tier of the AMERT plan: lists impact-level indicators
 * with their baselines, targets and current values for the active fiscal year.
 *
 * @returns {JSX.Element}
 */
export default function ImpactPage() {
  const [expanded, setExpanded] = useState({});
  const { planningYear: fiscalYear } = usePlanningYear();

  const { data, isLoading: loading } = useImpactData(fiscalYear);
  const outcome = data?.outcome || null;
  const indicators = data?.indicators || [];

  const navigate = useNavigate();
  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const totalBudget = indicators.reduce((s, i) => s + Number(i.budget_total_2026 || 0), 0);

  if (loading) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Planning' }, { label: 'Impact' }]}>
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-[#9F2241]" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Planning' }, { label: 'Impact' }]}>
      <div className="space-y-0">

        {/* Hero */}
        <div className="bg-[#9F2241] text-white">
          <div className="px-6 py-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">
                Tier 1 — Impact
              </span>
              <span className="text-[11px] font-mono text-white/70">2026–2028</span>
            </div>
            <h1 className="text-[18px] font-semibold leading-snug max-w-3xl">
              {outcome?.title || 'No outcome found'}
            </h1>
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex items-center gap-6 text-[12px] text-white/70">
            <span><strong className="text-white">{indicators.length}</strong> Impact Indicators</span>
            {totalBudget > 0 && (
              <span className="ml-auto text-white font-semibold">{fmtBudget(totalBudget)} <span className="text-white/60 font-normal">Total 2026</span></span>
            )}
          </div>
        </div>

        {/* Outcome Budget Summary */}
        {outcome && (
          <div className="bg-white border border-gray-200 border-t-0 px-6 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
              <BudgetCell label="Main Budget" value={outcome.budget_main} />
              <BudgetCell label="Pass Through" value={outcome.budget_pass_through} />
              <BudgetCell label="Tech. Assistance" value={outcome.budget_tech_assistance} />
              <BudgetCell label="Special Projects" value={outcome.budget_special_projects} />
              <BudgetCell label="Total 2026" value={outcome.budget_total_2026} highlight />
              <BudgetCell label="Budget 2027" value={outcome.budget_2027} muted />
              <BudgetCell label="Budget 2028" value={outcome.budget_2028} muted />
            </div>
          </div>
        )}

        {/* Indicators Table */}
        <div className="bg-white border border-gray-200 border-t-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#9F2241] text-white text-[10px]">
                  <th className="px-3 py-2.5 font-semibold w-[40px]"></th>
                  <th className="px-3 py-2.5 font-semibold w-[40px] text-center">No.</th>
                  <th className="px-3 py-2.5 font-semibold min-w-[280px]">Impact Indicator</th>
                  <th className="px-3 py-2.5 font-semibold w-[80px] text-center">Unit</th>
                  <th className="px-3 py-2.5 font-semibold w-[80px] text-center">Baseline</th>
                  <th className="px-3 py-2.5 font-semibold w-[80px] text-center">FY1 · 2023</th>
                  <th className="px-3 py-2.5 font-semibold w-[80px] text-center">FY2 · 2024</th>
                  <th className="px-3 py-2.5 font-semibold w-[80px] text-center">FY3 · 2025</th>
                  <th className="px-3 py-2.5 font-semibold w-[120px] text-right">Total 2026</th>
                </tr>
              </thead>
              <tbody>
                {indicators.map((ind, idx) => (
                  <React.Fragment key={ind.id}>
                    {/* Indicator Row */}
                    <tr
                      className={`border-b border-gray-200 cursor-pointer hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-[#9F2241]/5' : 'bg-white'}`}
                      onClick={() => toggle(ind.id)}
                    >
                      <td className="px-3 py-3 text-center">
                        {expanded[ind.id]
                          ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 inline pointer-events-none" />
                          : <ChevronRight className="w-3.5 h-3.5 text-gray-400 inline pointer-events-none" />
                        }
                      </td>
                      <td className="px-3 py-3 text-[12px] font-mono font-bold text-[#9F2241] text-center">
                        {ind.code}
                      </td>
                      <td className="px-3 py-3 text-[11px] font-medium text-gray-900">
                        {ind.title}
                      </td>
                      <td className="px-3 py-3 text-[10px] text-gray-500 text-center">{ind.unit || '—'}</td>
                      <td className="px-3 py-3 text-[11px] font-semibold text-gray-800 text-center">{ind.baseline || '—'}</td>
                      <td className="px-3 py-3 text-[11px] font-semibold text-[#9F2241] text-center">{ind.target_y1 || '—'}</td>
                      <td className="px-3 py-3 text-[10px] text-gray-600 text-center">{ind.target_y2 || '—'}</td>
                      <td className="px-3 py-3 text-[10px] text-gray-600 text-center">{ind.target_y3 || '—'}</td>
                      <td className="px-3 py-3 text-[11px] font-semibold text-[#9F2241] text-right">{fmtBudget(ind.budget_total_2026)}</td>
                    </tr>

                    {/* Expanded Budget Detail */}
                    {expanded[ind.id] && (
                      <tr>
                        <td colSpan={9} className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 mb-3">
                            <BudgetCell label="Main Budget" value={ind.budget_main} />
                            <BudgetCell label="Pass Through" value={ind.budget_pass_through} />
                            <BudgetCell label="Tech. Assistance" value={ind.budget_tech_assistance} />
                            <BudgetCell label="Special Projects" value={ind.budget_special_projects} />
                            <BudgetCell label="Total 2026" value={ind.budget_total_2026} highlight />
                            <BudgetCell label="Budget 2027" value={ind.budget_2027} muted />
                            <BudgetCell label="Budget 2028" value={ind.budget_2028} muted />
                          </div>
                          <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
                            <button
                              onClick={() => navigate(`/plan/node/${ind.id}`)}
                              className="flex items-center gap-1.5 text-[10px] font-semibold text-[#9F2241] hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              View indicator details
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

          {indicators.length === 0 && (
            <div className="px-5 py-12 text-center">
              <p className="text-[11px] text-gray-500">No outcome indicators found in plan_nodes.</p>
            </div>
          )}
        </div>

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
