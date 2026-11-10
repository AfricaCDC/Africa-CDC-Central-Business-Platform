import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const state = vi.hoisted(() => ({ mine: {}, create: vi.fn(), end: vi.fn() }));

vi.mock('@/components/layout/DashboardLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../hooks/useOutOfOfficeQueries', () => ({
  useMyDelegations: () => state.mine,
  useDelegateCandidates: () => ({ data: [{ id: 12, name: 'Ama Diallo', email: 'ama@example.org' }] }),
  useCreateDelegation: () => ({ mutate: state.create, isPending: false, error: null }),
  useEndDelegation: () => ({ mutate: state.end, isPending: false }),
}));

import OutOfOfficePage from '../OutOfOfficePage';

const GIVEN = { id: 3, delegate_name: 'Ama Diallo', starts_on: '2026-11-10', ends_on: '2026-11-20', reason: 'Mission' };
const RECEIVED = { id: 4, delegator_name: 'Kofi Mensah', starts_on: '2026-12-01', ends_on: '2026-12-05', reason: null };

beforeEach(() => {
  state.create.mockReset();
  state.end.mockReset();
  state.mine = { data: { given: [GIVEN], received: [RECEIVED] }, isLoading: false, error: null, refetch: vi.fn() };
});

describe('OutOfOfficePage', () => {
  it('should list the delegations given and received', () => {
    render(<OutOfOfficePage />);
    expect(screen.getByText('Ama Diallo')).toBeTruthy();
    expect(screen.getByText('2026-11-10 to 2026-11-20 · Mission')).toBeTruthy();
    expect(screen.getByText('Kofi Mensah')).toBeTruthy();
  });

  it('should end a delegation only after confirmation', () => {
    render(<OutOfOfficePage />);
    fireEvent.click(screen.getByText('End'));
    expect(state.end).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Confirm end'));
    expect(state.end).toHaveBeenCalledWith(3);
  });

  it('should keep Save disabled until the delegate and both days are set', () => {
    render(<OutOfOfficePage />);
    expect(screen.getByText('Save the delegation').disabled).toBe(true);
  });

  it('should show the empty states and a readable load error', () => {
    state.mine = { data: { given: [], received: [] }, isLoading: false, error: null };
    const { unmount } = render(<OutOfOfficePage />);
    expect(screen.getByText('You have no delegation planned.')).toBeTruthy();
    expect(screen.getByText('Nobody has delegated to you.')).toBeTruthy();
    unmount();
    state.mine = { data: undefined, isLoading: false, error: new Error('x'), refetch: vi.fn() };
    render(<OutOfOfficePage />);
    expect(screen.getByText('Try again')).toBeTruthy();
  });
});
