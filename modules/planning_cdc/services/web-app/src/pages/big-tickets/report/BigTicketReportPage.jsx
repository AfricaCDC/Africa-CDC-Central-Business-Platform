import { Link, useParams, useSearchParams } from 'react-router-dom';
import StatusBadge from '@/components/shared/StatusBadge';
import { LoadingState, ErrorState } from '@/components/shared/QueryStates';
import { getErrorMessage } from '@/utils/errorMessage';
import BigTicketsLayout from '../BigTicketsLayout';
import { useBigTicketReport } from '../hooks/useBigTicketReportQueries';
import ReportEditor from './ReportEditor';

function ReportHeader({ ticket, report, quarter, fiscalYear }) {
  return (
    <header className="flex flex-wrap items-center gap-2 border border-gray-200 bg-white px-4 py-3">
      <span className="font-mono text-[12px] font-semibold text-[#1A5632]">{ticket.code}</span>
      <h1 className="text-[14px] font-semibold text-gray-900">{quarter} {fiscalYear} report</h1>
      {report ? <StatusBadge status={report.status} /> : <span className="text-[11px] text-gray-500">Not started</span>}
      {!!report?.imported && <span className="text-[10px] text-gray-500">Imported from PR&amp;A&apos;s consolidation</span>}
      <p className="basis-full text-[12px] text-gray-700">{ticket.title}</p>
      {report?.rejection_reason && <p className="basis-full bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">Returned by M&amp;E: {report.rejection_reason}</p>}
    </header>
  );
}

/**
 * Quarterly report of a Big Ticket (D-20261015-05). Container: loads the
 * report and hands it to the editor.
 *
 * Route: /big-tickets/:id/report/:quarter?fy=2026
 *
 * @returns {JSX.Element}
 * @example <Route path="/big-tickets/:id/report/:quarter" element={<BigTicketReportPage />} />
 */
export default function BigTicketReportPage() {
  const { id, quarter } = useParams();
  const [params] = useSearchParams();
  const fy = params.get('fy') || String(new Date().getFullYear());
  const { data, isLoading, isError, error, refetch } = useBigTicketReport(id, quarter, fy);

  if (isLoading) return <BigTicketsLayout><div className="p-4"><LoadingState /></div></BigTicketsLayout>;
  if (isError || !data) {
    return <BigTicketsLayout><div className="p-4"><ErrorState message={getErrorMessage(error, 'Could not load this report.')} onRetry={refetch} /></div></BigTicketsLayout>;
  }
  const { ticket, report } = data;

  return (
    <BigTicketsLayout crumb={`${ticket.code} · ${quarter}`}>
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
        <Link to={`/big-tickets/${ticket.id}?fy=${fy}`} className="text-[12px] text-[#1A5632] hover:underline">← {ticket.code}</Link>
        <ReportHeader ticket={ticket} report={report} quarter={quarter} fiscalYear={fy} />
        <ReportEditor key={`${report?.id || 'new'}-${report?.status || ''}`} data={data} quarter={quarter} fiscalYear={fy} />
      </div>
    </BigTicketsLayout>
  );
}
