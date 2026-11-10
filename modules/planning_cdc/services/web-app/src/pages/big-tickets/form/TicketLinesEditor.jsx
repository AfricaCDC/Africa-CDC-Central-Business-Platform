import { useDeferredValue, useId } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { TIERS } from '@rbm/lib/enums';
import { useIndicatorOptions } from '../hooks/useBigTicketQueries';
import { QUARTER_KEYS } from '../config';

const INPUT = 'w-full border border-gray-300 px-2 py-1.5 text-[11px] focus:border-[#1A5632] focus:outline-none';
// Stored as "Tier 4", the wording of the PR&A consolidation.
const TIER_OPTIONS = Object.values(TIERS).map((t) => ({ value: `Tier ${t.id}`, label: `Tier ${t.id} — ${t.full}` }));

function IndicatorPicker({ value, onChange, fiscalYear }) {
  const listId = useId();
  const term = useDeferredValue(value);
  const { data: options = [] } = useIndicatorOptions(fiscalYear, term);
  const match = options.find((o) => o.code === value);
  return (
    <div>
      <input list={listId} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Type a code, e.g. KM.10.3-2" className={INPUT} />
      <datalist id={listId}>
        {options.map((o) => <option key={o.id} value={o.code}>{o.title}</option>)}
      </datalist>
      <div className="mt-0.5 text-[10px] leading-snug">
        {match && <span className="text-gray-600">{match.title}</span>}
        {!match && value && <span className="text-gray-500">Not in the {fiscalYear} PIRS: kept as a Big Ticket indicator</span>}
      </div>
    </div>
  );
}

function TargetPair({ label, text, numeric, onText, onNumeric }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-gray-500">{label}</span>
      <input value={text} onChange={(e) => onText(e.target.value)} placeholder="Text" className={INPUT} aria-label={`${label} (text)`} />
      <input type="number" min="0" step="any" value={numeric} onChange={(e) => onNumeric(e.target.value)} placeholder="Number" className={INPUT} aria-label={`${label} (number)`} />
    </div>
  );
}

/**
 * Indicator lines of a ticket with the target and milestones of one year.
 *
 * @param {{ lines: object[], fiscalYear: string, onAdd: Function, onRemove: Function,
 *   onLine: (key: string, field: string, value: string) => void,
 *   onTarget: (key: string, field: string, value: string) => void }} props
 * @returns {JSX.Element}
 * @example <TicketLinesEditor lines={form.lines} fiscalYear="2026" onAdd={addLine} onRemove={removeLine} onLine={setLine} onTarget={setTarget} />
 */
export default function TicketLinesEditor({ lines, fiscalYear, onAdd, onRemove, onLine, onTarget }) {
  return (
    <section className="border border-gray-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2">
        <h2 className="text-[12px] font-semibold text-gray-900">Indicator lines · targets {fiscalYear}</h2>
        <button type="button" onClick={onAdd} className="flex items-center gap-1 border border-[#1A5632] px-2.5 py-1 text-[11px] text-[#1A5632] hover:bg-[#F2F7F3]">
          <Plus className="h-3 w-3" aria-hidden="true" /> Add line
        </button>
      </header>
      {lines.map((l, i) => (
        <fieldset key={l.key} className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
          <legend className="sr-only">Line {i + 1}</legend>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_110px_auto]">
            <label className="flex flex-col gap-1 text-[10px] text-gray-500">Line label (optional)
              <input value={l.label} onChange={(e) => onLine(l.key, 'label', e.target.value)} placeholder="e.g. Long-term training" className={INPUT} />
            </label>
            <div className="flex flex-col gap-1 text-[10px] text-gray-500">PIRS indicator code
              <IndicatorPicker value={l.indicator_code} fiscalYear={fiscalYear} onChange={(v) => onLine(l.key, 'indicator_code', v)} />
            </div>
            <label className="flex flex-col gap-1 text-[10px] text-gray-500">Tier
              <select value={l.tier} onChange={(e) => onLine(l.key, 'tier', e.target.value)} className={INPUT}>
                <option value="">—</option>
                {TIER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={() => onRemove(l.key)}
              disabled={lines.length === 1}
              aria-label={`Remove line ${i + 1}`}
              className="self-end border border-gray-200 p-2 text-gray-500 hover:text-red-700 disabled:opacity-30"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <TargetPair
              label={`Annual target ${fiscalYear}`}
              text={l.target.annual_target} numeric={l.target.annual_target_numeric}
              onText={(v) => onTarget(l.key, 'annual_target', v)} onNumeric={(v) => onTarget(l.key, 'annual_target_numeric', v)}
            />
            {QUARTER_KEYS.map((q) => (
              <TargetPair
                key={q}
                label={`${q.toUpperCase()} milestone`}
                text={l.target[`${q}_milestone`]} numeric={l.target[`${q}_milestone_numeric`]}
                onText={(v) => onTarget(l.key, `${q}_milestone`, v)} onNumeric={(v) => onTarget(l.key, `${q}_milestone_numeric`, v)}
              />
            ))}
          </div>
        </fieldset>
      ))}
      <p className="px-4 pb-3 text-[10px] text-gray-500">
        The number is used to compute performance; the text is what people read. Leave the number empty for a qualitative target.
      </p>
    </section>
  );
}
