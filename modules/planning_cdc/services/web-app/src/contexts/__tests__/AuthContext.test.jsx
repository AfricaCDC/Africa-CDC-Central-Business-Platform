// ── AuthContext tests ──
//
// The provider:
//   1. shows the cached user from authService.getCurrentUser() at once;
//   2. when a session exists, refreshes it through authService.fetchProfile()
//      (React Query) and keeps the cached user if that call fails;
//   3. exposes logout (wraps authService.logout).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { authService } from '@/services/api';
import { AuthProvider, useAuth } from '../AuthContext';

vi.mock('@/services/api', () => ({
  __esModule: true,
  default: {},
  authService: {
    logout: vi.fn(),
    getCurrentUser: vi.fn(),
    hasSession: vi.fn(),
    fetchProfile: vi.fn(),
  },
}));

function TestConsumer() {
  const { user, loading, logout } = useAuth();
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="user">{user ? user.email : 'none'}</div>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

function renderProvider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  authService.logout.mockReset();
  authService.getCurrentUser.mockReset().mockReturnValue(null);
  authService.hasSession.mockReset().mockReturnValue(false);
  authService.fetchProfile.mockReset().mockResolvedValue(null);
});

describe('<AuthProvider />', () => {
  it('should render children with no user when there is no session', async () => {
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    );
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(authService.fetchProfile).not.toHaveBeenCalled();
  });

  it('should refresh the cached user from /auth/me when a session exists', async () => {
    authService.getCurrentUser.mockReturnValue({ id: 1, email: 'seed@x.com' });
    authService.hasSession.mockReturnValue(true);
    authService.fetchProfile.mockResolvedValue({ id: 1, email: 'fresh@x.com', division_code: 'DIG' });

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent('fresh@x.com')
    );
    expect(authService.fetchProfile).toHaveBeenCalledTimes(1);
  });

  it('should keep the cached user when /auth/me fails (interceptor handles the 401)', async () => {
    authService.getCurrentUser.mockReturnValue({ id: 1, email: 'seed@x.com' });
    authService.hasSession.mockReturnValue(true);
    authService.fetchProfile.mockRejectedValue(new Error('Request failed'));

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    );
    expect(screen.getByTestId('user')).toHaveTextContent('seed@x.com');
  });

  it('should expose logout() which delegates to authService.logout and clears user state', async () => {
    authService.getCurrentUser.mockReturnValue({ id: 3, email: 'bye@x.com' });
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent('bye@x.com')
    );

    await act(async () => {
      await userEvent.click(screen.getByText('logout'));
    });

    expect(authService.logout).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('user')).toHaveTextContent('none');
  });
});

describe('useAuth()', () => {
  it('should return null when called outside an AuthProvider', () => {
    // The context default is `null`, so useAuth() returns null rather than
    // throwing. The LoginPage + nav guards rely on this behaviour.
    function NakedConsumer() {
      const auth = useAuth();
      return <div data-testid="auth">{auth === null ? 'null' : 'has'}</div>;
    }
    render(<NakedConsumer />);
    expect(screen.getByTestId('auth')).toHaveTextContent('null');
  });
});
