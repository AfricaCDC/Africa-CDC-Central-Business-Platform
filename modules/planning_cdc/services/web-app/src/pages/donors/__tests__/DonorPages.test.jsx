import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const state = vi.hoisted(() => ({ query: {} }));

// Real routing: the global setup stubs useLocation and useNavigate.
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/components/layout/DashboardLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('@/contexts/PlanningYearContext', () => ({ usePlanningYear: () => ({ planningYear: '2026' }) }));
vi.mock('@/hooks/useBudgetQueries', () => ({ useBudgetCodes: () => state.query }));

import DonorsPage from '../DonorsPage';
import DonorDetailPage from '../DonorDetailPage';

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}{loc.search}</div>;
}

const renderAt = (url) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/reporting/donors" element={<><DonorsPage /><Where /></>} />
      <Route path="/reporting/donors/:sourceId" element={<><DonorDetailPage /><Where /></>} />
      <Route path="*" element={<Where />} />
    </Routes>
  </MemoryRouter>,
);

const code = (id, extra = {}) => ({
  id, funding_source_id: 48, funding_source_name: 'World Bank', amount: 10, plan_node_id: 3,
  broad_code: '1.2.3', broad_title: 'Lab network', division_name: 'Digital', budget_code: `BC${id}`, ...extra,
});

beforeEach(() => { state.query = { data: [], isLoading: false, isError: false, refetch: vi.fn() }; });

describe('DonorsPage', () => {
  it('should list the funding sources and open one on click', () => {
    state.query.data = [code(1), code(2, { funding_source_id: 55, funding_source_name: 'CEPI', amount: 30, plan_node_id: 9 })];
    renderAt('/reporting/donors');
    expect(screen.getByText('2 funding sources', { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByText('CEPI'));
    expect(screen.getByTestId('where').textContent).toBe('/reporting/donors/55');
  });

  it('should say when no budget code has a funding source', () => {
    renderAt('/reporting/donors');
    expect(screen.getByText('No budget code of 2026 has a funding source yet')).toBeTruthy();
  });

  it('should offer a retry on error', () => {
    state.query = { ...state.query, isError: true };
    renderAt('/reporting/donors');
    fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }));
    expect(state.query.refetch).toHaveBeenCalled();
  });
});

describe('DonorDetailPage', () => {
  it('should list the codes of the source 15 per page, page in the URL', () => {
    state.query.data = Array.from({ length: 16 }, (_, i) => code(i + 1));
    renderAt('/reporting/donors/48');
    expect(screen.getByRole('heading', { name: 'World Bank' })).toBeTruthy();
    expect(screen.getByText('BC15')).toBeTruthy();
    expect(screen.queryByText('BC16')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByTestId('where').textContent).toBe('/reporting/donors/48?page=2');
    expect(screen.getByText('BC16')).toBeTruthy();
  });

  it('should open the broad activity of a code', () => {
    state.query.data = [code(1)];
    renderAt('/reporting/donors/48');
    fireEvent.click(screen.getByText('BC1'));
    expect(screen.getByTestId('where').textContent).toBe('/plan/node/3');
  });

  it('should send an old donor-name link to the list', () => {
    renderAt('/reporting/donors/worldbank');
    expect(screen.getByTestId('where').textContent).toBe('/reporting/donors');
  });
});
