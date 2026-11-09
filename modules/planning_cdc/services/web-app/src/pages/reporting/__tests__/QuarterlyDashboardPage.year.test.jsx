import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Real routing: the global setup stubs useLocation and useNavigate.
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/components/layout/DashboardLayout', () => ({ __esModule: true, default: ({ children }) => <div>{children}</div> }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => false }) }));
vi.mock('@/services/export.api', () => ({ exportApi: {}, triggerDownload: vi.fn() }));
// Like the real context: the URL's ?fy= wins, else the stored year (2027 after New Year).
vi.mock('@/contexts/PlanningYearContext', async () => {
  const { useSearchParams } = await vi.importActual('react-router-dom');
  return { usePlanningYear: () => ({ planningYear: useSearchParams()[0].get('fy') || '2027', years: ['2027', '2026'], isLoading: false }) };
});

const { mockDashboard } = vi.hoisted(() => ({ mockDashboard: vi.fn() }));
vi.mock('../hooks/useReportingQueries', () => ({
  useQuarterlyDashboard: mockDashboard,
  useReportingPeriods: () => ({ data: [{ quarter: 'Q4', fiscal_year: 2026, status: 'OPEN', end_date: '2027-01-30' }], isLoading: false }),
}));

import QuarterlyDashboardPage from '../QuarterlyDashboardPage';

const renderAt = (url) => render(<MemoryRouter initialEntries={[url]}><QuarterlyDashboardPage /></MemoryRouter>);

describe('QuarterlyDashboardPage — reporting year', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-01-15T09:00:00Z'));
    mockDashboard.mockReturnValue({ data: null, isLoading: false, error: null });
  });
  afterEach(() => vi.useRealTimers());

  it('should show the year of the open Q4 window in January, not the clock year', () => {
    renderAt('/reporting/quarterly');
    expect(mockDashboard).toHaveBeenLastCalledWith({ fiscalYear: '2026', quarter: null });
  });

  it('should read the quarter from the URL', () => {
    renderAt('/reporting/quarterly?q=Q3&fy=2026');
    expect(mockDashboard).toHaveBeenLastCalledWith({ fiscalYear: '2026', quarter: 'Q3' });
  });
});
