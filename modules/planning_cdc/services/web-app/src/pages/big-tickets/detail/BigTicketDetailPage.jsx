import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { RBAC_MODULES, RBAC_ACTIONS } from '@rbm/lib/rbac';
import { usePermissions } from '@/hooks/usePermissions';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { LoadingState, ErrorState } from '@/components/shared/QueryStates';
import { getErrorMessage } from '@/utils/errorMessage';
import { useBigTicket, useDeleteBigTicket } from '../hooks/useBigTicketQueries';
import TicketHeader from './TicketHeader';
import TicketLinesTable from './TicketLinesTable';
import TicketReports from './TicketReports';
import BigTicketsLayout from '../BigTicketsLayout';

const SCOPE_ALL = 'all';

/**
 * Big Ticket detail (D-20261015-02): identity, business units, indicator
 * lines with the targets of the year, quarterly reports of the year.
 *
 * Route: /big-tickets/:id?fy=2026
 *
 * @returns {JSX.Element}
 * @example <Route path="/big-tickets/:id" element={<BigTicketDetailPage />} />
 */
export default function BigTicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const fy = params.get('fy') || String(new Date().getFullYear());
  const { data: ticket, isLoading, isError, error, refetch } = useBigTicket(id, fy);
  const remove = useDeleteBigTicket();
  const { getScope } = usePermissions();
  const [isConfirmOpen, setConfirmOpen] = useState(false);

  if (isLoading) return <BigTicketsLayout><div className="p-4"><LoadingState /></div></BigTicketsLayout>;
  if (isError || !ticket) {
    return <BigTicketsLayout><div className="p-4"><ErrorState message={getErrorMessage(error, 'Could not load this Big Ticket.')} onRetry={refetch} /></div></BigTicketsLayout>;
  }

  const handleDelete = async () => {
    try {
      await remove.mutateAsync(ticket.id);
      toast.success(`${ticket.code} deleted`);
      navigate(`/big-tickets?fy=${fy}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not delete this Big Ticket.'));
      setConfirmOpen(false);
    }
  };

  return (
    <BigTicketsLayout crumb={ticket.code}>
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <Link to={`/big-tickets?fy=${fy}`} className="text-[12px] text-[#1A5632] hover:underline">← Big Tickets</Link>
      <TicketHeader
        ticket={ticket}
        fiscalYear={fy}
        canEdit={getScope(RBAC_MODULES.BIG_TICKET, RBAC_ACTIONS.UPDATE) === SCOPE_ALL}
        canDelete={getScope(RBAC_MODULES.BIG_TICKET, RBAC_ACTIONS.DELETE) === SCOPE_ALL}
        onYearChange={(year) => setParams({ fy: year }, { replace: true })}
        onDelete={() => setConfirmOpen(true)}
      />
      <TicketLinesTable lines={ticket.lines} fiscalYear={fy} />
      <TicketReports ticketId={ticket.id} reports={ticket.reports} lines={ticket.lines} fiscalYear={fy} />
      <ConfirmDialog
        open={isConfirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        variant="danger"
        title={`Delete ${ticket.code}?`}
        description="The ticket, its indicator lines, targets and every quarterly report are deleted. This cannot be undone."
        confirmLabel={remove.isPending ? 'Deleting…' : 'Delete'}
      />
    </div>
    </BigTicketsLayout>
  );
}
