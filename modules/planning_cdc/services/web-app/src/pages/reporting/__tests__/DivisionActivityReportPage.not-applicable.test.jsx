import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/components/layout/DashboardLayout', () => ({
  default: ({ children }) => <div data-testid="dashboard">{children}</div>,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, division_code: 'DCM' } }),
}));

// Mutable so a test can switch to "All my divisions" (DCM + RRR).
const selection = vi.hoisted(() => ({ activeDivision: { code: 'DCM' }, codes: ['DCM'], owner: 'DCM', contribs: null }));
vi.mock('@/contexts/ActiveDivisionContext', () => ({
  useActiveDivision: () => ({ activeDivision: selection.activeDivision, activeCodes: new Set(selection.codes) }),
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
      t3: [{ id: 42, code: 'T3-1', title: 'Test indicator', responsible_division_code: selection.owner, contributing_divisions: selection.contribs, tier_id: 3 }],
      t4: [],
      reports: { Q1: [], Q2: [], Q3: [], Q4: [] },
      periods: [{ quarter: 'Q1', status: 'OPEN' }],
      divisions: [],
    },
    isLoading: false,
  }),
}));

import api from '@/services/api';
import DivisionActivityReportPage from '../DivisionActivityReportPage';

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage() {
  const queryClient = makeQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <DivisionActivityReportPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.assign(selection, { activeDivision: { code: 'DCM' }, codes: ['DCM'], owner: 'DCM', contribs: null });
  api.get.mockReset();
  api.post.mockReset();
  api.get.mockImplementation(() => Promise.resolve({ data: [] }));
});

describe('DivisionActivityReportPage — mark indicator as not applicable', () => {
  it('shows "Mark as not applicable" in the row dropdown for an unreported indicator', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('T3-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('More actions'));
    expect(screen.getByText('Mark as not applicable')).toBeInTheDocument();
  });

  it('requires a reason before the Confirm button is enabled', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('T3-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('More actions'));
    fireEvent.click(screen.getByText('Mark as not applicable'));

    const confirmBtn = screen.getByRole('button', { name: /Confirm N\/A/i });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/Explain why this indicator/i), {
      target: { value: 'Not relevant to our division' },
    });
    expect(confirmBtn).not.toBeDisabled();
  });

  it('calls the not-applicable endpoint and shows the N/A badge on success', async () => {
    api.post.mockResolvedValueOnce({ data: { data: { id: 99, status: 'NOT_APPLICABLE', rejection_reason: 'Not relevant' } } });
    renderPage();
    await waitFor(() => expect(screen.getByText('T3-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('More actions'));
    fireEvent.click(screen.getByText('Mark as not applicable'));
    fireEvent.change(screen.getByPlaceholderText(/Explain why this indicator/i), {
      target: { value: 'Not relevant' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirm N\/A/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/reporting/indicator-division-reports/42/not-applicable',
      expect.objectContaining({ reason: 'Not relevant' }),
    ));
    await waitFor(() => expect(screen.getByText('Not Applicable')).toBeInTheDocument());
  });

  it('should still show N/A after a reload, from the saved report', async () => {
    api.get.mockImplementation((url) => Promise.resolve({
      data: String(url).includes('indicator-division-reports')
        ? { data: [{ id: 99, plan_node_id: 42, division_code: 'DCM', quarter: 'Q1', fiscal_year: '2026', status: 'NOT_APPLICABLE' }] }
        : [],
    }));
    renderPage();
    await waitFor(() => expect(screen.getByText('Not Applicable')).toBeInTheDocument());
  });

  it('should mark N/A under the division of the indicator, not the home division, in "All my divisions"', async () => {
    Object.assign(selection, { activeDivision: null, codes: ['DCM', 'RRR'], owner: 'RRR' });
    api.post.mockResolvedValueOnce({ data: { data: { id: 99, status: 'NOT_APPLICABLE' } } });
    renderPage();
    await waitFor(() => expect(screen.getByText('T3-1')).toBeInTheDocument());
    expect(api.get).toHaveBeenCalledWith('/reporting/indicator-division-reports', {
      params: { division_code: 'DCM,RRR', fiscal_year: expect.any(String) },
    });

    fireEvent.click(screen.getByTitle('More actions'));
    fireEvent.click(screen.getByText('Mark as not applicable'));
    fireEvent.change(screen.getByPlaceholderText(/Explain why this indicator/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirm N\/A/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/reporting/indicator-division-reports/42/not-applicable',
      expect.objectContaining({ division_code: 'RRR' }),
    ));
  });

  it('should not offer N/A to a contributor, and show the main division N/A on its row (D-20261013-10)', async () => {
    Object.assign(selection, { owner: 'SDI', contribs: '["DCM"]' });
    api.get.mockImplementation((url) => Promise.resolve({
      data: String(url).includes('owner-not-applicable')
        ? { data: [{ plan_node_id: 42, quarter: 'Q1', division_code: 'SDI', rejection_reason: 'No target' }] }
        : [],
    }));
    renderPage();
    await waitFor(() => expect(screen.getByText('Not Applicable')).toBeInTheDocument());
    expect(screen.getByText('Not Applicable')).toHaveAttribute('title', 'Marked not applicable by the main division (SDI): No target');
    fireEvent.click(screen.getByTitle('More actions'));
    expect(screen.queryByText('Mark as not applicable')).not.toBeInTheDocument();
  });

  it('should leave N/A indicators out of the reported percentage (D-20261013-12)', async () => {
    api.get.mockImplementation((url) => Promise.resolve({
      data: String(url).includes('owner-not-applicable')
        ? { data: [{ plan_node_id: 42, quarter: 'Q1', division_code: 'DCM', rejection_reason: 'No target' }] }
        : [],
    }));
    renderPage();
    await waitFor(() => expect(screen.getByText(/1 not applicable/)).toBeInTheDocument());
    expect(screen.getByText(/0 \/ 0 reported/)).toBeInTheDocument();
  });
});

