import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { pillarShort, pillarTitle, yearsLabel } from '../config';

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div className="mt-0.5 text-[12px] leading-relaxed text-gray-900">{children || '—'}</div>
    </div>
  );
}

/** Years the ticket runs over, open-ended tickets up to next year. */
function ticketYears(ticket) {
  const last = Number(ticket.end_year || new Date().getFullYear() + 1);
  const years = [];
  for (let y = Number(ticket.start_year); y <= last; y++) years.push(String(y));
  return [...new Set([...years, ...ticket.years])].sort();
}

const leadLabel = (t) => (t.lead_division_name ? `${t.lead_division_name} (${t.lead_division_code})` : t.lead_division_code);
const contributorsLabel = (t) => [...t.contributors.map((c) => c.division_code), t.contributors_note].filter(Boolean).join(' · ');

/**
 * Identity block of a Big Ticket with the year selector and the edit / delete actions.
 *
 * @param {{ ticket: object, fiscalYear: string, canEdit: boolean, canDelete: boolean,
 *   onYearChange: (year: string) => void, onDelete: () => void }} props
 * @returns {JSX.Element}
 * @example <TicketHeader ticket={ticket} fiscalYear="2026" canEdit canDelete={false} onYearChange={setYear} onDelete={askDelete} />
 */
export default function TicketHeader({ ticket, fiscalYear, canEdit, canDelete, onYearChange, onDelete }) {
  return (
    <section className="flex flex-col gap-3 border border-gray-200 bg-white px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] font-bold text-[#1A5632]">{ticket.code}</span>
        <span className="bg-[#1A5632] px-1.5 py-0.5 text-[10px] font-bold text-white">{pillarShort(ticket.pillar_name)}</span>
        <span className="text-[11px] text-gray-600">{pillarTitle(ticket.pillar_name)}</span>
        {!ticket.is_active && <span className="bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">Inactive</span>}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-gray-600">Year
            <select value={fiscalYear} onChange={(e) => onYearChange(e.target.value)} className="border border-gray-300 px-2 py-1 text-[11px] focus:border-[#1A5632] focus:outline-none">
              {ticketYears(ticket).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          {canEdit && (
            <Link to={`/big-tickets/${ticket.id}/edit?fy=${fiscalYear}`} className="flex items-center gap-1 border border-gray-300 px-2.5 py-1 text-[11px] text-gray-700 hover:bg-gray-50">
              <Pencil className="h-3 w-3" aria-hidden="true" /> Edit
            </Link>
          )}
          {canDelete && (
            <button type="button" onClick={onDelete} className="flex items-center gap-1 border border-red-200 px-2.5 py-1 text-[11px] text-red-700 hover:bg-red-50">
              <Trash2 className="h-3 w-3" aria-hidden="true" /> Delete
            </button>
          )}
        </span>
      </div>
      <h1 className="text-[17px] font-semibold leading-snug text-gray-900">{ticket.title}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Lead BU">{leadLabel(ticket)}</Field>
        <Field label="Contributing BUs">{contributorsLabel(ticket)}</Field>
        <Field label="Years">{yearsLabel(ticket)}</Field>
        <Field label="Expected result">{ticket.expected_result}</Field>
      </div>
      {(ticket.delivery_model || ticket.success_factors) && (
        <details className="border-t border-gray-100 pt-2">
          <summary className="cursor-pointer text-[11px] text-[#1A5632]">Delivery model and success factors</summary>
          <div className="mt-2 grid gap-4 md:grid-cols-2">
            <Field label="Delivery model">{ticket.delivery_model}</Field>
            <Field label="Success factors">{ticket.success_factors}</Field>
          </div>
        </details>
      )}
    </section>
  );
}
