import { useState } from 'react';

/**
 * Confirmation modal for admin bypass. Forces the admin to type a reason
 * before the bypass mutation is allowed to fire (spec §6, admin override).
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {(reason: string) => void} props.onConfirm
 * @param {() => void} props.onCancel
 * @param {boolean} [props.isSubmitting]
 * @returns {JSX.Element|null}
 */
export default function BypassModal({ open, onConfirm, onCancel, isSubmitting }) {
  const [reason, setReason] = useState('');
  if (!open) return null;
  const disabled = isSubmitting || reason.trim().length === 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-[13px] font-semibold text-gray-800">Admin bypass — reason required</h2>
        <p className="mb-2 text-[11px] text-gray-600">
          This records an admin override on the approval instance and notifies the
          submitter that the report was approved via bypass.
        </p>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mb-3 w-full border border-gray-300 bg-white px-2 py-1 text-[12px]"
          placeholder="Explain why the normal chain could not complete…"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="border border-gray-300 bg-white px-3 py-1 text-[11px]">Cancel</button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onConfirm(reason.trim())}
            className="border border-amber-600 bg-amber-600 px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            {isSubmitting ? 'Submitting…' : 'Confirm bypass'}
          </button>
        </div>
      </div>
    </div>
  );
}
