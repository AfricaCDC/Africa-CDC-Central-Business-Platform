import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { fmtBudgetCompact } from '@rbm/lib/formatters';

const fmt = (v) => fmtBudgetCompact(v, '$0');
const QUARTERS = ['q1', 'q2', 'q3', 'q4'];

/**
 * Orange hero of the activity report plus the planned quarterly budget, with
 * the reported quarter highlighted.
 * @param {{ activity: object, quarter: string, fiscalYear: string, status: { label: string, bg: string, text: string } }} props
 * @returns {JSX.Element}
 * @example <ReportHeader activity={activity} quarter="Q3" fiscalYear="2026" status={STATUS_COLORS.DRAFT} />
 */
export default function ReportHeader({ activity, quarter, fiscalYear, status }) {
  const navigate = useNavigate();
  return (
    <>
      <div className="bg-[#D97706] text-white">
        <div className="px-6 py-5">
          <button onClick={() => navigate('/activity-report')} className="flex items-center gap-1 text-[10px] text-white/70 hover:text-white mb-3">
            <ArrowLeft className="w-3 h-3" /> Back to Activity Report
          </button>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">{quarter} {fiscalYear}</span>
            <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold bg-white/15 font-mono">{activity.code}</span>
            <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold ${status.bg} ${status.text}`}>{status.label}</span>
          </div>
          <h1 className="text-[16px] font-semibold leading-snug max-w-4xl">{activity.title}</h1>
        </div>
        <div className="border-t border-white/15 px-6 py-2.5 flex items-center gap-6 text-[11px] text-white/70">
          {activity.division && <span>Division: <strong className="text-white">{activity.division.name}</strong></span>}
          <span className="ml-auto text-white font-semibold">{fmt(activity.budget_total_2026)} budget</span>
        </div>
      </div>

      <div className="bg-white border border-gray-200 border-t-0 px-6 py-3">
        <p className="text-[9px] uppercase text-gray-400 font-semibold mb-2">Planned Budget</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {QUARTERS.map((q, i) => {
            const isCurrent = quarter === `Q${i + 1}`;
            return (
              <div key={q} className={`border p-2.5 ${isCurrent ? 'border-[#D97706] bg-orange-50' : 'border-gray-100'}`}>
                <p className="text-[9px] text-gray-400 uppercase">Q{i + 1}</p>
                <p className={`text-[11px] font-semibold mt-0.5 ${isCurrent ? 'text-[#D97706]' : 'text-gray-700'}`}>{fmt(activity[`${q}_budget`])}</p>
              </div>
            );
          })}
          <div className="border border-gray-100 p-2.5 bg-gray-50">
            <p className="text-[9px] text-gray-400 uppercase">Total</p>
            <p className="text-[11px] font-bold text-gray-900 mt-0.5">{fmt(activity.budget_total_2026)}</p>
          </div>
        </div>
      </div>
    </>
  );
}
