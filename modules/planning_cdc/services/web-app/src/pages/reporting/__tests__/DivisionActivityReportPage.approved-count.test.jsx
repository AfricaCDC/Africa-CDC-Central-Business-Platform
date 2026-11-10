// ── DivisionActivityReportPage — hero % counts APPROVED reports ──
//
// Regression (RefLAB Q1): both indicators showed Status "Approved" (new
// indicator_division_reports source) yet the hero said "0 / 2 reported —
// 0%". The counters read the LEGACY quarter maps only and counted just
// SUBMITTED/VALIDATED. They now merge the new per-division reports and use
// the dashboard rule: reported = anything but DRAFT/REJECTED.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/components/layout/DashboardLayout', () => ({
  default: ({ children }) => <div data-testid="dashboard">{children}</div>,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, division_code: 'REFLAB' } }),
}));

vi.mock('@/contexts/ActiveDivisionContext', () => ({
  useActiveDivision: () => ({ activeDivision: { code: 'RefLAB' }, activeCodes: new Set(['REFLAB']) }),
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => false }),
}));

// The real list hook, so the statuses still come from the mocked api.get.
vi.mock('../hooks/useReportingQueries', async () => ({
  ...(await vi.importActual('../hooks/useReportingQueries')),
  useDivisionIndicatorsData: () => ({
    data: {
      broads: [],
      specifics: [],
      t3: [
        { id: 6119, code: 'RefLab.5.4-3', title: 'Clusters', responsible_division_code: 'RefLAB', tier_id: 3 },
        { id: 6120, code: 'RefLab.5.4-4', title: 'Critical documents', responsible_division_code: 'RefLAB', tier_id: 3 },
      ],
      t4: [],
      // Legacy quarter maps EMPTY — reports only exist in the new table.
      reports: { Q1: [], Q2: [], Q3: [], Q4: [] },
      periods: [{ quarter: 'Q1', status: 'OPEN' }],
      divisions: [],
    },
    isLoading: false,
  }),
}));

import api from '@/services/api';
import DivisionActivityReportPage from '../DivisionActivityReportPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DivisionActivityReportPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.get.mockImplementation((url) => {
    // The page's useEffect pulls the NEW per-division reports here.
    if (String(url).includes('indicator-division-reports') && !String(url).includes('owner-not-applicable')) {
      return Promise.resolve({
        data: {
          data: [
            { plan_node_id: 6119, quarter: 'Q1', fiscal_year: '2026', status: 'APPROVED', actual_value: 1 },
            { plan_node_id: 6120, quarter: 'Q1', fiscal_year: '2026', status: 'APPROVED', actual_value: 20 },
          ],
        },
      });
    }
    return Promise.resolve({ data: [] });
  });
});

describe('DivisionActivityReportPage — approved reports count as reported', () => {
  it('shows 2/2 reported (100%) when both new-model reports are APPROVED', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('2 / 2 reported')).toBeInTheDocument());
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('keeps 0/2 when the new-model reports are still DRAFT', async () => {
    api.get.mockImplementation((url) => {
      if (String(url).includes('indicator-division-reports') && !String(url).includes('owner-not-applicable')) {
        return Promise.resolve({
          data: {
            data: [
              { plan_node_id: 6119, quarter: 'Q1', fiscal_year: '2026', status: 'DRAFT' },
              { plan_node_id: 6120, quarter: 'Q1', fiscal_year: '2026', status: 'REJECTED' },
            ],
          },
        });
      }
      return Promise.resolve({ data: [] });
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('0 / 2 reported')).toBeInTheDocument());
  });
});
