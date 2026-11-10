import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PreparerHistory from '../PreparerHistory';

const { mutateAsync, toast } = vi.hoisted(() => ({ mutateAsync: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('sonner', () => ({ toast }));
vi.mock('../../hooks/useReportingQueries', () => ({
  useReportPreparers: () => ({ data: [{ id: 7, name: 'Jane Seven', email: 'j@x.org' }], isLoading: false }),
  useChangeActivityReportPreparer: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('@/components/shared/SearchSelect', () => ({
  default: ({ id, options, onChange }) => (
    <select id={id} aria-label="New preparer" onChange={(e) => onChange(Number(e.target.value))}>
      <option value="">-</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));

const report = {
  id: 12,
  preparer_changes: [{
    id: 1, from_name: 'Zoe Five', to_name: 'Jane Seven', changed_by_name: 'Admin', reason: 'Jane wrote it', created_at: '2026-10-13T08:00:00Z',
  }],
};

beforeEach(() => vi.clearAllMocks());

describe('PreparerHistory', () => {
  it('should render nothing before the report exists', () => {
    const { container } = render(<PreparerHistory report={null} canChange />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should show the history but no change button without the permission', () => {
    render(<PreparerHistory report={report} canChange={false} />);
    expect(screen.getByText('Zoe Five')).toBeInTheDocument();
    expect(screen.getByText('Jane wrote it')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change who prepared/i })).not.toBeInTheDocument();
  });

  it('should require a person and a reason before saving', () => {
    render(<PreparerHistory report={{ id: 12 }} canChange />);
    fireEvent.click(screen.getByRole('button', { name: /change who prepared/i }));
    const save = screen.getByRole('button', { name: 'Change preparer' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('New preparer'), { target: { value: '7' } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: '  ' } });
    expect(save).toBeDisabled();
  });

  it('should send the new preparer with a trimmed reason', async () => {
    mutateAsync.mockResolvedValueOnce({});
    render(<PreparerHistory report={{ id: 12 }} canChange />);
    fireEvent.click(screen.getByRole('button', { name: /change who prepared/i }));
    fireEvent.change(screen.getByLabelText('New preparer'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: ' Jane wrote it ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change preparer' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ reportId: 12, userId: 7, reason: 'Jane wrote it' }));
    expect(toast.success).toHaveBeenCalled();
  });

  it('should show the server message when the change fails', async () => {
    mutateAsync.mockRejectedValueOnce({ response: { data: { message: 'This person already prepared the report' } } });
    render(<PreparerHistory report={{ id: 12 }} canChange />);
    fireEvent.click(screen.getByRole('button', { name: /change who prepared/i }));
    fireEvent.change(screen.getByLabelText('New preparer'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change preparer' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('This person already prepared the report'));
  });
});
