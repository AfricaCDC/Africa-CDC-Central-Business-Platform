import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({ mockIsHealthy: vi.fn() }));

vi.mock('@/services/health.api', () => ({
  isBackendHealthy: hoisted.mockIsHealthy,
}));

import BackendStatusBanner from '../BackendStatusBanner';

describe('BackendStatusBanner', () => {
  beforeEach(() => {
    hoisted.mockIsHealthy.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => {
    if (vi.isFakeTimers()) vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('renders nothing while the backend is reachable', () => {
    render(<BackendStatusBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the reconnecting banner on an api:backend-unreachable event', () => {
    render(<BackendStatusBanner />);
    act(() => { window.dispatchEvent(new CustomEvent('api:backend-unreachable')); });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/connexion au serveur interrompue/i)).toBeInTheDocument();
  });

  it('hides the banner on an api:backend-reachable event', () => {
    render(<BackendStatusBanner />);
    act(() => { window.dispatchEvent(new CustomEvent('api:backend-unreachable')); });
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => { window.dispatchEvent(new CustomEvent('api:backend-reachable')); });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('auto-clears once the health poll reports the backend is healthy', async () => {
    // Real timers here: the effect fires an immediate health ping on going
    // down, and waitFor needs real time to observe the async resolution.
    vi.useRealTimers();
    hoisted.mockIsHealthy.mockResolvedValue(true);
    render(<BackendStatusBanner />);
    act(() => { window.dispatchEvent(new CustomEvent('api:backend-unreachable')); });
    expect(screen.getByRole('status')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(hoisted.mockIsHealthy).toHaveBeenCalled();
  });
});
