import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const state = vi.hoisted(() => ({ seen: {}, mutate: vi.fn(), visible: new Set() }));

// Real routing: the global setup stubs useLocation and useNavigate.
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 7 } }) }));
vi.mock('@/stores/usePermissionStore', () => ({ default: (select) => select({ loadedAt: 1 }) }));
vi.mock('../useTourQueries', () => ({
  useTourSeen: () => state.seen,
  useSaveTourSeen: () => ({ mutate: state.mutate }),
}));
vi.mock('../tourGeometry', async () => ({
  ...(await vi.importActual('../tourGeometry')),
  anchorRect: (target) => (state.visible.has(target) ? { top: 10, left: 10, width: 40, height: 40 } : null),
}));

import OnboardingTour from '../OnboardingTour';
import { useTourStore } from '@/stores/useTourStore';
import { FULL_TOUR, TOUR_VERSION } from '@/config/onboardingTour';

const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="*" element={<OnboardingTour />} />
      <Route path="/user-guides" element={<><OnboardingTour /><div>Guides page</div></>} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  state.seen = { isSuccess: true, data: null };
  state.mutate.mockReset();
  state.visible = new Set();
  useTourStore.setState({ mode: null, index: 0, autoChecked: false });
});

describe('OnboardingTour', () => {
  it('should open the full tour at the first visit of the dashboard', () => {
    renderAt('/dashboard');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(FULL_TOUR[0].title)).toBeTruthy();
  });

  it('should leave out the steps whose anchor is not on screen', () => {
    state.visible = new Set(['avatar']);
    renderAt('/dashboard');
    expect(screen.getByText('1 of 3')).toBeTruthy();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Your menu')).toBeTruthy();
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText(FULL_TOUR[0].title)).toBeTruthy();
  });

  it('should not open on a deep link such as a decision from an email', () => {
    renderAt('/decide/abc');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('should not open for a user who saw the current version', () => {
    state.seen = { isSuccess: true, data: TOUR_VERSION };
    renderAt('/dashboard');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('should not open before the version seen is known', () => {
    state.seen = { isSuccess: false, data: undefined };
    renderAt('/dashboard');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('should record the version as skipped and close on Escape', () => {
    renderAt('/dashboard');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(state.mutate).toHaveBeenCalledWith({ version: TOUR_VERSION, outcome: 'SKIPPED' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('should move with the arrow keys', () => {
    renderAt('/dashboard');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
    expect(screen.getByText('2 of 2')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' });
    expect(screen.getByText('1 of 2')).toBeTruthy();
  });

  it('should record the version as finished on Finish', () => {
    renderAt('/dashboard');
    fireEvent.click(screen.getByText('Next'));
    expect(screen.queryByText('Skip the tour')).toBeNull();
    fireEvent.click(screen.getByText('Finish'));
    expect(state.mutate).toHaveBeenCalledWith({ version: TOUR_VERSION, outcome: 'FINISHED' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('should open the guides from the last step', () => {
    renderAt('/dashboard');
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Open the guides'));
    expect(state.mutate).toHaveBeenCalledWith({ version: TOUR_VERSION, outcome: 'FINISHED' });
    expect(screen.getByText('Guides page')).toBeTruthy();
  });

  it('should open on demand from the menu, on any page, for a user who saw it', () => {
    state.seen = { isSuccess: true, data: TOUR_VERSION };
    renderAt('/plan/node/4');
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => useTourStore.getState().start('full'));
    expect(screen.getByText(FULL_TOUR[0].title)).toBeTruthy();
  });
});
