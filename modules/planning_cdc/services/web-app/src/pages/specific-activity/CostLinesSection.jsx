import { Plus, Trash2 } from 'lucide-react';
import { fmtBudget } from '@rbm/lib/formatters';
import { useExpenseCategories } from './hooks/useActivityPlanningQueries';
import { emptyLine } from './hooks/useActivityPlanningForm';

const INPUT = 'w-full text-[12px] border border-gray-300 px-2 py-1.5 focus:outline-none focus:border-[#D97706]';
const money = (v) => fmtBudget(Number(v) || 0, { fallback: '$0' });

function Select({ value, onChange, options, label, disabled }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT} disabled={disabled} aria-label={label}>
      <option value="">— Choose —</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function LineRow({ line, places, categories, categoriesLoading, onSet, onRemove }) {
  const cell = 'px-2 py-1.5';
  return (
    <tr className="border-b border-gray-100">
      {places.length > 1 && (
        <td className={cell}>
          <Select value={line.place} onChange={(v) => onSet('place', v)} label="Place" options={places.map((p) => ({ value: p, label: p }))} />
        </td>
      )}
      <td className={cell}>
        <Select value={line.expense_category_id} onChange={(v) => onSet('expense_category_id', v)} label="Expense category"
          disabled={categoriesLoading} options={categories.map((c) => ({ value: c.id, label: c.name }))} />
      </td>
      <td className={cell}>
        <input value={line.description} onChange={(e) => onSet('description', e.target.value)} maxLength={255} placeholder="What you will pay for" className={INPUT} aria-label="Description" />
      </td>
      <td className={cell}>
        <input type="number" min="0" step="1" value={line.amount} onChange={(e) => onSet('amount', e.target.value)} className={`${INPUT} text-right`} aria-label="Amount" />
      </td>
      <td className={`${cell} text-center`}>
        <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-700" aria-label="Remove line">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

function LinesTable({ lines, places, total, onChange }) {
  const { data: categories = [], isLoading } = useExpenseCategories();
  const setLine = (key, field, v) => onChange(lines.map((l) => (l.key === key ? { ...l, [field]: v } : l)));
  const byPlace = places.length > 1;
  return (
    <div className="overflow-x-auto border border-gray-200">
      <table className="w-full min-w-[640px]">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr className="text-left text-[10px] font-semibold uppercase text-gray-500">
            {byPlace && <th className="w-40 px-2 py-2">Place</th>}
            <th className="w-56 px-2 py-2">Expense category</th><th className="px-2 py-2">Description</th>
            <th className="w-36 px-2 py-2 text-right">Amount</th><th className="w-10" aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <LineRow key={l.key} line={l} places={places} categories={categories} categoriesLoading={isLoading}
              onSet={(field, v) => setLine(l.key, field, v)} onRemove={() => onChange(lines.filter((x) => x.key !== l.key))} />
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 text-[11px] font-semibold text-gray-900">
            <td className="px-2 py-2" colSpan={byPlace ? 3 : 2}>Total</td><td className="px-2 py-2 text-right tabular-nums">{money(total)}</td><td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * What the activity plans to pay, line by line: an expense category (first
 * column of the cost catalogue), a description and an amount (D-20261026-01).
 * Shows the total and offers to use it as the total cost of the activity.
 * With several places (D-20261028-01) each line names its place and the total
 * of each place is shown: it becomes the budget of that place's activity.
 *
 * @param {{ lines: object[], onChange: (lines: object[]) => void, total: number, budget: string|number, onUseTotal: (total: number) => void, places?: string[], totalFor?: (place: string) => number }} props
 * @returns {JSX.Element}
 * @example <CostLinesSection lines={plan.lines} onChange={plan.setLines} total={plan.total} budget={form.budget_main} onUseTotal={(t) => set('budget_main', String(t))} />
 */
export default function CostLinesSection({ lines, onChange, total, budget, onUseTotal, places = [], totalFor }) {
  const { isError } = useExpenseCategories();
  const byPlace = places.length > 1;
  const differs = !byPlace && lines.length > 0 && Math.round(total) !== Math.round(Number(budget) || 0);
  const addLine = () => onChange([...lines, { ...emptyLine(), place: byPlace ? places[0] : '' }]);

  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Cost breakdown by expense category (USD)</label>
      <p className="mb-2 text-[10px] text-gray-500">
        What you plan to pay: one line per expense (for example 3 return tickets to Nairobi, venue hire for 2 days).
        {byPlace && ' Several places: give each line its place; each place becomes its own activity with the total of its lines.'}
      </p>
      {isError && <p className="text-[11px] text-red-700">The expense categories could not be loaded. Reload the page.</p>}
      {lines.length > 0 && <LinesTable lines={lines} places={places} total={total} onChange={onChange} />}
      {byPlace && (
        <p className="mt-2 text-[11px] text-gray-700">
          Budget per activity: {places.map((p) => `${p} ${money(totalFor(p))}`).join(' · ')}
        </p>
      )}
      <button type="button" onClick={addLine} className="mt-2 flex items-center gap-1 text-[11px] font-medium text-[#1A5632] hover:underline">
        <Plus className="h-3.5 w-3.5" /> Add a cost line
      </button>
      {differs && (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          The lines add up to {money(total)}, the total cost of the activity is {money(budget)}.
          <button type="button" onClick={() => onUseTotal(total)} className="font-semibold underline">Use {money(total)} as total cost</button>
        </div>
      )}
    </div>
  );
}
