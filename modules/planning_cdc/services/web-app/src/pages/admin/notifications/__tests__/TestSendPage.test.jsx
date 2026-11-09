import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-router-dom', async () => await vi.importActual('react-router-dom'));

vi.mock('@/components/layout/DashboardLayout', () => ({
  default: ({ children }) => <div data-testid="dashboard">{children}</div>,
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...a) => toastSuccess(...a), error: (...a) => toastError(...a) },
}));

const { mockEvents, mockTestSend } = vi.hoisted(() => ({
  mockEvents: vi.fn(),
  mockTestSend: vi.fn(),
}));

vi.mock('../hooks/useNotificationsAdminQueries', () => ({
  useNotificationEvents: () => mockEvents(),
  useTestSend: () => mockTestSend(),
}));

import TestSendPage from '../TestSendPage';

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/admin/notifications/test-send']}>
      <TestSendPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  toastError.mockReset();
  toastSuccess.mockReset();
  mockEvents.mockReset().mockReturnValue({
    data: [
      { event_key: 'plan_node.submitted', label: 'Plan Submitted' },
      { event_key: 'plan_node.approved', label: null },
    ],
  });
  mockTestSend.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false });
});

describe('TestSendPage', () => {
  it('renders the event dropdown populated from the catalog', () => {
    renderPage();
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /plan_node\.submitted/i })).toBeInTheDocument();
  });

  it('shows an error toast when no event is selected', () => {
    const mutate = vi.fn();
    mockTestSend.mockReturnValue({ mutate, isPending: false });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /send test event/i }));
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/pick an event/i));
    expect(mutate).not.toHaveBeenCalled();
  });

  it('rejects malformed entity JSON', () => {
    const mutate = vi.fn();
    mockTestSend.mockReturnValue({ mutate, isPending: false });
    renderPage();
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'plan_node.submitted' },
    });
    const [entityArea] = screen.getAllByRole('textbox');
    fireEvent.change(entityArea, { target: { value: '{ not json' } });
    fireEvent.click(screen.getByRole('button', { name: /send test event/i }));
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/entity json invalid/i));
    expect(mutate).not.toHaveBeenCalled();
  });

  it('submits valid input and shows the result panel on success', () => {
    let onSuccess;
    const mutate = vi.fn((_payload, opts) => { onSuccess = opts.onSuccess; });
    mockTestSend.mockReturnValue({ mutate, isPending: false });
    renderPage();
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'plan_node.submitted' },
    });
    const [entityArea, metaArea] = screen.getAllByRole('textbox');
    fireEvent.change(entityArea, { target: { value: '{"id": 42}' } });
    fireEvent.change(metaArea, { target: { value: '{"reason":"smoke"}' } });
    fireEvent.click(screen.getByRole('button', { name: /send test event/i }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({
      event_key: 'plan_node.submitted',
      entity: { id: 42 },
      metadata: { reason: 'smoke' },
    });

    // Simulate a successful dispatch
    onSuccess({ matched: 3, recipients: 7, outboxRows: 7 });
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/dispatched/i));
  });
});
