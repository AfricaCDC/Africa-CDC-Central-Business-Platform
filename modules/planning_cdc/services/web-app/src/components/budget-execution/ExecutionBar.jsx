import { money } from './budgetFigures';

const SEGMENTS = [
  { key: 'spent', label: 'Spent', color: 'bg-[#1A5632]' },
  { key: 'committed', label: 'Committed', color: 'bg-[#E8A838]' },
  { key: 'balance', label: 'Balance', color: 'bg-[#CFE3D4]' },
];

/**
 * How the released budget is used: spent, committed, balance, as one bar
 * (100 % = released). An overspent budget shows in red with the overrun.
 *
 * @param {{ totals: object, showLegend?: boolean }} props
 * @returns {JSX.Element}
 * @example <ExecutionBar totals={activity} />
 */
export default function ExecutionBar({ totals, showLegend = true }) {
  const released = Number(totals.released_budget) || 0;
  const used = (Number(totals.spent) || 0) + (Number(totals.committed) || 0);
  const overspent = Number(totals.balance) < 0;
  const base = Math.max(released, used) || 1;
  const width = (v) => `${Math.max(0, (Number(v) || 0) / base) * 100}%`;

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden bg-gray-100" role="img"
        aria-label={`Spent ${money(totals.spent)}, committed ${money(totals.committed)}, balance ${money(totals.balance)} of ${money(released)} released`}>
        {SEGMENTS.map((s) => (s.key === 'balance' && overspent ? null : <div key={s.key} className={s.color} style={{ width: width(totals[s.key]) }} />))}
      </div>
      {overspent && <div className="mt-1 text-[10px] font-semibold text-red-700">Overspent by {money(-totals.balance)}</div>}
      {showLegend && (
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-600">
          {SEGMENTS.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 ${s.color}`} />{s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
