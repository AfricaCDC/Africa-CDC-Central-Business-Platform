// ── ReviewSubmissionsPage — whole-quarter export button ──
//
// M&E asked "can I download the whole Q2 report?" from this page — the
// button now lives in the hero (same endpoint + RBAC as the Quarterly
// Dashboard's). Covers: visibility gated by quarterly_report:export,
// and the export call carrying the page's active quarter.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, division_code: 'DCM' } }),
}));

vi.mock('@/contexts/ActiveDivisionContext', () => ({
  useActiveDivision: () => ({ activeDivision: null, activeCodes: new Set() }),
}));

const { mockCan } = vi.hoisted(() => ({ mockCan: vi.fn(() => true) }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: mockCan, getScope: () => 'all' }),
}));

const { mockQuarterlyExport, mockActivityExport } = vi.hoisted(() => ({
  mockQuarterlyExport: vi.fn().mockResolvedValue({ data: new Blob(['x']), headers: {} }),
  mockActivityExport: vi.fn().mockResolvedValue({ data: new Blob(['x']), headers: {} }),
}));
vi.mock('@/services/export.api', () => ({
  exportApi: { quarterlyReport: mockQuarterlyExport, activityReport: mockActivityExport },
  triggerDownload: vi.fn(),
}));

const { mockRemind } = vi.hoisted(() => ({ mockRemind: vi.fn() }));
vi.mock('@/services/reviewSubmissions.api', () => ({ reviewSubmissionsApi: { remindDrafts: mockRemind } }));

vi.mock('../reporting/hooks/useReportingQueries', () => ({
  useReportingPeriods: () => ({ data: [{ quarter: 'Q2', fiscal_year: '2026', status: 'OPEN' }], isLoading: false }),
}));

vi.mock('../reporting/hooks/useReportingYear', () => ({
  useReportingYear: () => ({ fiscalYear: '2026', isResolvingYear: false }),
}));

vi.mock('@/components/reviews/SpecificActivityReviewTable', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('../review-submissions/hooks/useReviewSubmissionsQueries', () => ({
  useIndicatorReviewQueue: () => ({ data: [], isLoading: false }),
  useAllIndicatorReports: () => ({ data: [], isLoading: false }),
  useAwaitingCounts: () => ({ data: { specifics: [], quarterly: [], disputes: [] } }),
  useDisputes: () => ({ data: [], isLoading: false }),
  useDivisionCodes: () => ({ data: [] }),
  useActivityReportsForReview: () => ({ data: [], isLoading: false }),
  useApproveIndicatorDivisionReport: () => ({ mutateAsync: vi.fn() }),
  useApproveActivityReport: () => ({ mutateAsync: vi.fn() }),
  useRejectActivityReport: () => ({ mutateAsync: vi.fn() }),
  useReassignDispute: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDismissDispute: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDismissIndicatorDispute: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }) => <div data-testid="dashboard">{children}</div>,
}));

import { MemoryRouter } from 'react-router-dom';
import ReviewSubmissionsPage from '../ReviewSubmissionsPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <ReviewSubmissionsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // restoreMocks: true wipes factory-armed implementations — re-arm here
  // (repo convention, see MySpecificsPage.test.jsx precedent).
  mockCan.mockReturnValue(true);
  mockQuarterlyExport.mockResolvedValue({ data: new Blob(['x']), headers: {} });
  mockActivityExport.mockResolvedValue({ data: new Blob(['x']), headers: {} });
  mockRemind.mockImplementation(({ dryRun }) => Promise.resolve({ data: dryRun ? { users_targeted: 3, total_drafts: 5, sample: [] } : { enqueued: 3 } }));
});

describe('ReviewSubmissionsPage — quarterly export button', () => {
  it('shows the export button when the user holds quarterly_report:export', async () => {
    renderPage();
    // The open reporting period is Q2 → label follows the page quarter.
    expect(await screen.findByText('Quarterly report Q2')).toBeInTheDocument();
  });

  it('hides the export button without the permission', () => {
    mockCan.mockReturnValue(false);
    renderPage();
    expect(screen.queryByText(/report(s)? Q/)).not.toBeInTheDocument();
  });

  it('downloads the ACTIVE quarter when a format is picked', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Quarterly report Q2'));
    fireEvent.click(await screen.findByText(/xlsx/i));
    await waitFor(() => expect(mockQuarterlyExport).toHaveBeenCalledWith(
      expect.objectContaining({ quarter: 'Q2', fiscalYear: '2026', format: 'xlsx' }),
    ));
  });
});

describe('ReviewSubmissionsPage — activity reports export button', () => {
  it('should download the activity reports of the ACTIVE quarter', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Activity reports Q2'));
    fireEvent.click(await screen.findByText(/xlsx/i));
    await waitFor(() => expect(mockActivityExport).toHaveBeenCalledWith(
      expect.objectContaining({ quarter: 'Q2', format: 'xlsx' }),
    ));
    expect(mockQuarterlyExport).not.toHaveBeenCalled();
  });
});

describe('ReviewSubmissionsPage — remind draft reporters', () => {
  it('should preview then send through the API service, without a browser confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderPage();
    fireEvent.click(await screen.findByText('Remind draft reporters', { selector: 'button' }));
    fireEvent.click(screen.getByText('Preview'));
    fireEvent.click(await screen.findByText('Send to 3 users'));
    await waitFor(() => expect(mockRemind).toHaveBeenLastCalledWith(
      expect.objectContaining({ fiscalYear: '2026', quarter: 'Q2', dryRun: false }),
    ));
    expect(mockRemind).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
