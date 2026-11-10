import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const state = vi.hoisted(() => ({ query: {} }));

// Real routing: the global setup stubs useLocation and useNavigate.
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/components/layout/DashboardLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('@/hooks/useMiscQueries', () => ({ useDivisionCodes: () => ({ data: [{ code: 'SDI', division_name: 'Surveillance' }] }) }));
vi.mock('../hooks/useAdoptionQueries', () => ({ useAdoption: (payload) => { state.payload = payload; return state.query; } }));

import AdoptionPage from '../AdoptionPage';

const USER = {
  id: 7, full_name: 'Focal Person A', email: 'focal.a@example.org', unit_code: 'SDI', roles: ['FOCAL_PERSON'],
  last_login_at: null, tour_version_seen: '1.3', tour_outcome: 'SKIPPED',
  submitted: { specifics: 0, activity_reports: 0, indicator_reports: 0 }, last_submitted_at: null,
};
const DATA = {
  summary: { users: 40, never_signed_in: 12, signed_in_recently: 20, tour_taken: 15, tour_skipped: 4, never_submitted: 18 },
  rows: [USER], total: 1, page: 1, page_size: 15, recent_days: 30,
};

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}{loc.search}</div>;
}

const renderAt = (url = '/admin/adoption') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/admin/adoption" element={<><AdoptionPage /><Where /></>} />
      <Route path="/admin/users" element={<Where />} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  state.query = { data: DATA, isLoading: false, error: null, refetch: vi.fn() };
});

describe('AdoptionPage', () => {
  it('should show the counters and each user with sign-in, tour and submissions', () => {
    renderAt();
    const counter = (name) => screen.getByRole('button', { name: new RegExp(`^${name}`) });
    expect(within(counter('Never signed in')).getByText('12')).toBeTruthy();
    expect(within(counter('Tour not taken')).getByText('25')).toBeTruthy();
    expect(screen.getByText('Focal Person A')).toBeTruthy();
    expect(screen.getByText('Never')).toBeTruthy();
    expect(screen.getByText('Skipped (v1.3)')).toBeTruthy();
    expect(screen.getByText('Nothing yet')).toBeTruthy();
  });

  it('should apply a filter from its counter, in the URL', () => {
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: /^Never submitted/ }));
    expect(screen.getByTestId('where').textContent).toBe('/admin/adoption?filter=NEVER_SUBMITTED');
  });

  it('should send the URL filters to the API, the unit as `unit`', () => {
    renderAt('/admin/adoption?filter=NO_TOUR&bu=SDI&page=2');
    expect(screen.getByLabelText('Show').value).toBe('NO_TOUR');
    expect(state.payload).toEqual({ filter: 'NO_TOUR', unit: 'SDI', page: 2 });
  });

  it('should open the user in Users & Roles when a row is clicked', () => {
    renderAt();
    fireEvent.click(screen.getByText('Focal Person A'));
    expect(screen.getByTestId('where').textContent).toBe('/admin/users?q=focal.a%40example.org');
  });

  it('should explain a refusal without offering a retry', () => {
    state.query = { data: undefined, isLoading: false, error: { response: { status: 403 } }, refetch: vi.fn() };
    renderAt();
    expect(screen.getByText('You do not have access to the adoption of the platform.')).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('should offer a retry on another error', () => {
    state.query = { data: undefined, isLoading: false, error: { response: { status: 500 } }, refetch: vi.fn() };
    renderAt();
    fireEvent.click(screen.getByText('Try again'));
    expect(state.query.refetch).toHaveBeenCalled();
  });

  it('should say when no user matches', () => {
    state.query = { ...state.query, data: { ...DATA, rows: [], total: 0 } };
    renderAt();
    expect(screen.getByText('No user matches these filters')).toBeTruthy();
  });
});
