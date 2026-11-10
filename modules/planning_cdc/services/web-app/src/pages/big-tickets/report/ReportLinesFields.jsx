const INPUT = 'w-full border border-gray-300 px-2 py-1.5 text-[12px] focus:border-[#1A5632] focus:outline-none disabled:bg-gray-50';

/**
 * Achieved value per indicator line: text as reported, number for the
 * performance, the annual target, and the indicator reports when linked.
 *
 * @param {{ lines: object[], values: object, prefill: object, isReadOnly: boolean, onValue: (lineId: number, key: string, value: string) => void }} props
 * @returns {JSX.Element}
 * @example <ReportLinesFields lines={ticket.lines} values={form.values} prefill={prefill} isReadOnly={false} onValue={setValue} />
 */
export default function ReportLinesFields({ lines, values, prefill, isReadOnly, onValue }) {
  return (
    <section className="border border-gray-200 bg-white">
      <header className="border-b border-gray-200 bg-gray-50 px-4 py-2">
        <h2 className="text-[12px] font-semibold text-gray-900">Achieved</h2>
      </header>
      {lines.map((line) => {
        const v = values[line.id] || { achieved: '', achieved_numeric: '' };
        const reported = prefill?.[line.id]?.quarters || [];
        return (
          <div key={line.id} className="grid gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_220px_140px]">
            <div className="text-[11px] text-gray-700">
              <div className="font-semibold text-gray-900">{line.label || line.indicator_code || 'Line'}</div>
              <div className="mt-0.5 text-gray-500">Target: {line.target?.annual_target || '—'}</div>
              {!!reported.length && (
                <div className="mt-0.5 text-[10px] text-gray-500">
                  Indicator reports: {reported.map((r) => `${r.quarter} ${r.value}`).join(' · ')}
                </div>
              )}
            </div>
            <label className="flex flex-col gap-1 text-[10px] text-gray-500">Achieved (as reported)
              <input value={v.achieved} disabled={isReadOnly} onChange={(e) => onValue(line.id, 'achieved', e.target.value)} placeholder="e.g. 27 MS (49%)" className={INPUT} />
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-gray-500">Number
              <input type="number" min="0" step="any" value={v.achieved_numeric} disabled={isReadOnly} onChange={(e) => onValue(line.id, 'achieved_numeric', e.target.value)} className={INPUT} />
            </label>
          </div>
        );
      })}
    </section>
  );
}
