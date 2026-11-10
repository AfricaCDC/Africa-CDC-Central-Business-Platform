import { useState } from 'react';

const ACTION_APPROVE = 'approve';
const ACTION_REJECT = 'reject';

function ApproveFields({ comment, onComment }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-[11px] font-semibold text-gray-600">
        Comment (optional)
      </span>
      <textarea
        value={comment}
        onChange={(e) => onComment(e.target.value)}
        rows={3}
        className="w-full border border-gray-300 bg-white px-2 py-1 text-[12px]"
        placeholder="Add a note for the approval history…"
      />
    </label>
  );
}

function RejectFields({ reason, onReason, showError }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-[11px] font-semibold text-gray-600">
        Reason <span className="text-red-600">*</span>
      </span>
      <textarea
        value={reason}
        onChange={(e) => onReason(e.target.value)}
        rows={3}
        required
        className={`w-full border bg-white px-2 py-1 text-[12px] ${
          showError ? 'border-red-500' : 'border-gray-300'
        }`}
        placeholder="Explain why the contributor report is rejected…"
      />
      {showError && (
        <span className="mt-1 block text-[10px] text-red-600">
          A reason is required to reject.
        </span>
      )}
    </label>
  );
}

function ActionRadios({ action, onAction }) {
  return (
    <div className="mb-3 flex gap-2">
      <label className="flex items-center gap-1 font-semibold">
        <input
          type="radio"
          name="approval-action"
          value={ACTION_APPROVE}
          checked={action === ACTION_APPROVE}
          onChange={() => onAction(ACTION_APPROVE)}
        />
        <span>Approve</span>
      </label>
      <label className="flex items-center gap-1 font-semibold">
        <input
          type="radio"
          name="approval-action"
          value={ACTION_REJECT}
          checked={action === ACTION_REJECT}
          onChange={() => onAction(ACTION_REJECT)}
        />
        <span>Reject</span>
      </label>
    </div>
  );
}

function buildPayload(action, comment, reason) {
  if (action === ACTION_REJECT) return { action, reason: reason.trim() };
  const trimmed = comment.trim();
  return { action, comment: trimmed === '' ? undefined : trimmed };
}

function submitLabel(isReject, isSubmitting) {
  if (isSubmitting) return 'Submitting…';
  return isReject ? 'Reject' : 'Approve';
}

function submitColor(isReject) {
  return isReject ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1A5632] hover:opacity-90';
}

function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="mb-3 border border-red-300 bg-red-50 px-2 py-1 text-[11px] text-red-700">
      {message}
    </div>
  );
}

/**
 * Approve/reject form for a pending step. Reject requires a non-empty
 * reason per spec §2. Approve accepts an optional comment.
 *
 * @param {object} props
 * @param {(payload: { action: string, comment?: string, reason?: string }) => void} props.onSubmit
 * @param {boolean} [props.isSubmitting]
 * @param {string} [props.errorMessage]
 * @returns {JSX.Element}
 * @example
 * <ApprovalActionForm onSubmit={fn} isSubmitting={false} />
 */
export default function ApprovalActionForm({ onSubmit, isSubmitting, errorMessage }) {
  const [action, setAction] = useState(ACTION_APPROVE);
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  const isReject = action === ACTION_REJECT;
  const rejectMissingReason = isReject && reason.trim().length === 0;
  const disabled = Boolean(isSubmitting) || rejectMissingReason;

  function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (rejectMissingReason) return;
    onSubmit(buildPayload(action, comment, reason));
  }

  const btnClass = `px-4 py-1 text-[12px] font-semibold text-white ${submitColor(isReject)} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`;

  return (
    <form onSubmit={handleSubmit} className="border border-gray-200 bg-white p-4 text-[12px]">
      <ActionRadios action={action} onAction={setAction} />
      {!isReject && <ApproveFields comment={comment} onComment={setComment} />}
      {isReject && (
        <RejectFields
          reason={reason}
          onReason={setReason}
          showError={touched && rejectMissingReason}
        />
      )}
      <ErrorBanner message={errorMessage} />
      <div className="flex justify-end">
        <button type="submit" disabled={disabled} className={btnClass}>
          {submitLabel(isReject, isSubmitting)}
        </button>
      </div>
    </form>
  );
}
