import { Link } from 'react-router-dom';
import { QUARTER_KEYS } from '../config';

const milestoneOf = (target, q) => (target ? target[`${q}_milestone`] : null);

/**
 * Indicator lines of a ticket with the target and Q1–Q4 milestones of the year.
 *
 * @param {{ lines: object[], fiscalYear: string }} props
 * @returns {JSX.Element}
 * @example <TicketLinesTable lines={ticket.lines} fiscalYear="2026" />
 */
export default function TicketLinesTable({ lines, fiscalYear }) {
  return (
    <section className="border border-gray-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2">
        <h2 className="text-[12px] font-semibold text-gray-900">Indicator lines · targets {fiscalYear}</h2>
        <span className="text-[10px] text-gray-500">A line with a PIRS code follows that indicator year by year; the others are Big Ticket indicators</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-[11px]">
          <thead>
            <tr className="text-left text-[10px] uppercase text-gray-500">
              <th className="px-4 py-2 font-medium">Line</th>
              <th className="px-2 py-2 font-medium">Indicator</th>
              <th className="px-2 py-2 font-medium">Annual target</th>
              {QUARTER_KEYS.map((q) => <th key={q} className="px-2 py-2 font-medium">{q.toUpperCase()} milestone</th>)}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t border-gray-100 align-top">
                <td className="px-4 py-2 text-gray-900">{l.label || '—'}{l.tier && <span className="ml-1 text-[10px] text-gray-500">{l.tier}</span>}</td>
                <td className="px-2 py-2">
                  {l.indicator && <Link to={`/plan/node/${l.indicator.id}`} className="text-[#1A5632] underline" title={l.indicator.title}>{l.indicator_code}</Link>}
                  {!l.indicator && (
                    <span className="text-gray-700" title={l.source_indicator || undefined}>
                      {l.indicator_code || l.label || '—'}
                      <span className="ml-1.5 bg-gray-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-gray-500">Big Ticket indicator</span>
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-gray-800">{l.target?.annual_target || <span className="text-gray-400">To set</span>}</td>
                {QUARTER_KEYS.map((q) => (
                  <td key={q} className="px-2 py-2 text-gray-700">{milestoneOf(l.target, q) || <span className="text-gray-300">—</span>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
