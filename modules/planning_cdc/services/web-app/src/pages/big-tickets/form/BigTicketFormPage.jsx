import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { RBAC_MODULES, RBAC_ACTIONS } from '@rbm/lib/rbac';
import { usePermissions } from '@/hooks/usePermissions';
import { usePillars } from '@/hooks/usePillars';
import { useDivisionCodes } from '@/hooks/useMiscQueries';
import { LoadingState, ErrorState } from '@/components/shared/QueryStates';
import { getErrorMessage } from '@/utils/errorMessage';
import { useBigTicket, useCreateBigTicket, useUpdateBigTicket } from '../hooks/useBigTicketQueries';
import { YEAR_OPTIONS } from '../config';
import { useTicketForm, initialForm, toPayload, validateForm } from './useTicketForm';
import TicketGeneralFields from './TicketGeneralFields';
import TicketLinesEditor from './TicketLinesEditor';
import BigTicketsLayout from '../BigTicketsLayout';

const SCOPE_ALL = 'all';

function TicketForm({ ticket, fiscalYear, onYearChange }) {
  const navigate = useNavigate();
  const isEdit = !!ticket;
  const { form, setField, toggleContributor, addLine, removeLine, setLine, setTarget } = useTicketForm(initialForm(ticket, fiscalYear));
  const { data: pillars = [] } = usePillars();
  const { data: divisions = [] } = useDivisionCodes();
  const create = useCreateBigTicket();
  const update = useUpdateBigTicket();
  const [errors, setErrors] = useState([]);
  const isSaving = create.isPending || update.isPending;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validateForm(form, fiscalYear);
    setErrors(found);
    if (found.length) return;
    try {
      const payload = toPayload(form, fiscalYear);
      const saved = isEdit ? await update.mutateAsync({ id: ticket.id, payload }) : await create.mutateAsync(payload);
      toast.success(isEdit ? `${payload.code.toUpperCase()} saved` : `${payload.code.toUpperCase()} created`);
      navigate(`/big-tickets/${isEdit ? ticket.id : saved.id}?fy=${fiscalYear}`);
    } catch (err) {
      setErrors([getErrorMessage(err, 'Could not save this Big Ticket.')]);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <TicketGeneralFields form={form} isEdit={isEdit} pillars={pillars} divisions={divisions} onField={setField} onToggleContributor={toggleContributor} />
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
        <label htmlFor="targets-year">Targets of year</label>
        <select id="targets-year" value={fiscalYear} onChange={(e) => onYearChange(e.target.value)} className="border border-gray-300 px-2 py-1 text-[11px] focus:border-[#1A5632] focus:outline-none">
          {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {isEdit && <span className="text-[10px] text-gray-500">Switching year reloads the form: save first.</span>}
      </div>
      <TicketLinesEditor lines={form.lines} fiscalYear={fiscalYear} onAdd={addLine} onRemove={removeLine} onLine={setLine} onTarget={setTarget} />
      {errors.length > 0 && (
        <div role="alert" className="border border-red-200 bg-red-50 px-4 py-2 text-[12px] text-red-800">
          {errors.map((m) => <div key={m}>{m}</div>)}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Link to={isEdit ? `/big-tickets/${ticket.id}?fy=${fiscalYear}` : '/big-tickets'} className="border border-gray-300 bg-white px-4 py-2 text-[12px] text-gray-700 hover:bg-gray-50">Cancel</Link>
        <button type="submit" disabled={isSaving} className="bg-[#1A5632] px-4 py-2 text-[12px] text-white hover:bg-[#15472a] disabled:opacity-50">
          {isSaving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create Big Ticket')}
        </button>
      </div>
    </form>
  );
}

function PageShell({ backTo, title, children }) {
  return (
    <BigTicketsLayout crumb={title}>
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <Link to={backTo} className="text-[12px] text-[#1A5632] hover:underline">← Back</Link>
      <h1 className="text-[18px] font-semibold text-gray-900">{title}</h1>
      {children}
    </div>
    </BigTicketsLayout>
  );
}

function EditTicket({ id, fiscalYear, onYearChange }) {
  const { data: ticket, isLoading, isPlaceholderData, isError, error, refetch } = useBigTicket(id, fiscalYear);
  // The previous year's data must never seed the form of another year.
  if (isLoading || isPlaceholderData) return <LoadingState />;
  if (isError) return <ErrorState message={getErrorMessage(error, 'Could not load this Big Ticket.')} onRetry={refetch} />;
  return <TicketForm key={`${id}-${fiscalYear}`} ticket={ticket} fiscalYear={fiscalYear} onYearChange={onYearChange} />;
}

/**
 * Create or edit a Big Ticket (D-20261015-02): identity, business units,
 * years, indicator lines and their targets for one year.
 *
 * Routes: /big-tickets/new, /big-tickets/:id/edit?fy=2026
 *
 * @returns {JSX.Element}
 * @example <Route path="/big-tickets/:id/edit" element={<BigTicketFormPage />} />
 */
export default function BigTicketFormPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const fiscalYear = params.get('fy') || String(new Date().getFullYear());
  const { getScope } = usePermissions();
  const action = id ? RBAC_ACTIONS.UPDATE : RBAC_ACTIONS.CREATE;
  const handleYearChange = (year) => setParams({ fy: year }, { replace: true });

  if (getScope(RBAC_MODULES.BIG_TICKET, action) !== SCOPE_ALL) {
    return <BigTicketsLayout><div className="p-4"><ErrorState message="You do not have permission to manage Big Tickets." /></div></BigTicketsLayout>;
  }
  if (!id) {
    return (
      <PageShell backTo="/big-tickets" title="New Big Ticket">
        <TicketForm key="new" ticket={null} fiscalYear={fiscalYear} onYearChange={handleYearChange} />
      </PageShell>
    );
  }
  return (
    <PageShell backTo={`/big-tickets/${id}?fy=${fiscalYear}`} title="Edit Big Ticket">
      <EditTicket id={id} fiscalYear={fiscalYear} onYearChange={handleYearChange} />
    </PageShell>
  );
}
