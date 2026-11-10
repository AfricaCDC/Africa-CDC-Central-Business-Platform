import { Link } from 'react-router-dom';
import StatusBadge from '@/components/shared/StatusBadge';
import { QUARTER_OPTIONS } from '../config';
import ProgressChip from '../ProgressChip';

function ReportBody({ report, lines }) {
  const lineLabel = (id) => {
    const l = lines.find((x) => x.id === id);
    return l ? (l.label || l.indicator_code || 'Line') : 'Line';
  };
  return (
    <div className="grid gap-4 border-t border-gray-100 px-4 py-3 md:grid-cols-2">
      <div className="flex flex-col gap-1">
        <div className="text-[10px] uppercase text-gray-500">Achieved</div>
        {report.values.map((v) => (
          <div key={v.id} className="text-[12px] text-gray-800">
            {lines.length > 1 && <span className="text-gray-500">{lineLabel(v.line_id)}: </span>}
            <strong>{v.achieved || '—'}</strong>
            {v.performance_pct !== null && v.performance_pct !== undefined && <span className="text-gray-500"> · {Math.round(v.performance_pct)}%</span>}
          </div>
        ))}
      </div>
      {[['Progress', report.narrative], ['Challenges', report.challenges], ['Next steps', report.next_steps]].map(([label, text]) => (
        <div key={label}>
          <div className="text-[10px] uppercase text-gray-500">{label}</div>
          <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-gray-800">{text || '—'}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Quarterly reports of a ticket for the year, each with the link to its
 * report form (read only for users who cannot report).
 *
 * @param {{ ticketId: number, reports: object[], lines: object[], fiscalYear: string }} props
 * @returns {JSX.Element}
 * @example <TicketReports ticketId={ticket.id} reports={ticket.reports} lines={ticket.lines} fiscalYear="2026" />
 */
export default function TicketReports({ ticketId, reports, lines, fiscalYear }) {
  return (
    <section className="border border-gray-200 bg-white">
      <header className="border-b border-gray-200 bg-gray-50 px-4 py-2">
        <h2 className="text-[12px] font-semibold text-gray-900">Quarterly reports {fiscalYear}</h2>
      </header>
      {QUARTER_OPTIONS.map((q) => {
        const report = reports.find((r) => r.quarter === q);
        return (
          <div key={q} className="border-b border-gray-100 last:border-b-0">
            <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="w-8 text-[12px] font-semibold text-gray-900">{q}</span>
              {report ? (
                <>
                  <StatusBadge status={report.status} />
                  <ProgressChip status={report.progress_status} />
                  {!!report.imported && <span className="text-[10px] text-gray-500">Imported from PR&amp;A's consolidation</span>}
                </>
              ) : <span className="text-[11px] text-gray-400">No report</span>}
              <Link
                to={`/big-tickets/${ticketId}/report/${q}?fy=${fiscalYear}`}
                className="ml-auto text-[11px] font-medium text-[#1A5632] hover:underline"
              >
                {report ? 'Open report' : 'Report'}
              </Link>
            </div>
            {report && <ReportBody report={report} lines={lines} />}
          </div>
        );
      })}
    </section>
  );
}
