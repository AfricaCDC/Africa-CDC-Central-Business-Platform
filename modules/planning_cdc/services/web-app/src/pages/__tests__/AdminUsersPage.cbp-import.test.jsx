// ── AdminUsersPage — Import CBP users button (D-20260713-01) ──
//
// Covers: RBAC visibility (sync:execute), the one-shot import call with a
// success summary toast + list refresh, and the upstream-failure error path.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockCan, mockToast, mockApiGet, mockApiPost } = vi.hoisted(() => ({
  mockCan: vi.fn(() => true),
  mockToast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: mockCan, getScope: () => 'all' }),
}));

vi.mock('sonner', () => ({ toast: mockToast }));

vi.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: mockApiGet, post: mockApiPost, put: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }) => <div data-testid="dashboard">{children}</div>,
}));

import AdminUsersPage from '../AdminUsersPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCan.mockReturnValue(true);
  // /admin/users, /admin/roles, /admin/division-codes
  mockApiGet.mockResolvedValue({ data: { data: [] } });
  // The api interceptor unwraps the { success, data } envelope, so the summary arrives directly.
  mockApiPost.mockResolvedValue({
    data: { fetched: 461, eligible: 439, inserted: 82, updated: 300, skipped: 57 },
  });
});

describe('AdminUsersPage — Import CBP users', () => {
  it('shows the button for holders of sync:execute', async () => {
    renderPage();
    expect(await screen.findByText('Import CBP users')).toBeInTheDocument();
  });

  it('hides the button without the permission', async () => {
    mockCan.mockReturnValue(false);
    renderPage();
    expect(await screen.findByText('New User')).toBeInTheDocument();
    expect(screen.queryByText('Import CBP users')).not.toBeInTheDocument();
  });

  it('calls the import endpoint and toasts the summary', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Import CBP users'));
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('/admin/import-cbp-users', {}));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith(
      'CBP import: 82 created, 300 completed, 57 already up to date (439 CBP accounts scanned)',
    ));
  });

  it('surfaces the backend message when CBP is unreachable', async () => {
    mockApiPost.mockRejectedValue({ response: { data: { message: 'Could not reach the CBP staff directory — check CBP_AUTH_USERNAME / CBP_AUTH_PASSWORD on the server.' } } });
    renderPage();
    fireEvent.click(await screen.findByText('Import CBP users'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(expect.stringContaining('CBP')));
    expect(mockToast.success).not.toHaveBeenCalled();
  });
});
