import { money, rate, balanceTone } from './budgetFigures';
import ExecutionBar from '@/components/budget-execution/ExecutionBar';
import { BUDGET_VARIANCE, BUDGET_VARIANCE_CONFIG } from '@rbm/lib/enums';

const TH = 'px-3 py-2 text-[10px] font-semibold uppercase text-gray-500';
const NUM = 'px-3 py-2.5 text-right text-[11px] tabular-nums text-gray-800 whitespace-nowrap';

function AmountCells({ row }) {
  return (
    <>
      <td className={NUM}>{money(row.released_budget)}</td>
      <td className={NUM}>{money(row.committed)}</td>
      <td className={NUM}>{money(row.spent)}</td>
      <td className={`${NUM} font-bold ${balanceTone(row.balance)}`}>{money(row.balance)}</td>
      <td className="w-36 px-3 py-2.5">
        <div className="mb-1 text-right text-[11px] tabular-nums text-gray-700">{rate(row.execution_pct)}</div>
        <ExecutionBar totals={row} showLegend={false} />
      </td>
    </>
  );
}

/** Over budget / slow execution flag of an activity (D-20261105-13). */
function VarianceChip({ row }) {
  const cfg = BUDGET_VARIANCE_CONFIG[row.variance];
  if (!cfg) return null;
  const why = row.variance === BUDGET_VARIANCE.UNDER ? `${row.expected_pct} % of the year has passed` : 'More committed and spent than released';
  return <span title={why} className={`ml-2 inline-block border px-1.5 py-0.5 text-[9px] font-semibold ${cfg.bg} ${cfg.text} ${cfg.border}`}>{cfg.label}</span>;
}

const AMOUNT_HEADERS = (
  <>
    <th className={`${TH} text-right`}>Released</th>
    <th className={`${TH} text-right`}>Committed</th>
    <th className={`${TH} text-right`}>Spent</th>
    <th className={`${TH} text-right`}>Balance</th>
    <th className={`${TH} text-right`}>Execution</th>
  </>
);

/**
 * Execution per business unit; a click shows that unit's activities.
 *
 * @param {{ divisions: object[], onSelect: (code: string) => void }} props
 * @returns {JSX.Element}
 * @example <DivisionsTable divisions={summary.divisions} onSelect={(c) => setFilter('bu', c)} />
 */
export function DivisionsTable({ divisions, onSelect }) {
  return (
    <section className="border border-gray-200 bg-white">
      <header className="border-b border-gray-200 bg-gray-50 px-4 py-2">
        <h2 className="text-[12px] font-semibold text-gray-900">By business unit</h2>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead className="border-b border-gray-200"><tr><th className={`${TH} text-left`}>Business unit</th><th className={`${TH} text-right`}>Activities</th>{AMOUNT_HEADERS}</tr></thead>
          <tbody>
            {divisions.map((d) => (
              <tr key={d.division_code || 'none'} onClick={() => d.division_code && onSelect(d.division_code)}
                className="cursor-pointer border-b border-gray-100 hover:bg-[#F2F7F3]">
                <td className="px-3 py-2.5 text-[11px]"><span className="font-semibold text-gray-900">{d.division_code || 'Not set'}</span> <span className="text-gray-500">{d.division_name}</span></td>
                <td className={NUM}>{d.activity_count}</td>
                <AmountCells row={d} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Execution per broad activity; a click opens the broad activity, with its budget lines.
 *
 * @param {{ items: object[], onOpen: (id: number) => void }} props
 * @returns {JSX.Element}
 * @example <ActivitiesTable items={items} onOpen={(id) => navigate(`/plan/node/${id}`)} />
 */
export function ActivitiesTable({ items, onOpen }) {
  return (
    <section className="border border-gray-200 bg-white">
      <header className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2">
        <h2 className="text-[12px] font-semibold text-gray-900">Activities</h2>
        <span className="text-[11px] text-gray-500">{items.length} shown · click a row for the budget lines</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead className="border-b border-gray-200"><tr><th className={`${TH} text-left`}>Code</th><th className={`${TH} text-left`}>Activity</th><th className={`${TH} text-left`}>BU</th>{AMOUNT_HEADERS}</tr></thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} onClick={() => onOpen(a.id)} className="cursor-pointer border-b border-gray-100 align-top hover:bg-[#F2F7F3]">
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] font-semibold text-[#1A5632]">{a.code}</td>
                <td className="px-3 py-2.5 text-[11px] leading-snug text-gray-900">
                  {a.title}<VarianceChip row={a} />
                  <span className="mt-0.5 block text-[10px] text-gray-500">
                    {a.fund_centers.map((c) => c.fund_center).join(', ')}
                    {a.fund_centers.length > 1 ? ` · ${a.fund_centers.length} budget codes` : ''}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-[11px] text-gray-600">{a.division_code}</td>
                <AmountCells row={a} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
