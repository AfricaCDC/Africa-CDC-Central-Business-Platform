import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { STATUSES } from '@rbm/lib/enums';

vi.mock('../hooks/useActivityPlanningQueries', () => ({ useActivityTrail: vi.fn() }));

import { useActivityTrail } from '../hooks/useActivityPlanningQueries';
import ApprovalTrail from '../ApprovalTrail';

const state = (over) => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn(), ...over });

beforeEach(() => vi.clearAllMocks());

describe('ApprovalTrail', () => {
  it('should list each event with its author and the reject comment', () => {
    useActivityTrail.mockReturnValue(state({ data: {
      events: [
        { id: 1, at: '2026-11-03T09:00:00Z', actor: 'Focal A', label: 'Submitted for approval', decision: null, comment: null },
        { id: 2, at: '2026-11-04T09:00:00Z', actor: 'Head B', label: 'Rejected', decision: STATUSES.REJECTED, comment: 'Split the cost per quarter' },
      ],
      waiting_for: null,
    } }));
    render(<ApprovalTrail activityId={4102} />);
    expect(useActivityTrail).toHaveBeenCalledWith(4102);
    expect(screen.getByText('Submitted for approval')).toBeTruthy();
    expect(screen.getByText('Head B')).toBeTruthy();
    expect(screen.getByText('Rejected').className).toContain('text-red-700');
    expect(screen.getByText(/Split the cost per quarter/)).toBeTruthy();
    expect(screen.queryByText(/Waiting for/)).toBeNull();
  });

  it('should say whom the activity waits for', () => {
    useActivityTrail.mockReturnValue(state({ data: {
      events: [], waiting_for: { step: 'Responsible Person of the Business Unit', name: 'Head B' },
    } }));
    render(<ApprovalTrail activityId={4102} />);
    expect(screen.getByText('Head B')).toBeTruthy();
    expect(screen.getByText(/Responsible Person of the Business Unit/)).toBeTruthy();
    expect(screen.getByText('No history recorded for this activity.')).toBeTruthy();
  });

  it('should tell the user when no Responsible Person is named', () => {
    useActivityTrail.mockReturnValue(state({ data: { events: [], waiting_for: { step: null, name: null } } }));
    render(<ApprovalTrail activityId={4102} />);
    expect(screen.getByText(/ask your administrator to name one/)).toBeTruthy();
  });

  it('should show a loader, then an error with retry', () => {
    useActivityTrail.mockReturnValue(state({ isLoading: true }));
    const { unmount } = render(<ApprovalTrail activityId={4102} />);
    expect(screen.getByLabelText('Loading approval trail')).toBeTruthy();
    unmount();
    useActivityTrail.mockReturnValue(state({ isError: true }));
    render(<ApprovalTrail activityId={4102} />);
    expect(screen.getByText('Could not load the approval trail.')).toBeTruthy();
  });
});
