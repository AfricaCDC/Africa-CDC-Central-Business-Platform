import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('react-router-dom', async () => await vi.importActual('react-router-dom'));

vi.mock('@/components/layout/DashboardLayout', () => ({
  default: ({ children }) => <div data-testid="dashboard">{children}</div>,
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...a) => toastSuccess(...a), error: (...a) => toastError(...a) },
}));

const {
  mockEvents, mockTemplates, mockResolvers,
  mockSubscription, mockCreate, mockUpdate,
} = vi.hoisted(() => ({
  mockEvents:       vi.fn(),
  mockTemplates:    vi.fn(),
  mockResolvers:    vi.fn(),
  mockSubscription: vi.fn(),
  mockCreate:       vi.fn(),
  mockUpdate:       vi.fn(),
}));

vi.mock('../hooks/useNotificationsAdminQueries', () => ({
  useNotificationEvents:       () => mockEvents(),
  useNotificationTemplates:    () => mockTemplates(),
  useNotificationResolvers:    () => mockResolvers(),
  useNotificationSubscription: (id) => mockSubscription(id),
  useCreateSubscription:       () => mockCreate(),
  useUpdateSubscription:       (id) => mockUpdate(id),
}));

import api from '@/services/api';
import NotificationSubscriptionFormPage from '../NotificationSubscriptionFormPage';

const renderPage = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/admin/notifications/subscriptions/new"
          element={<NotificationSubscriptionFormPage />}
        />
        <Route
          path="/admin/notifications/subscriptions/:id/edit"
          element={<NotificationSubscriptionFormPage />}
        />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  toastError.mockReset();
  toastSuccess.mockReset();
  // TemplatePreview in _SubscriptionFormFields.jsx calls api.get when template_key is set.
  // Re-apply a safe resolved value so it doesn't crash (clearMocks resets implementations).
  api.get.mockResolvedValue({ data: { html: null } });
  mockEvents.mockReset().mockReturnValue({ data: [
    { event_key: 'evt.x', label: 'Event X' },
  ]});
  mockTemplates.mockReset().mockReturnValue({ data: [
    { template_key: 'tmpl-x' },
  ]});
  mockResolvers.mockReset().mockReturnValue({ data: [
    { code: 'entity_owner' },
    { code: 'role_all' },
  ]});
  mockSubscription.mockReset().mockReturnValue({ data: undefined, isLoading: false });
  mockCreate.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockUpdate.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false });
});

describe('NotificationSubscriptionFormPage — create mode', () => {
  it('renders the create header and an enabled event_key dropdown', () => {
    renderPage('/admin/notifications/subscriptions/new');
    expect(screen.getByText(/create notification subscription/i)).toBeInTheDocument();
    const selects = screen.getAllByRole('combobox');
    // First select is event_key — should NOT be disabled in create mode
    expect(selects[0]).not.toBeDisabled();
  });

  it('blocks submit and toasts when required fields are empty', () => {
    const mutate = vi.fn();
    mockCreate.mockReturnValue({ mutate, isPending: false });
    renderPage('/admin/notifications/subscriptions/new');
    fireEvent.click(screen.getByRole('button', { name: /create subscription/i }));
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/required/i));
    expect(mutate).not.toHaveBeenCalled();
  });

  it('submits the create mutation with normalised payload', () => {
    const mutate = vi.fn();
    mockCreate.mockReturnValue({ mutate, isPending: false });
    renderPage('/admin/notifications/subscriptions/new');

    // selects[0] = event_key, selects[1] = channel, selects[2] = template
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'evt.x' } });
    // recipient_scope is now card buttons (ScopeCards), not a select — click "Entity owner"
    fireEvent.click(screen.getByText('Entity owner'));
    fireEvent.change(selects[2], { target: { value: 'tmpl-x' } }); // template
    fireEvent.click(screen.getByRole('button', { name: /create subscription/i }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toMatchObject({
      event_key: 'evt.x',
      recipient_scope: 'owner',
      template_key: 'tmpl-x',
      channel: 'email',
      priority: 100,
      is_active: true,
      throttle_window_sec: 0,
      recipient_role: null,
    });
  });
});

describe('NotificationSubscriptionFormPage — edit mode', () => {
  it('shows the loader while the existing row is being fetched', () => {
    mockSubscription.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = renderPage('/admin/notifications/subscriptions/42/edit');
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('hydrates form from the existing row and disables event_key', () => {
    // Use role_all scope so the recipient_role text input is rendered
    mockSubscription.mockReturnValue({
      data: {
        event_key: 'evt.x', recipient_role: 'SYSTEM_ADMIN',
        recipient_scope: 'role_all', channel: 'in_app',
        template_key: 'tmpl-x', priority: 50, is_active: false,
        throttle_window_sec: 600,
      },
      isLoading: false,
    });
    renderPage('/admin/notifications/subscriptions/42/edit');
    expect(screen.getByText(/subscription #42/i)).toBeInTheDocument();
    // In edit mode the component says "Event is fixed after creation…"
    expect(screen.getByText(/event is fixed after creation/i)).toBeInTheDocument();
    const selects = screen.getAllByRole('combobox');
    expect(selects[0]).toBeDisabled();
    expect(selects[0]).toHaveValue('evt.x');
    // recipient_role text input is shown because scope = role_all (needsRole = true)
    expect(screen.getByDisplayValue('SYSTEM_ADMIN')).toBeInTheDocument();
  });

  it('submits the update mutation with the existing values', () => {
    const mutate = vi.fn();
    mockUpdate.mockReturnValue({ mutate, isPending: false });
    mockSubscription.mockReturnValue({
      data: {
        event_key: 'evt.x', recipient_role: '', recipient_scope: 'entity_owner',
        channel: 'email', template_key: 'tmpl-x', priority: 25,
        is_active: true, throttle_window_sec: null,
      },
      isLoading: false,
    });
    renderPage('/admin/notifications/subscriptions/42/edit');
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toMatchObject({
      event_key: 'evt.x',
      recipient_scope: 'entity_owner',
      template_key: 'tmpl-x',
      priority: 25,
    });
  });
});
