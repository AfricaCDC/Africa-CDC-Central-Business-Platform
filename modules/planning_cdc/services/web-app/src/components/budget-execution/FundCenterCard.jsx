import ExecutionBar from '@/components/budget-execution/ExecutionBar';
import { money, rate, balanceTone } from './budgetFigures';

const TH = 'px-3 py-1.5 text-[10px] font-semibold uppercase text-gray-500';
const NUM = 'px-3 py-2 text-right text-[11px] tabular-nums whitespace-nowrap';

function GlTable({ lines }) {
  if (!lines.length) return <p className="px-3 py-2 text-[11px] text-gray-400">No expenditure line yet.</p>;
  return (
    <table className="w-full min-w-[560px]">
      <thead className="border-b border-gray-100"><tr>
        <th className={`${TH} text-left`}>GL account</th><th className={`${TH} text-left`}>Expense</th>
        <th className={`${TH} text-right`}>Committed</th><th className={`${TH} text-right`}>Spent</th>
      </tr></thead>
      <tbody>
        {lines.map((l) => (
          <tr key={`${l.gl_account}-${l.gl_description}`} className="border-b border-gray-50">
            <td className="px-3 py-2 font-mono text-[10px] text-gray-500">{l.gl_account}</td>
            <td className="px-3 py-2 text-[11px] text-gray-800">{l.gl_description}</td>
            <td className={`${NUM} text-gray-700`}>{money(l.committed)}</td>
            <td className={`${NUM} text-gray-900`}>{money(l.spent)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FundBlock({ fund }) {
  return (
    <div className="border-t border-gray-100">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 bg-gray-50 px-3 py-2 text-[11px]">
        <span className="font-semibold text-gray-900">Fund {fund.fund || '—'}</span>
        <span className="text-gray-600">Released <strong className="text-gray-900">{money(fund.released_budget)}</strong></span>
        <span className="text-gray-600">Committed <strong className="text-gray-900">{money(fund.committed)}</strong></span>
        <span className="text-gray-600">Spent <strong className="text-gray-900">{money(fund.spent)}</strong></span>
        <span className="text-gray-600">Balance <strong className={balanceTone(fund.balance)}>{money(fund.balance)}</strong></span>
        {Number(fund.bbf_budget) > 0 && (
          <span className="text-gray-500">Brought forward {money(fund.bbf_budget)} · spent {money(fund.bbf_spent)}</span>
        )}
      </div>
      <div className="overflow-x-auto"><GlTable lines={fund.gl_lines} /></div>
    </div>
  );
}

/**
 * One budget code (MIS fund center) of an activity: its totals, then each
 * fund (partner / donor) with its GL expense lines.
 *
 * @param {{ center: object }} props - center from GET /api/budget-execution/activities/:id
 * @returns {JSX.Element}
 * @example <FundCenterCard center={activity.fund_centers[0]} />
 */
export default function FundCenterCard({ center }) {
  return (
    <section className="border border-gray-200 bg-white">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="min-w-[200px] flex-1">
          <div className="font-mono text-[12px] font-semibold text-[#1A5632]">{center.fund_center}</div>
          <div className="text-[11px] text-gray-600">{center.text || center.fund_description || '—'}</div>
          {!center.in_export && <div className="mt-0.5 text-[10px] text-amber-700">Not in this export</div>}
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase text-gray-500">Balance</div>
          <div className={`text-[16px] font-bold ${balanceTone(center.balance)}`}>{money(center.balance)}</div>
          <div className="text-[10px] text-gray-500">Execution {rate(center.execution_pct)}</div>
        </div>
        <div className="w-full"><ExecutionBar totals={center} showLegend={false} /></div>
      </header>
      {center.funds.map((f) => <FundBlock key={f.fund || 'none'} fund={f} />)}
    </section>
  );
}
