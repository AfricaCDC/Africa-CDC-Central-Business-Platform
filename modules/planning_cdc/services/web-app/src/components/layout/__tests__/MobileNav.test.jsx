// ── MobileNav (burger menu) ──
//
// Same entries as the desktop bar, search on top, division and fiscal year
// pickers at the bottom; drawer closes on Escape, on the backdrop, after a
// link, a search or a picker change.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import MobileNav from '../MobileNav';
import { toMenuEntries } from '../navMatch';
import { ORG_LEVEL_TYPES } from '@rbm/lib/enums';

// The global setup pins useLocation to '/'; this component needs the real one.
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('../useNavItems', () => ({ default: () => NAV }));

const setActiveDivision = vi.fn();
const setPlanningYear = vi.fn();
let divisionState;
let yearState;
vi.mock('@/contexts/ActiveDivisionContext', () => ({ useActiveDivision: () => divisionState }));
vi.mock('@/contexts/PlanningYearContext', () => ({ usePlanningYear: () => yearState }));

const NAV = [
  { items: [{ label: 'Dashboard', path: '/dashboard' }] },
  { section: 'Reporting', items: [{ label: 'Activity Report', path: '/activity-report' }, { label: 'Quarterly Report', path: '/division-reports' }] },
  { section: 'Admin', items: [{ label: 'Users', path: '/admin/users' }] },
  { items: [{ label: 'PIRS', path: '/pirs', children: [{ label: 'All PIRS', path: '/pirs/all' }] }] },
];

/** Shows where the router went, to check the search submit. */
function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <MobileNav />
    <Routes><Route path="*" element={<Where />} /></Routes>
  </MemoryRouter>,
);

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

beforeEach(() => {
  vi.clearAllMocks();
  divisionState = {
    loaded: true,
    activeCode: null,
    setActiveDivision,
    divisions: [
      { code: 'DIR_X', division_name: 'Directorate X', level_type: ORG_LEVEL_TYPES.DIRECTORATE },
      { code: 'EPR', division_name: 'Emergency Preparedness', level_type: ORG_LEVEL_TYPES.DIVISION },
    ],
  };
  yearState = { planningYear: '2026', setPlanningYear, years: ['2026', '2027'], reportableYear: '2026', isLoading: false };
});

describe('toMenuEntries', () => {
  it('should keep single-item sections as links and others as titled sections', () => {
    const entries = toMenuEntries(NAV);
    expect(entries.map((e) => e.link?.label || e.title)).toEqual(['Dashboard', 'Reporting', 'Users', 'PIRS']);
    expect(entries[3].items).toEqual([{ label: 'All PIRS', path: '/pirs/all' }]);
  });
});

describe('<MobileNav />', () => {
  it('should render only the burger until opened', () => {
    renderAt('/division-reports');
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should open the drawer with every entry and the active section unfolded', () => {
    renderAt('/division-reports');
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = screen.getByRole('dialog', { name: 'Main menu' });
    expect(within(menu).getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: 'Users' })).toBeInTheDocument();
    expect(within(menu).getByText('Reporting').closest('details')).toHaveAttribute('open');
    expect(within(menu).getByText('PIRS').closest('details')).not.toHaveAttribute('open');
  });

  it('should close on Escape', () => {
    renderAt('/dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should close after choosing a link', () => {
    renderAt('/dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Users' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should close on the backdrop', () => {
    renderAt('/dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const closers = screen.getAllByRole('button', { name: 'Close menu' });
    fireEvent.click(closers[closers.length - 1]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should go to the search page with the query and close', () => {
    renderAt('/dashboard');
    open();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), { target: { value: 'malaria q3' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(screen.getByTestId('where')).toHaveTextContent('/search?q=malaria%20q3');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should switch division and fiscal year from the bottom pickers', () => {
    renderAt('/dashboard');
    open();
    fireEvent.change(screen.getByRole('combobox', { name: /^division$/i }), { target: { value: 'EPR' } });
    expect(setActiveDivision).toHaveBeenCalledWith('EPR');
    open();
    fireEvent.change(screen.getByRole('combobox', { name: /^division$/i }), { target: { value: '' } });
    expect(setActiveDivision).toHaveBeenLastCalledWith(null);
    open();
    expect(screen.getByRole('option', { name: 'FY 2027 (planning only)' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Fiscal year'), { target: { value: '2027' } });
    expect(setPlanningYear).toHaveBeenCalledWith('2027');
  });

  it('should hide the division picker with one division and show a single year as text', () => {
    divisionState = { ...divisionState, divisions: [divisionState.divisions[1]] };
    yearState = { ...yearState, years: ['2026'] };
    renderAt('/dashboard');
    open();
    expect(screen.queryByRole('combobox', { name: /^division$/i })).not.toBeInTheDocument();
    expect(screen.getByText('FY 2026')).toBeInTheDocument();
  });
});
