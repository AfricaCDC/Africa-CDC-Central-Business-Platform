import { useState } from 'react';

const day = (d) => String(d || '').slice(0, 10);

/**
 * Delegations as rows: person, dates, reason, and « End » (asks to
 * confirm) when `onEnd` is given.
 *
 * @param {{ title: string, empty: string, rows: object[], who: (d: object) => string,
 *   onEnd?: (id: number) => void, isEnding?: boolean }} props
 * @returns {JSX.Element}
 * @example <DelegationList title="Your delegations" empty="None." rows={given} who={(d) => d.delegate_name} />
 */
export default function DelegationList({ title, empty, rows, who, onEnd, isEnding }) {
  const [confirmId, setConfirmId] = useState(null);
  return (
    <section className="border border-gray-200 bg-white">
      <h2 className="border-b border-gray-200 px-5 py-2.5 text-[12px] font-semibold text-gray-900">{title}</h2>
      {!rows.length && <p className="px-5 py-3 text-[11px] text-gray-500">{empty}</p>}
      <ul className="divide-y divide-gray-100">
        {rows.map((d) => (
          <li key={d.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[12px] text-gray-900">{who(d)}</p>
              <p className="text-[11px] text-gray-600">{day(d.starts_on)} to {day(d.ends_on)}{d.reason ? ` · ${d.reason}` : ''}</p>
            </div>
            {onEnd && (confirmId === d.id ? (
              <span className="flex gap-2">
                <button type="button" disabled={isEnding} onClick={() => onEnd(d.id)}
                  className="border border-red-700 px-3 py-1 text-[11px] font-semibold text-red-700 disabled:opacity-50">Confirm end</button>
                <button type="button" onClick={() => setConfirmId(null)} className="px-2 py-1 text-[11px] text-gray-600">Keep</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmId(d.id)} className="border border-gray-300 px-3 py-1 text-[11px] text-gray-700 hover:bg-gray-50">End</button>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
