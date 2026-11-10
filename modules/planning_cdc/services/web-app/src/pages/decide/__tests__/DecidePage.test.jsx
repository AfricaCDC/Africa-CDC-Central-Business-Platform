import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ step: {}, mutate: vi.fn(), params: new URLSearchParams() }));

vi.mock('@/components/layout/DashboardLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({ stepId: '311' }), useSearchParams: () => [state.params, vi.fn()] };
});
vi.mock('../hooks/useDecideQueries', () => ({
  useApprovalStep: () => state.step,
  useDecideStep: () => ({ mutate: state.mutate, isPending: false, error: null }),
}));

import DecidePage from '../DecidePage';

const STEP = {
  step_id: 311, entity_type: 'ACTIVITY_REPORT', entity_id: 7, type_label: 'Activity report', code: '1.2.3.01',
  title: 'Lab training', unit_code: 'EPR', quarter: 'Q3', fiscal_year: '2026', step_label: 'Responsible Person of the Business Unit',
  approver_name: 'Ama Diallo', link: '/activity-report/42/report/7', can_decide: true, is_open: true,
};
const renderPage = () => render(<MemoryRouter><DecidePage /></MemoryRouter>);

beforeEach(() => {
  state.mutate.mockReset();
  state.params = new URLSearchParams();
  state.step = { data: STEP, isLoading: false, error: null, refetch: vi.fn() };
});

describe('DecidePage', () => {
  it('should show the item and approve only after confirmation', () => {
    renderPage();
    expect(screen.getByText('Lab training')).toBeTruthy();
    expect(screen.getByText('Open the full page').closest('a').getAttribute('href')).toBe('/activity-report/42/report/7');
    expect(state.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Confirm approval'));
    expect(state.mutate.mock.calls[0][0]).toEqual({ entityType: 'ACTIVITY_REPORT', entityId: 7, decision: 'approve', reason: '' });
  });

  it('should open on reject from the email link and require a reason', () => {
    state.params = new URLSearchParams('d=reject');
    renderPage();
    const confirm = screen.getByText('Confirm rejection');
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Budget missing' } });
    fireEvent.click(confirm);
    expect(state.mutate.mock.calls[0][0]).toMatchObject({ decision: 'reject', reason: 'Budget missing' });
  });

  it('should say a decided step is closed, with who decided', () => {
    state.step = { data: { ...STEP, can_decide: false, is_open: false, decided_by_name: 'Kofi Mensah' }, isLoading: false };
    renderPage();
    expect(screen.getByText(/already closed: decided by Kofi Mensah/)).toBeTruthy();
    expect(screen.queryByText('Confirm approval')).toBeNull();
  });

  it('should show a readable refusal without a retry', () => {
    state.step = { data: undefined, isLoading: false, error: { response: { status: 403, data: { message: 'This approval is not yours' } } }, refetch: vi.fn() };
    renderPage();
    expect(screen.getByText(/This approval is not yours/)).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('should offer a retry when the server failed', () => {
    const refetch = vi.fn();
    state.step = { data: undefined, isLoading: false, error: { response: { status: 503, data: {} } }, refetch };
    renderPage();
    fireEvent.click(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });
});
