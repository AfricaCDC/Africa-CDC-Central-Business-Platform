import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const state = vi.hoisted(() => ({ countries: [] }));

// Real routing: the global setup stubs useLocation and useNavigate.
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/components/layout/DashboardLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('@/pages/country-workplan/hooks/useCountryWorkplanQueries', () => ({ useViewableCountries: () => ({ data: state.countries }) }));

import MemberStatesPage from '../MemberStatesPage';

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}{loc.search}</div>;
}

const renderAt = (url = '/reference/member-states') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/reference/member-states" element={<><MemberStatesPage /><Where /></>} />
      <Route path="*" element={<Where />} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => { state.countries = []; });

describe('MemberStatesPage', () => {
  it('should list the 55 AU member states with their regions', () => {
    renderAt();
    expect(screen.getByText('55 countries')).toBeTruthy();
    expect(screen.getByText('Algeria')).toBeTruthy();
    expect(screen.getByText('ZWE · Southern')).toBeTruthy();
    expect(screen.getByRole('button', { name: /16\s*Western RCC/ })).toBeTruthy();
  });

  it('should filter by region through the URL', () => {
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: /Northern RCC/ }));
    expect(screen.getByTestId('where').textContent).toBe('/reference/member-states?region=Northern');
    expect(screen.getByText('7 countries')).toBeTruthy();
    expect(screen.queryByText('Kenya')).toBeNull();
  });

  it('should find a country by name or exact ISO code', () => {
    renderAt('/reference/member-states?q=ken');
    expect(screen.getByText('1 country')).toBeTruthy();
    expect(screen.getByText('Kenya')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search member states' }), { target: { value: 'nig' } });
    expect(screen.getByText('Niger')).toBeTruthy();
    expect(screen.getByText('Nigeria')).toBeTruthy();
  });

  it('should say when nothing matches and clear the filters', () => {
    renderAt('/reference/member-states?q=zz&region=Central');
    expect(screen.getByText('No member state matches "zz".')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByTestId('where').textContent).toBe('/reference/member-states');
  });

  it('should open the Country Workplan of a country the user can see', () => {
    state.countries = [{ code: 'KEN', name: 'Kenya' }];
    renderAt();
    expect(screen.getByText('with a Country Workplan', { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: /Kenya/ }));
    expect(screen.getByTestId('where').textContent).toBe('/country-workplan?country=KEN');
    expect(screen.queryByRole('link', { name: /Uganda/ })).toBeNull();
  });
});
