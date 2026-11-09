import { useState } from 'react';
import { toast } from 'sonner';
import { STATUSES } from '@rbm/lib/enums';
import Modal from '@/components/shared/Modal';
import { getErrorMessage } from '@/utils/errorMessage';
import { PROGRESS_OPTIONS } from '../config';
import { useSaveBigTicketReport, useDecideBigTicketReport } from '../hooks/useBigTicketReportQueries';
import ReportLinesFields from './ReportLinesFields';
import { initialForm, toPayload } from './reportForm';

const INPUT = 'w-full border border-gray-300 px-2 py-1.5 text-[12px] focus:border-[#1A5632] focus:outline-none disabled:bg-gray-50';
const BTN = 'px-3 py-1.5 text-[11px] font-medium disabled:opacity-50';
const OPEN = [STATUSES.DRAFT, STATUSES.REJECTED];
const TEXTS = [['narrative', 'Progress (narration)', 5], ['challenges', 'Challenges', 3], ['next_steps', 'Next steps', 3]];

function ReportActions({ canChange, canReview, isOpen, isSubmitted, isPending, onSave, onApprove, onReturn }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canChange && isOpen && (
        <>
          <button type="button" disabled={isPending} onClick={() => onSave(false)} className={`${BTN} border border-gray-300 bg-white text-gray-800 hover:bg-gray-50`}>Save draft</button>
          <button type="button" disabled={isPending} onClick={() => onSave(true)} className={`${BTN} bg-[#1A5632] text-white hover:bg-[#14442A]`}>Submit to M&amp;E</button>
        </>
      )}
      {canReview && !isOpen && (
        <button type="button" disabled={isPending} onClick={() => onSave(false)} className={`${BTN} border border-[#1A5632] bg-white text-[#1A5632] hover:bg-[#F2F7F3]`}>Save corrections</button>
      )}
      {canReview && isSubmitted && (
        <>
          <button type="button" disabled={isPending} onClick={onApprove} className={`${BTN} bg-[#1A5632] text-white hover:bg-[#14442A]`}>Approve</button>
          <button type="button" disabled={isPending} onClick={onReturn} className={`${BTN} border border-amber-600 bg-white text-amber-800 hover:bg-amber-50`}>Return to the BU</button>
        </>
      )}
      {!canChange && <span className="text-[11px] text-gray-500">Read only: the ticket&apos;s business units and M&amp;E can report.</span>}
    </div>
  );
}

/**
 * Report form of a ticket for a quarter. The ticket's business units save
 * and submit; M&E reports on their behalf, corrects a submitted or approved
 * report (the status stays) and approves or returns a submitted one.
 *
 * @param {{ data: { ticket: object, report: object|null, prefill: object, can_edit: boolean, can_review: boolean }, quarter: string, fiscalYear: string }} props
 * @returns {JSX.Element}
 * @example <ReportEditor data={data} quarter="Q3" fiscalYear="2026" />
 */
export default function ReportEditor({ data, quarter, fiscalYear }) {
  const { ticket, report, prefill, can_edit: canEdit, can_review: canReview } = data;
  const [form, setForm] = useState(() => initialForm(data));
  const [isReturnOpen, setReturnOpen] = useState(false);
  const [reason, setReason] = useState('');
  const save = useSaveBigTicketReport();
  const decide = useDecideBigTicketReport();

  const isOpen = !report || OPEN.includes(report.status);
  const canChange = (canEdit && isOpen) || canReview;
  const isPending = save.isPending || decide.isPending;
  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setValue = (lineId, key, value) => setForm((f) => ({ ...f, values: { ...f.values, [lineId]: { ...f.values[lineId], [key]: value } } }));

  const handleSave = async (submit) => {
    try {
      const saved = await save.mutateAsync({ id: ticket.id, quarter, payload: toPayload(form, fiscalYear, submit) });
      toast.success(saved.status === STATUSES.SUBMITTED ? `${ticket.code} ${quarter} submitted to M&E` : `${ticket.code} ${quarter} saved`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'The report could not be saved.'));
    }
  };

  const handleDecide = async (approve) => {
    try {
      await decide.mutateAsync({ id: ticket.id, quarter, fiscalYear, approve, reason });
      toast.success(approve ? `${ticket.code} ${quarter} approved` : `${ticket.code} ${quarter} returned to the business unit`);
      setReturnOpen(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'The decision could not be saved.'));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <ReportLinesFields lines={ticket.lines} values={form.values} prefill={prefill} isReadOnly={!canChange} onValue={setValue} />
      <section className="grid gap-3 border border-gray-200 bg-white px-4 py-4">
        <label className="flex flex-col gap-1 text-[10px] text-gray-500 md:w-64">Progress status
          <select value={form.progress_status} disabled={!canChange} onChange={(e) => setField('progress_status', e.target.value)} className={INPUT}>
            <option value="">Choose…</option>
            {PROGRESS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {TEXTS.map(([key, label, rows]) => (
          <label key={key} className="flex flex-col gap-1 text-[10px] text-gray-500">{label}
            <textarea rows={rows} value={form[key]} disabled={!canChange} onChange={(e) => setField(key, e.target.value)} className={INPUT} />
          </label>
        ))}
      </section>

      <ReportActions
        canChange={canChange} canReview={canReview} isOpen={isOpen} isSubmitted={report?.status === STATUSES.SUBMITTED}
        isPending={isPending} onSave={handleSave} onApprove={() => handleDecide(true)} onReturn={() => setReturnOpen(true)}
      />

      <Modal
        open={isReturnOpen}
        onClose={() => setReturnOpen(false)}
        title={`Return ${ticket.code} ${quarter}`}
        footer={(
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setReturnOpen(false)} className={`${BTN} border border-gray-300 bg-white text-gray-800`}>Cancel</button>
            <button type="button" disabled={!reason.trim() || isPending} onClick={() => handleDecide(false)} className={`${BTN} bg-amber-700 text-white`}>Return</button>
          </div>
        )}
      >
        <label className="flex flex-col gap-1 text-[10px] text-gray-500">What the business unit should change
          <textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} className={INPUT} />
        </label>
      </Modal>
    </div>
  );
}
