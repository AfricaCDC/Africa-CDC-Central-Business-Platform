import { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { usePlanOutcomeData } from '@/hooks/usePlanNodeQueries';
import { Loader2, Target, ChevronDown, ChevronRight } from 'lucide-react';

const fmtMoney = (v) => {
  const n = Number(v || 0);
  if (!n) return '—';
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return '$' + (n / 1000).toFixed(0) + 'K';
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
};

const fmtFull = (v) => {
  const n = Number(v || 0);
  if (!n) return '—';
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
};

/**
 * Page that shows the strategic outcome at the top of the AMERT plan, with its
 * indicators and budget totals.
 *
 * @returns {JSX.Element}
 */
export default function PlanOutcomePage() {
  const [expanded, setExpanded] = useState({});

  const { data, isLoading: loading, error } = usePlanOutcomeData();
  const outcome = data?.outcome || null;
  const indicators = data?.indicators || [];

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  if (loading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" />
      </div>
    </DashboardLayout>
  );

  if (error) return (
    <DashboardLayout>
      <div className="p-6 text-red-600 text-[11px]">Failed to load outcome data</div>
    </DashboardLayout>
  );

  if (!outcome) return (
    <DashboardLayout>
      <div className="p-6 text-gray-500 text-[11px]">No outcome data found.</div>
    </DashboardLayout>
  );

  const budgetPct = (ind) => {
    const total = Number(outcome.budget_total_2026 || 0);
    const val = Number(ind.budget_total_2026 || 0);
    return total > 0 ? ((val / total) * 100).toFixed(1) : '0';
  };

  return (
    // eslint-disable-next-line no-restricted-syntax -- breadcrumb labels are UI copy, not ENTITY_TYPES identifiers
    <DashboardLayout breadcrumbs={[{ label: 'Plan', href: '/' }, { label: 'Outcome' }]}>
      <div className="p-6 space-y-6">

        {/* Outcome Header */}
        <div className="border border-gray-200 bg-white p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 bg-[#1A5632] flex items-center justify-center flex-shrink-0">
              <Target className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-[#1A5632] font-semibold mb-1">Programme Outcome 2026–2028</p>
              <h1 className="text-[12px] font-semibold text-gray-900 leading-snug">{outcome.title}</h1>
            </div>
          </div>

          {/* Budget Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <BudgetCard label="Main Budget" value={outcome.budget_main} />
            <BudgetCard label="Tech. Assistance" value={outcome.budget_tech_assistance} />
            <BudgetCard label="Total 2026" value={outcome.budget_total_2026} highlight />
            <div className="border border-gray-100 p-3">
              <p className="text-[9px] text-gray-400 uppercase">2027 / 2028</p>
              <p className="text-[11px] font-medium text-gray-700 mt-1">
                {fmtMoney(outcome.budget_2027)} / {fmtMoney(outcome.budget_2028)}
              </p>
            </div>
          </div>
        </div>

        {/* T1 Outcome Indicators */}
        <div>
          <h2 className="text-[11px] font-semibold text-gray-700 mb-3 uppercase tracking-wider">
            Outcome Indicators (T1) — {indicators.length} indicators
          </h2>

          <div className="space-y-2">
            {/* eslint-disable-next-line complexity -- pre-existing; file touched only for responsive classes, refactor out of scope (11) */}
            {indicators.map((ind) => (
              <div key={ind.id} className="border border-gray-200 bg-white">
                {/* Indicator Header Row */}
                <button
                  onClick={() => toggle(ind.id)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  {expanded[ind.id]
                    ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  }
                  <div className="w-7 h-7 bg-[#9F2241] flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-[10px] font-bold">{ind.code}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-gray-900 truncate">{ind.title}</p>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-[9px] text-gray-400">Baseline: <span className="text-gray-600 font-medium">{ind.baseline || '—'}</span></span>
                      <span className="text-[9px] text-gray-400">Target Y1: <span className="text-[#1A5632] font-medium">{ind.target_y1 || '—'}</span></span>
                      <span className="text-[9px] text-gray-400">Y2: <span className="text-gray-600">{ind.target_y2 || '—'}</span></span>
                      <span className="text-[9px] text-gray-400">Y3: <span className="text-gray-600">{ind.target_y3 || '—'}</span></span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[11px] font-semibold text-gray-900">{fmtMoney(ind.budget_total_2026)}</p>
                    <p className="text-[9px] text-gray-400">{budgetPct(ind)}% of total</p>
                  </div>
                </button>

                {/* Expanded Detail */}
                {expanded[ind.id] && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Targets */}
                      <div>
                        <p className="text-[9px] uppercase text-gray-400 font-semibold mb-2">Targets</p>
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="text-gray-400">
                              <th className="text-left py-1 font-normal">Period</th>
                              <th className="text-right py-1 font-normal">Value</th>
                            </tr>
                          </thead>
                          <tbody className="text-gray-700">
                            <tr className="border-t border-gray-100">
                              <td className="py-1.5">Baseline</td>
                              <td className="text-right font-medium">{ind.baseline || '—'}</td>
                            </tr>
                            <tr className="border-t border-gray-100">
                              <td className="py-1.5">Year 1 (2026)</td>
                              <td className="text-right font-medium text-[#1A5632]">{ind.target_y1 || '—'}</td>
                            </tr>
                            <tr className="border-t border-gray-100">
                              <td className="py-1.5">Year 2 (2027)</td>
                              <td className="text-right font-medium">{ind.target_y2 || '—'}</td>
                            </tr>
                            <tr className="border-t border-gray-100">
                              <td className="py-1.5">Year 3 (2028)</td>
                              <td className="text-right font-medium">{ind.target_y3 || '—'}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Budget Breakdown */}
                      <div>
                        <p className="text-[9px] uppercase text-gray-400 font-semibold mb-2">Budget Breakdown</p>
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="text-gray-400">
                              <th className="text-left py-1 font-normal">Category</th>
                              <th className="text-right py-1 font-normal">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="text-gray-700">
                            <tr className="border-t border-gray-100">
                              <td className="py-1.5">Main Budget</td>
                              <td className="text-right">{fmtFull(ind.budget_main)}</td>
                            </tr>
                            <tr className="border-t border-gray-100">
                              <td className="py-1.5">Pass Through</td>
                              <td className="text-right">{fmtFull(ind.budget_pass_through)}</td>
                            </tr>
                            <tr className="border-t border-gray-100">
                              <td className="py-1.5">Tech. Assistance</td>
                              <td className="text-right">{fmtFull(ind.budget_tech_assistance)}</td>
                            </tr>
                            <tr className="border-t border-gray-100">
                              <td className="py-1.5">Special Projects</td>
                              <td className="text-right">{fmtFull(ind.budget_special_projects)}</td>
                            </tr>
                            <tr className="border-t border-gray-200 font-semibold">
                              <td className="py-1.5">Total 2026</td>
                              <td className="text-right text-[#1A5632]">{fmtFull(ind.budget_total_2026)}</td>
                            </tr>
                            <tr className="border-t border-gray-100 text-gray-400">
                              <td className="py-1.5">2027</td>
                              <td className="text-right">{fmtFull(ind.budget_2027)}</td>
                            </tr>
                            <tr className="border-t border-gray-100 text-gray-400">
                              <td className="py-1.5">2028</td>
                              <td className="text-right">{fmtFull(ind.budget_2028)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Total Validation */}
        <div className="border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-gray-500">Sum of Outcome Indicators</p>
            <p className="text-[11px] font-semibold text-gray-700">
              {fmtFull(indicators.reduce((s, i) => s + Number(i.budget_total_2026 || 0), 0))}
            </p>
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-[10px] text-gray-500">Outcome Total</p>
            <p className="text-[11px] font-semibold text-[#1A5632]">{fmtFull(outcome.budget_total_2026)}</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function BudgetCard({ label, value, highlight }) {
  return (
    <div className={`border p-3 ${highlight ? 'border-[#1A5632] bg-[#F0F7F2]' : 'border-gray-100'}`}>
      <p className="text-[9px] text-gray-400 uppercase">{label}</p>
      <p className={`text-[12px] font-semibold mt-1 ${highlight ? 'text-[#1A5632]' : 'text-gray-800'}`}>
        {fmtMoney(value)}
      </p>
    </div>
  );
}
