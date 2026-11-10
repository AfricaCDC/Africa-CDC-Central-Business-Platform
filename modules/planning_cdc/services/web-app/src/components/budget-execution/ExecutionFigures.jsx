import { FIGURES, RATES, money, rate, balanceTone } from './budgetFigures';

/**
 * Key figures of a budget execution, balance first and largest: balance,
 * released, committed, spent, then the two rates. Each figure carries its
 * one-line definition so nobody has to guess what it means.
 *
 * @param {{ totals: object }} props - totals: released_budget, committed, spent, balance, execution_pct, spend_pct
 * @returns {JSX.Element}
 * @example <ExecutionFigures totals={data.totals} />
 */
export default function ExecutionFigures({ totals }) {
  const [balance, ...amounts] = FIGURES;
  return (
    <div className="grid grid-cols-2 border border-gray-200 bg-white md:grid-cols-4 lg:grid-cols-7">
      <div className="col-span-2 border-b border-gray-200 bg-[#F2F7F3] px-4 py-3 md:col-span-4 lg:col-span-2 lg:border-b-0 lg:border-r">
        <div className="text-[10px] font-semibold uppercase text-gray-600">{balance.label}</div>
        <div className={`mt-1 text-[26px] font-bold leading-none ${balanceTone(totals.balance)}`}>{money(totals.balance)}</div>
        <div className="mt-1.5 text-[10px] text-gray-500">{balance.help}</div>
      </div>
      {amounts.map((f) => (
        <div key={f.key} className="border-b border-r border-gray-200 px-4 py-3 lg:border-b-0" title={f.help}>
          <div className="text-[10px] font-semibold uppercase text-gray-500">{f.label}</div>
          <div className="mt-1 text-[18px] font-bold leading-none text-gray-900">{money(totals[f.key])}</div>
          <div className="mt-1.5 text-[9px] text-gray-400">{f.help}</div>
        </div>
      ))}
      {RATES.map((r) => (
        <div key={r.key} className="border-r border-gray-200 px-4 py-3 last:border-r-0" title={r.help}>
          <div className="text-[10px] font-semibold uppercase text-gray-500">{r.label}</div>
          <div className="mt-1 text-[18px] font-bold leading-none text-gray-900">{rate(totals[r.key])}</div>
          <div className="mt-1.5 text-[9px] text-gray-400">{r.help}</div>
        </div>
      ))}
    </div>
  );
}
