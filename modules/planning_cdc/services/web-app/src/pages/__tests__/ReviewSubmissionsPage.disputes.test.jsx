import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

vi.mock('@/components/layout/DashboardLayout', () => ({
  default: ({ children }) => <div data-testid="dashboard">{children}</div>,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  const { useState } = await vi.importActual('react');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    // Stateful: the page keeps its tab in the URL.
    useSearchParams: () => {
      const [params, setParams] = useState(() => new URLSearchParams());
      return [params, (next) => setParams((prev) => (typeof next === 'function' ? next(prev) : new URLSearchParams(next)))];
    },
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, division_code: 'DCM' } }),
}));

vi.mock('@/contexts/ActiveDivisionContext', () => ({
  useActiveDivision: () => ({ activeDivision: null, activeCodes: new Set() }),
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => true, getScope: () => 'all' }),
}));

const dismissIndicatorMutateAsync = vi.fn().mockResolvedValue({});

vi.mock('../review-submissions/hooks/useReviewSubmissionsQueries', () => ({
  useIndicatorReviewQueue: () => ({ data: [], isLoading: false }),
  useAllIndicatorReports: () => ({ data: [], isLoading: false }),
  useAwaitingCounts: () => ({ data: { specifics: [], quarterly: [], disputes: [] } }),
  useDisputes: () => ({
    data: [
      // eslint-disable-next-line no-restricted-syntax -- page-local dispute_type discriminator fixture value (which API a merged row came from), not an ENTITY_TYPES/ENTITY_TABLES reference; same false-positive shape as production code (D-20260702-06)
      { id: 1, dispute_type: 'ACTIVITY', activity_code: 'SA-1', activity_name: 'Activity one', prepared_by_name: 'Jane', responsible_division_code: 'DCM', narrative: 'Not ours', created_at: '2026-06-01' },
      // flagged_by_* (not sub_*) is what a real GET /all row carries for an INDICATOR dispute —
      // submitted_by is always NULL here since the report was flagged instead of submitted.
      // eslint-disable-next-line no-restricted-syntax -- see ACTIVITY fixture above
      { id: 42, dispute_type: 'INDICATOR', indicator_code: 'T3-1', indicator_title: 'Indicator one', flagged_by_first_name: 'John', flagged_by_last_name: 'Doe', division_code: 'AMERT', rejection_reason: 'Wrong division', updated_at: '2026-06-02' },
    ],
    isLoading: false,
  }),
  useDivisionCodes: () => ({ data: [] }),
  useActivityReportsForReview: () => ({ data: [], isLoading: false }),
  useApproveIndicatorDivisionReport: () => ({ mutateAsync: vi.fn() }),
  useApproveActivityReport: () => ({ mutateAsync: vi.fn() }),
  useRejectActivityReport: () => ({ mutateAsync: vi.fn() }),
  useReassignDispute: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDismissDispute: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDismissIndicatorDispute: () => ({ mutateAsync: dismissIndicatorMutateAsync, isPending: false }),
}));

vi.mock('../reporting/hooks/useReportingQueries', () => ({
  useReportingPeriods: () => ({ data: [{ quarter: 'Q2', fiscal_year: '2026', status: 'OPEN' }], isLoading: false }),
}));

vi.mock('../reporting/hooks/useReportingYear', () => ({
  useReportingYear: () => ({ fiscalYear: '2026', isResolvingYear: false }),
}));

import ReviewSubmissionsPage from '../ReviewSubmissionsPage';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReviewSubmissionsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  dismissIndicatorMutateAsync.mockClear();
  // vitest.config.js sets `restoreMocks: true`, which wipes the global axios
  // stub's `.mockResolvedValue` (wired once in src/__tests__/setup.js) before
  // every test. Re-arm it so any direct API call made outside the mocked hooks
  // resolves. Same pattern as `MySpecificsPage.test.jsx`'s `beforeEach`.
  api.get.mockResolvedValue({ data: {} });
});

describe('ReviewSubmissionsPage — generalized Disputes tab', () => {
  it('shows both Activity and Indicator type badges, and hides Reassign for indicator rows', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Ownership Disputes'));

    await waitFor(() => expect(screen.getByText('SA-1')).toBeInTheDocument());
    expect(screen.getByText('T3-1')).toBeInTheDocument();
    // eslint-disable-next-line no-restricted-syntax -- human-readable Type-column badge label in the rendered table, not an entity-type reference (precedent: CSV header labels like "Division"/"Status")
    expect(screen.getByText('Activity')).toBeInTheDocument();
    // eslint-disable-next-line no-restricted-syntax -- see 'Activity' badge assertion above
    expect(screen.getByText('Indicator')).toBeInTheDocument();

    // Only one Reassign button — for the ACTIVITY row.
    expect(screen.getAllByText('Reassign')).toHaveLength(1);
    // Both rows get a Dismiss button.
    expect(screen.getAllByText('Dismiss')).toHaveLength(2);
    // "Flagged by" renders the real actor for the indicator row (from
    // flagged_by_first_name/last_name), not a blank "—".
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane')).toBeInTheDocument();
  });

  it('dismisses an indicator dispute via the admin-set-status mutation', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Ownership Disputes'));
    await waitFor(() => expect(screen.getByText('T3-1')).toBeInTheDocument());

    const rows = screen.getAllByText('Dismiss');
    fireEvent.click(rows[1]); // second row = INDICATOR (activity row is listed first)

    fireEvent.click(screen.getByRole('button', { name: /Dismiss Dispute/i }));

    await waitFor(() => expect(dismissIndicatorMutateAsync).toHaveBeenCalledWith(
      // eslint-disable-next-line no-restricted-syntax -- see ACTIVITY fixture above
      expect.objectContaining({ row: expect.objectContaining({ id: 42, dispute_type: 'INDICATOR' }) })
    ));
  });
});
