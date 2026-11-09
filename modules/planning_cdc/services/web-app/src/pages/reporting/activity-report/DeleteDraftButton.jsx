import { useState } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { STATUSES } from '@rbm/lib/enums';
import Modal, { ModalPrimaryButton, ModalSecondaryButton } from '@/components/shared/Modal';
import { useDeleteActivityReport } from '../hooks/useReportingQueries';

const errorMessage = (err) => err?.response?.data?.message || 'Could not delete the draft. Please try again.';

/**
 * "Delete draft" for the author of a DRAFT activity report, or an
 * administrator (D-20261013-04). Asks for confirmation first.
 *
 * @param {{ report: object|null, user: object|null, isAdmin: boolean, onDeleted: Function }} props
 * @returns {JSX.Element|null}
 * @throws {never}
 * @example <DeleteDraftButton report={data.report} user={user} isAdmin={false} onDeleted={goBack} />
 */
export default function DeleteDraftButton({ report, user, isAdmin, onDeleted }) {
  const [isOpen, setIsOpen] = useState(false);
  const deleteMut = useDeleteActivityReport();
  const isAuthor = Boolean(report && user && report.user_id === user.id);
  if (!report || report.status !== STATUSES.DRAFT || !(isAuthor || isAdmin)) return null;

  const handleDelete = async () => {
    try {
      await deleteMut.mutateAsync(report.id);
      toast.success('Draft deleted');
      setIsOpen(false);
      onDeleted();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1 text-[11px] text-red-700 hover:underline"
      >
        <Trash2 className="w-3.5 h-3.5" /> Delete this draft
      </button>
      {isOpen && (
        <Modal
          open
          onClose={() => setIsOpen(false)}
          title="Delete this draft?"
          footer={(
            <>
              <ModalSecondaryButton onClick={() => setIsOpen(false)}>Cancel</ModalSecondaryButton>
              <ModalPrimaryButton danger onClick={handleDelete} disabled={deleteMut.isPending}>
                {deleteMut.isPending ? 'Deleting…' : 'Delete draft'}
              </ModalPrimaryButton>
            </>
          )}
        >
          <p className="text-[11px] text-gray-700">
            The draft and its attached verification files are removed from this report. This cannot be undone.
          </p>
        </Modal>
      )}
    </>
  );
}
