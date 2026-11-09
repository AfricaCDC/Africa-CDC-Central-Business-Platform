import { useState } from 'react';

const REJECT = 'reject';

/**
 * Approve (one confirm) or reject (reason required) an approval step.
 * Controlled by the page: it receives the saving state and the error.
 *
 * @param {{ initialDecision: 'approve'|'reject', isSaving: boolean, error?: string|null,
 *   onDecide: (d: { decision: string, reason?: string }) => void }} props
 * @returns {JSX.Element}
 * @example <DecideForm initialDecision="approve" isSaving={false} onDecide={handleDecide} />
 */
export default function DecideForm({ initialDecision, isSaving, error, onDecide }) {
  const [decision, setDecision] = useState(initialDecision);
  const [reason, setReason] = useState('');
  const isReject = decision === REJECT;
  const canSubmit = !isSaving && (!isReject || reason.trim().length > 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (canSubmit) onDecide({ decision, reason: reason.trim() });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border border-gray-200 bg-white px-5 py-4">
      <div className="flex gap-2" role="radiogroup" aria-label="Decision">
        {[['approve', 'Approve'], [REJECT, 'Reject']].map(([value, label]) => (
          <button key={value} type="button" role="radio" aria-checked={decision === value} onClick={() => setDecision(value)}
            className={`border px-4 py-1.5 text-[11px] font-semibold ${decision === value
              ? (value === REJECT ? 'border-red-700 bg-red-700 text-white' : 'border-[#1A5632] bg-[#1A5632] text-white')
              : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
      </div>
      {isReject && (
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-600">
          Reason (sent to the author) *
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4}
            className="mt-1 w-full border border-gray-300 px-3 py-2 text-[12px] font-normal normal-case tracking-normal outline-none focus:border-[#1A5632]" />
        </label>
      )}
      {error && <p className="text-[11px] text-red-700">{error}</p>}
      <button type="submit" disabled={!canSubmit}
        className={`px-5 py-2 text-[11px] font-semibold text-white disabled:opacity-50 ${isReject ? 'bg-red-700' : 'bg-[#1A5632]'}`}>
        {isSaving ? 'Saving…' : (isReject ? 'Confirm rejection' : 'Confirm approval')}
      </button>
    </form>
  );
}
