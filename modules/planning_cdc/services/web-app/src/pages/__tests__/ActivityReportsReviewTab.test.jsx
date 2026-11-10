import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LEVEL_TYPES, STATUSES } from '@rbm/lib/enums';

const approveMutate = vi.fn();
const rejectMutate = vi.fn();
const { askedStatus } = vi.hoisted(() => ({ askedStatus: vi.fn() }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('../review-submissions/hooks/useReviewSubmissionsQueries', () => ({
  useActivityReportsForReview: (status) => (askedStatus(status), {
    data: [{ id: 1, plan_node_id: 9, activity_code: 'A.1', activity_name: 'Do thing', responsible_division_code: 'DCM', quarter: 'Q1' }],
    isLoading: false,
  }),
  useApproveActivityReport: () => ({ mutateAsync: approveMutate }),
  useRejectActivityReport: () => ({ mutateAsync: rejectMutate }),
  useDivisionCodes: () => ({ data: DIVISIONS }),
}));

// Directorate DPS holds DCM; FIN is another directorate. The seeded report is DCM's.
const DIVISIONS = [
  { code: 'DPS', division_name: 'Prog Support', parent_code: null, level_type: LEVEL_TYPES.DIRECTORATE },
  { code: 'DCM', division_name: 'Case Mgmt', parent_code: 'DPS', level_type: LEVEL_TYPES.DIVISION },
  { code: 'FIN', division_name: 'Finance', parent_code: null, level_type: LEVEL_TYPES.DIRECTORATE },
];

// The directorate/division filter lives in the URL, so render inside a router.
const render = (ui, url = '/review-submissions') => rtlRender(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>);

import { toast } from 'sonner';
import { ActivityReportsReviewTab } from '../ReviewSubmissionsPage';

beforeEach(() => { approveMutate.mockReset(); rejectMutate.mockReset(); toast.error.mockReset(); });

// The Reject control lives inside an ActionDropdown gated by an "Actions"
// toggle button, so open the dropdown first before clicking "Reject".
const openReject = () => {
  fireEvent.click(screen.getByRole('button', { name: /Actions/i }));
  fireEvent.click(screen.getByRole('button', { name: /^Reject$/i }));
};

describe('ActivityReportsReviewTab — reject UX', () => {
  it('opens a reason modal (no window.prompt) with the confirm disabled until a reason is typed', async () => {
    render(<ActivityReportsReviewTab />);
    openReject();
    const confirm = await screen.findByRole('button', { name: /Confirm Rejection/i });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Wrong division' } });
    expect(confirm).not.toBeDisabled();
  });

  it('surfaces the backend 403 message on reject failure', async () => {
    rejectMutate.mockRejectedValueOnce({ response: { data: { message: 'You lack activity_report:reject' } } });
    render(<ActivityReportsReviewTab />);
    openReject();
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirm Rejection/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('You lack activity_report:reject'));
  });
});

describe('ActivityReportsReviewTab — directorate / division filter', () => {
  it('should show every report and the count when no filter is set', () => {
    render(<ActivityReportsReviewTab />);
    expect(screen.getByText('Do thing')).toBeInTheDocument();
    expect(screen.getByText(/of 1/)).toHaveTextContent('1 of 1');
  });

  it('should keep a report whose division sits under the chosen directorate', () => {
    render(<ActivityReportsReviewTab />, '/review-submissions?ar_dir=DPS');
    expect(screen.getByText('Do thing')).toBeInTheDocument();
  });

  it('should hide a report from another directorate or division', () => {
    render(<ActivityReportsReviewTab />, '/review-submissions?ar_dir=FIN');
    expect(screen.queryByText('Do thing')).not.toBeInTheDocument();
    expect(screen.getByText(/of 1/)).toHaveTextContent('0 of 1');
  });

  it('should offer Clear while a filter is set', () => {
    render(<ActivityReportsReviewTab />, '/review-submissions?ar_div=FIN');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Do thing')).toBeInTheDocument();
  });
});

describe('ActivityReportsReviewTab — submitted / drafts', () => {
  it('should list submitted reports by default', () => {
    render(<ActivityReportsReviewTab />);
    expect(askedStatus).toHaveBeenLastCalledWith(STATUSES.SUBMITTED);
    expect(screen.getByRole('button', { name: 'Submitted' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('should list drafts with an Open action when Drafts is chosen', () => {
    render(<ActivityReportsReviewTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Drafts' }));
    expect(askedStatus).toHaveBeenLastCalledWith(STATUSES.DRAFT);
    expect(screen.getByText('Prepared by')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions/i })).not.toBeInTheDocument();
  });

  it('should read the drafts view from the URL', () => {
    render(<ActivityReportsReviewTab />, '/review-submissions?ar_status=drafts');
    expect(askedStatus).toHaveBeenLastCalledWith(STATUSES.DRAFT);
  });
});
