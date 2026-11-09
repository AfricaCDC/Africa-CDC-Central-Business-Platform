import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { STATUSES } from '@rbm/lib/enums';

const { mockUseApprovalHistory } = vi.hoisted(() => ({
  mockUseApprovalHistory: vi.fn(),
}));

vi.mock('../hooks/useApprovalQueries', () => ({
  useApprovalHistory: mockUseApprovalHistory,
}));

import ApprovalHistoryTimeline from '../ApprovalHistoryTimeline';

function renderTimeline(hookReturn) {
  mockUseApprovalHistory.mockReturnValue(hookReturn);
  return render(<ApprovalHistoryTimeline entityType="ACTIVITY_REPORT" entityId={42} />);
}

describe('ApprovalHistoryTimeline', () => {
  beforeEach(() => {
    mockUseApprovalHistory.mockReset();
  });

  it('returns null when entityType or entityId is missing', () => {
    mockUseApprovalHistory.mockReturnValue({
      data: null, isLoading: false, isError: false, error: null,
    });
    const { container } = render(<ApprovalHistoryTimeline entityType={null} entityId={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders loading state', () => {
    renderTimeline({ data: null, isLoading: true, isError: false, error: null });
    expect(screen.getByText(/loading approval history/i)).toBeInTheDocument();
  });

  it('renders error state with a backend message', () => {
    renderTimeline({
      data: null,
      isLoading: false,
      isError: true,
      error: { response: { data: { message: 'Server boom' } } },
    });
    expect(screen.getByText(/server boom/i)).toBeInTheDocument();
  });

  it('renders empty state when there are zero steps', () => {
    renderTimeline({
      data: { steps: [] },
      isLoading: false, isError: false, error: null,
    });
    expect(screen.getByText(/no approval history yet/i)).toBeInTheDocument();
  });

  it('renders one item per step with labels, decision text, and comments', () => {
    renderTimeline({
      data: {
        steps: [
          {
            id: 1, step: 1, decision: STATUSES.APPROVED, adminBypass: false,
            approverName: 'Alice HOD', decidedAt: '2026-04-15T09:00:00Z',
            comment: 'Looks good',
          },
          {
            id: 2, step: 2, decision: STATUSES.REJECTED, adminBypass: false,
            approverName: 'Bob HOD', decidedAt: '2026-04-15T10:00:00Z',
            reason: 'Budget too high',
          },
          {
            id: 3, step: 3, decision: null, adminBypass: false,
            approverName: null, decidedAt: null,
          },
        ],
      },
      isLoading: false, isError: false, error: null,
    });
    expect(screen.getByText(/Step 1 — Contributing HOD/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 2 — Accountable HOD/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 3 — M&E final review/i)).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText(/Looks good/)).toBeInTheDocument();
    expect(screen.getByText(/Budget too high/)).toBeInTheDocument();
  });

  it('labels adminBypass approvals as "Admin bypass"', () => {
    renderTimeline({
      data: {
        steps: [
          {
            id: 1, step: 1, decision: STATUSES.APPROVED, adminBypass: true,
            approverName: 'Admin', decidedAt: '2026-04-15T09:00:00Z',
          },
        ],
      },
      isLoading: false, isError: false, error: null,
    });
    expect(screen.getByText('Admin bypass')).toBeInTheDocument();
  });

  it('reads steps from the `data.data.steps` envelope variant', () => {
    renderTimeline({
      data: {
        data: {
          steps: [
            { id: 1, step: 1, decision: STATUSES.APPROVED, adminBypass: false },
          ],
        },
      },
      isLoading: false, isError: false, error: null,
    });
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });
});
