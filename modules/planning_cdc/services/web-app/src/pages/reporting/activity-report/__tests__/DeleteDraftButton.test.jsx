import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { STATUSES } from '@rbm/lib/enums';
import DeleteDraftButton from '../DeleteDraftButton';

const { mutateAsync, toast } = vi.hoisted(() => ({ mutateAsync: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('sonner', () => ({ toast }));
vi.mock('../../hooks/useReportingQueries', () => ({
  useDeleteActivityReport: () => ({ mutateAsync, isPending: false }),
}));

const draft = { id: 12, user_id: 7, status: STATUSES.DRAFT };
const author = { id: 7 };
const other = { id: 8 };

beforeEach(() => vi.clearAllMocks());

describe('DeleteDraftButton', () => {
  it('should show for the author of a draft', () => {
    render(<DeleteDraftButton report={draft} user={author} isAdmin={false} onDeleted={vi.fn()} />);
    expect(screen.getByRole('button', { name: /delete this draft/i })).toBeInTheDocument();
  });

  it('should show for an administrator on someone else\'s draft', () => {
    render(<DeleteDraftButton report={draft} user={other} isAdmin onDeleted={vi.fn()} />);
    expect(screen.getByRole('button', { name: /delete this draft/i })).toBeInTheDocument();
  });

  it('should hide for another user, a submitted report or no report', () => {
    const { rerender, container } = render(<DeleteDraftButton report={draft} user={other} isAdmin={false} onDeleted={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<DeleteDraftButton report={{ ...draft, status: STATUSES.SUBMITTED }} user={author} isAdmin onDeleted={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<DeleteDraftButton report={null} user={author} isAdmin onDeleted={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should delete only after confirmation, then leave the page', async () => {
    mutateAsync.mockResolvedValueOnce({});
    const onDeleted = vi.fn();
    render(<DeleteDraftButton report={draft} user={author} isAdmin={false} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole('button', { name: /delete this draft/i }));
    expect(mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith(12);
  });

  it('should show the server message when the delete fails', async () => {
    mutateAsync.mockRejectedValueOnce({ response: { data: { message: 'Only a draft can be deleted' } } });
    render(<DeleteDraftButton report={draft} user={author} isAdmin={false} onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /delete this draft/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Only a draft can be deleted'));
  });
});
