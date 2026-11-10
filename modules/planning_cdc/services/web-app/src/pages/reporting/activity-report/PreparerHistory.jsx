import { useState } from 'react';
import { toast } from 'sonner';
import { UserCog } from 'lucide-react';
import Modal, { ModalPrimaryButton, ModalSecondaryButton } from '@/components/shared/Modal';
import SearchSelect from '@/components/shared/SearchSelect';
import { useReportPreparers, useChangeActivityReportPreparer } from '../hooks/useReportingQueries';

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const errorMessage = (err) => err?.response?.data?.message || 'Could not change who prepared the report. Please try again.';

/** Dialog: pick the new preparer and give a reason (both required). */
function ChangePreparerModal({ reportId, onClose }) {
  const [userId, setUserId] = useState(null);
  const [reason, setReason] = useState('');
  const { data: users = [], isLoading } = useReportPreparers(true);
  const changeMut = useChangeActivityReportPreparer();
  const options = users.map((u) => ({ value: u.id, label: u.name, sub: u.email }));
  const canSave = Boolean(userId) && reason.trim().length > 0 && !changeMut.isPending;

  const handleSave = async () => {
    try {
      await changeMut.mutateAsync({ reportId, userId, reason: reason.trim() });
      toast.success('Preparer changed. The previous preparer stays in the report history.');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Change who prepared this report"
      footer={(
        <>
          <ModalSecondaryButton onClick={onClose}>Cancel</ModalSecondaryButton>
          <ModalPrimaryButton onClick={handleSave} disabled={!canSave}>
            {changeMut.isPending ? 'Saving…' : 'Change preparer'}
          </ModalPrimaryButton>
        </>
      )}
    >
      <div className="space-y-3">
        <div>
          <label htmlFor="new-preparer" className="block text-[10px] font-semibold text-gray-500 mb-1">New preparer</label>
          <SearchSelect
            id="new-preparer"
            value={userId}
            options={options}
            onChange={setUserId}
            placeholder={isLoading ? 'Loading users…' : 'Search a person…'}
            disabled={isLoading}
          />
        </div>
        <div>
          <label htmlFor="preparer-reason" className="block text-[10px] font-semibold text-gray-500 mb-1">Reason (kept in the history)</label>
          <textarea
            id="preparer-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={1000}
            className="w-full text-[11px] border border-gray-300 px-2 py-1.5 outline-none focus:border-[#1A5632]"
          />
        </div>
      </div>
    </Modal>
  );
}

/**
 * "Prepared by" history under the sign-off block, plus the Change action for
 * administrators and M&E officers (D-20261013-03). The previous preparers stay
 * listed: who had it, who got it, who changed it, when and why.
 *
 * @param {{ report: object|null, canChange: boolean }} props
 * @returns {JSX.Element|null}
 * @throws {never}
 * @example <PreparerHistory report={data.report} canChange />
 */
export default function PreparerHistory({ report, canChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const reportId = report?.id;
  const changes = report?.preparer_changes || [];
  if (!reportId || (!changes.length && !canChange)) return null;
  return (
    <div className="border border-t-0 border-gray-200 bg-gray-50 px-5 py-2.5 text-[11px] text-gray-600 space-y-1">
      {changes.map((c) => (
        <p key={c.id}>
          Prepared by <strong>{c.from_name || 'nobody'}</strong>, given to <strong>{c.to_name}</strong>
          {' '}by {c.changed_by_name || 'an administrator'} on {fmtDate(c.created_at)}: <em>{c.reason}</em>
        </p>
      ))}
      {canChange && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1 text-[11px] text-[#1A5632] hover:underline"
        >
          <UserCog className="w-3.5 h-3.5" /> Change who prepared this report
        </button>
      )}
      {isOpen && <ChangePreparerModal reportId={reportId} onClose={() => setIsOpen(false)} />}
    </div>
  );
}
