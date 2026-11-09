import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ query: {}, navigate: vi.fn() }));

vi.mock('@/components/layout/DashboardLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('@/contexts/PlanningYearContext', () => ({ usePlanningYear: () => ({ planningYear: '2027' }) }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => state.navigate };
});
vi.mock('../hooks/useDataHealthQueries', () => ({ useDataHealth: () => state.query }));

import DataHealthPage from '../DataHealthPage';

const rows = (n) => Array.from({ length: n }, (_, i) => ({ ref: `U${i}`, code: `U${i}`, name: `Unit ${i}`, detail: 'Missing: Focal person', path: `/reference/org/U${i}` }));
const CHECKS = [
  { key: 'unit_people', label: 'Business units without their people', hint: 'Approvals fall back.', per_year: true, count: 20, rows: rows(20) },
  { key: 'user_unit', label: 'Active users without a unit', hint: 'They see no workplan.', per_year: false, count: 0, rows: [] },
];
const renderPage = () => render(<MemoryRouter><DataHealthPage /></MemoryRouter>);

beforeEach(() => {
  state.navigate.mockReset();
  state.query = { data: { fiscal_year: '2027', checks: CHECKS }, isLoading: false, error: null, refetch: vi.fn() };
});

describe('DataHealthPage', () => {
  it('should show the year, the total and each check', () => {
    renderPage();
    expect(screen.getByText('Data Health 2027')).toBeTruthy();
    expect(screen.getByText('20 records to complete in 1 of 2 checks.')).toBeTruthy();
    expect(screen.getByText('Business units without their people')).toBeTruthy();
    expect(screen.getByText('Complete')).toBeTruthy();
  });

  it('should list 15 rows, then 15 more on demand', () => {
    renderPage();
    expect(screen.getAllByText('Missing: Focal person')).toHaveLength(15);
    fireEvent.click(screen.getByText('Show 5 more'));
    expect(screen.getAllByText('Missing: Focal person')).toHaveLength(20);
  });

  it('should open the page where a row is fixed', () => {
    renderPage();
    fireEvent.click(screen.getByText('Unit 3'));
    expect(state.navigate).toHaveBeenCalledWith('/reference/org/U3');
  });

  it('should say when every check is complete', () => {
    state.query.data = { fiscal_year: '2027', checks: [CHECKS[1]] };
    renderPage();
    expect(screen.getByText('Every check is complete.')).toBeTruthy();
  });

  it('should offer a retry on a failure but not on a refusal', () => {
    state.query = { data: undefined, isLoading: false, error: { response: { status: 500 } }, refetch: vi.fn() };
    const { unmount } = renderPage();
    fireEvent.click(screen.getByText('Try again'));
    expect(state.query.refetch).toHaveBeenCalled();
    unmount();
    state.query = { data: undefined, isLoading: false, error: { response: { status: 403, data: { message: 'Insufficient permissions' } } }, refetch: vi.fn() };
    renderPage();
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('should show a loader while loading', () => {
    state.query = { data: undefined, isLoading: true, error: null, refetch: vi.fn() };
    renderPage();
    expect(screen.queryByText('Business units without their people')).toBeNull();
  });
});
