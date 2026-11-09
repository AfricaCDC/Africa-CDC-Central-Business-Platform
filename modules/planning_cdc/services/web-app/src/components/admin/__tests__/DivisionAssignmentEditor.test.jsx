// ── DivisionAssignmentEditor ──
//
// Role options come from packages/lib (every division role, M&E officer
// included; DIRECTOR and HEAD_OF_DIVISION are one "Responsible person"
// option). API error messages reach the admin instead of a generic
// "Failed to update role". Making someone Responsible person of a division
// that already has one asks for confirmation first (single holder).

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '@/services/api';
import { toast } from 'sonner';
import { DIVISION_ASSIGNMENT_ROLES as DR, DIVISION_ASSIGNMENT_ROLE_LABELS } from '@rbm/lib/user-divisions';
import DivisionAssignmentEditor from '../DivisionAssignmentEditor';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const ROW = { id: 3, division_code: 'CPI', division_name: 'Centre for Primary Health', role: DR.MEMBER, is_primary: true };
const RESPONSIBLE = DIVISION_ASSIGNMENT_ROLE_LABELS[DR.HEAD_OF_DIVISION];

/** api.get: the user's rows, or the division detail. */
function mockGets({ rows = [ROW], division = {} } = {}) {
  api.get.mockImplementation((url) => Promise.resolve({
    data: url.startsWith('/admin/divisions/') ? division : rows,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGets();
  api.put.mockResolvedValue({ data: {} });
});

describe('<DivisionAssignmentEditor />', () => {
  it('offers every division role once, with a single Responsible person option', async () => {
    render(<DivisionAssignmentEditor userId={5} allDivisions={[]} />);
    const select = await screen.findByDisplayValue(DIVISION_ASSIGNMENT_ROLE_LABELS.MEMBER);
    const labels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(labels).toEqual([...new Set(Object.values(DIVISION_ASSIGNMENT_ROLE_LABELS))]);
    expect(labels.filter((l) => l === RESPONSIBLE)).toHaveLength(1);
  });

  it('shows a DIRECTOR row as Responsible person', async () => {
    mockGets({ rows: [{ ...ROW, role: DR.DIRECTOR }] });
    render(<DivisionAssignmentEditor userId={5} allDivisions={[]} />);
    expect(await screen.findByDisplayValue(RESPONSIBLE)).toBeInTheDocument();
  });

  it('shows the server message when a role change is refused', async () => {
    api.put.mockRejectedValueOnce({ response: { data: { success: false, code: 'VALIDATION_FAILED', message: 'Division not found' } } });
    render(<DivisionAssignmentEditor userId={5} allDivisions={[]} />);
    const select = await screen.findByDisplayValue(DIVISION_ASSIGNMENT_ROLE_LABELS.MEMBER);
    fireEvent.change(select, { target: { value: DR.HEAD_OF_DIVISION } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Division not found'));
    expect(api.put).toHaveBeenCalledWith('/admin/users/5/divisions/3', { role: DR.HEAD_OF_DIVISION });
  });

  it('asks before replacing the current Responsible person, then saves on confirm', async () => {
    mockGets({ division: { code: 'CPI', responsible_user_id: 9, responsible_user: { full_name: 'Jane Doe' } } });
    render(<DivisionAssignmentEditor userId={5} allDivisions={[]} />);
    const select = await screen.findByDisplayValue(DIVISION_ASSIGNMENT_ROLE_LABELS.MEMBER);
    fireEvent.change(select, { target: { value: DR.HEAD_OF_DIVISION } });

    expect(await screen.findByText(/Jane Doe is already the Responsible person of CPI/)).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/users/5/divisions/3', { role: DR.HEAD_OF_DIVISION }));
  });

  it('does nothing when the admin cancels the replacement', async () => {
    mockGets({ division: { code: 'CPI', responsible_user_id: 9, responsible_user: { full_name: 'Jane Doe' } } });
    render(<DivisionAssignmentEditor userId={5} allDivisions={[]} />);
    const select = await screen.findByDisplayValue(DIVISION_ASSIGNMENT_ROLE_LABELS.MEMBER);
    fireEvent.change(select, { target: { value: DR.HEAD_OF_DIVISION } });
    await screen.findByText(/Jane Doe is already/);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText(/Jane Doe is already/)).not.toBeInTheDocument());
    expect(api.put).not.toHaveBeenCalled();
  });

  it('skips the question when the user already is the Responsible person', async () => {
    mockGets({ division: { code: 'CPI', responsible_user_id: 5 } });
    render(<DivisionAssignmentEditor userId={5} allDivisions={[]} />);
    const select = await screen.findByDisplayValue(DIVISION_ASSIGNMENT_ROLE_LABELS.MEMBER);
    fireEvent.change(select, { target: { value: DR.HEAD_OF_DIVISION } });
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(screen.queryByText(/already the Responsible person/)).not.toBeInTheDocument();
  });
});
