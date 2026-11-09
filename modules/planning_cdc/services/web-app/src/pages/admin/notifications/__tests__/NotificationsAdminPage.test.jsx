import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-router-dom', async () => await vi.importActual('react-router-dom'));

vi.mock('@/components/layout/DashboardLayout', () => ({
  default: ({ children }) => <div data-testid="dashboard">{children}</div>,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const { mockSubsQuery, mockToggleMut, mockDeleteMut } = vi.hoisted(() => ({
  mockSubsQuery: vi.fn(),
  mockToggleMut: vi.fn(),
  mockDeleteMut: vi.fn(),
}));

vi.mock('../hooks/useNotificationsAdminQueries', () => ({
  useNotificationSubscriptions: (...a) => mockSubsQuery(...a),
  useToggleSubscription: () => mockToggleMut(),
  useDeleteSubscription: () => mockDeleteMut(),
}));

import NotificationsAdminPage from '../NotificationsAdminPage';

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/admin/notifications']}>
      <NotificationsAdminPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  mockSubsQuery.mockReset();
  mockToggleMut.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockDeleteMut.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false });
});

describe('NotificationsAdminPage', () => {
  it('shows a loading spinner while fetching', () => {
    mockSubsQuery.mockReturnValue({
      data: undefined, isLoading: true, error: null, refetch: vi.fn(),
    });
    const { container } = renderPage();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows an error state with retry', () => {
    const refetch = vi.fn();
    mockSubsQuery.mockReturnValue({
      data: undefined, isLoading: false, error: new Error('boom'), refetch,
    });
    renderPage();
    expect(screen.getByText(/failed to load subscriptions/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders the empty state when there are no subscriptions', () => {
    mockSubsQuery.mockReturnValue({
      data: [], isLoading: false, error: null, refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText(/no subscriptions configured yet/i)).toBeInTheDocument();
    // Empty state CTA links to the create page
    const cta = screen.getAllByRole('link', { name: /new subscription/i })[0];
    expect(cta).toHaveAttribute('href', '/admin/notifications/subscriptions/new');
  });

  it('renders rows + stats bar when data is present', () => {
    mockSubsQuery.mockReturnValue({
      data: [
        {
          id: 1, event_key: 'plan_node.submitted', event_label: 'Plan submitted',
          recipient_role: 'SYSTEM_ADMIN', recipient_scope: 'entity_owner',
          channel: 'email', template_key: 'plan-node-submitted',
          priority: 100, is_active: true,
        },
        {
          id: 2, event_key: 'plan_node.approved', event_label: null,
          recipient_role: null, recipient_scope: 'role_all',
          channel: 'in_app', template_key: 'plan-node-approved',
          priority: 50, is_active: false,
        },
      ],
      isLoading: false, error: null, refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getAllByText('plan_node.submitted').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('plan_node.approved').length).toBeGreaterThanOrEqual(1);
    // Stats bar reflects 2 subs, 1 active, 2 distinct events — labels render
    // as text nodes adjacent to <strong>{count}</strong>, so just check the
    // distinct-events label which is unique on the page.
    expect(screen.getByText(/^Events$/i)).toBeInTheDocument();
    // Edit link points at the right detail route
    const editLinks = screen.getAllByRole('link', { name: /edit/i });
    expect(editLinks[0]).toHaveAttribute('href', '/admin/notifications/subscriptions/1/edit');
  });

  it('toggle button calls the mutation with flipped is_active', () => {
    const mutate = vi.fn();
    mockToggleMut.mockReturnValue({ mutate, isPending: false });
    mockSubsQuery.mockReturnValue({
      data: [{
        id: 9, event_key: 'e.x', recipient_scope: 'actor', channel: 'email',
        template_key: 't', priority: 10, is_active: false,
      }],
      isLoading: false, error: null, refetch: vi.fn(),
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { pressed: false }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({ id: 9, isActive: true });
  });

  it('delete button opens the confirm dialog and fires mutation on confirm', () => {
    const mutate = vi.fn();
    mockDeleteMut.mockReturnValue({ mutate, isPending: false });
    mockSubsQuery.mockReturnValue({
      data: [{
        id: 7, event_key: 'e.x', recipient_scope: 'actor', channel: 'email',
        template_key: 't', priority: 10, is_active: true,
      }],
      isLoading: false, error: null, refetch: vi.fn(),
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    // ConfirmDialog renders a confirm button with "Delete" label
    const dialogConfirm = screen.getAllByRole('button', { name: /delete/i })
      .find((btn) => btn.textContent.trim() === 'Delete' && btn.className.includes('bg-'))
      || screen.getAllByRole('button', { name: /delete/i }).pop();
    fireEvent.click(dialogConfirm);
    expect(mutate).toHaveBeenCalled();
    expect(mutate.mock.calls[0][0]).toBe(7);
  });
});
