// ── ActivityReportPage — multiple reports per activity/quarter ──
//
// An activity can carry several INDEPENDENT reports for the same quarter
// (D-20260818-01). The grid used to collapse them with a `plan_node_id -> report`
// map, so only the last row of the list endpoint survived. It must now list
// EVERY report of a specific (status + author, each linking to its own report
// page), while the "reported" counters still count the ACTIVITY once.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NODE_TYPES, ORG_LEVEL_TYPES, STATUSES } from '@rbm/lib/enums';

const { mockNavigate, mockData } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockData: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 9, email: 'whc@africacdc.org', full_name: 'WHC Focal', roles: ['FOCAL_PERSON'] },
  }),
}));

vi.mock('@/contexts/ActiveDivisionContext', () => ({
  useActiveDivision: () => ({
    activeDivision: { code: 'WHC', division_name: 'World Health' },
    activeCodes: new Set(['WHC']),
    loaded: true,
    divisions: [{ code: 'WHC', division_name: 'World Health', level_type: ORG_LEVEL_TYPES.DIVISION }],
  }),
}));

vi.mock('@/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }) => <div data-testid="dashboard">{children}</div>,
}));

vi.mock('../hooks/useReportingQueries', () => ({
  useActivityReportsData: (...args) => mockData(...args),
  useReportingPeriods: () => ({ data: [], isLoading: false }),
  useMarkNotApplicable: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import ActivityReportPage from '../ActivityReportPage';

const broads = [{
  id: 1, code: 'BA-1', title: 'Broad', node_type: NODE_TYPES.BROAD_ACTIVITY,
  responsible_division_code: 'WHC', budget_total_2026: 1000,
}];
const specifics = [{
  id: 5, code: 'SA-1', title: 'Spec', parent_id: 1, node_type: NODE_TYPES.SPECIFIC_ACTIVITY,
  responsible_division_code: 'WHC', budget_total_2026: 100, sort_order: 1,
}];
const twoReports = [
  { id: 41, plan_node_id: 5, status: STATUSES.APPROVED, prepared_by_name: 'Alice A', quarter: 'Q3' },
  { id: 42, plan_node_id: 5, status: STATUSES.SUBMITTED, prepared_by_name: 'Bob B', quarter: 'Q3' },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <ActivityReportPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockData.mockReturnValue({ isLoading: false, data: { broads, specifics, reports: twoReports } });
});

describe('ActivityReportPage — multi-report rows', () => {
  it('lists every report with its author', () => {
    renderPage();
    expect(screen.getByText(/Alice A/)).toBeInTheDocument();
    expect(screen.getByText(/Bob B/)).toBeInTheDocument();
  });

  it('counts the activity once, not once per report', () => {
    renderPage();
    // hero counter + broad-header counter must both read 1 / 1
    expect(screen.getAllByText('1 / 1 reported').length).toBeGreaterThanOrEqual(1);
  });

  it('shows how many reports the activity carries', () => {
    renderPage();
    expect(screen.getByText('2 reports')).toBeInTheDocument();
  });

  it('offers a "New report" action when reports already exist', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /New report/i })).toBeInTheDocument();
  });

  it('navigates to the create page with the quarter', () => {
    renderPage();
    screen.getByRole('button', { name: /New report/i }).click();
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/^\/activity-report\/5\/new\?q=Q[1-4]$/));
  });

  it('links each report row to its own report page', () => {
    renderPage();
    screen.getByText(/Alice A/).click();
    expect(mockNavigate).toHaveBeenCalledWith('/activity-report/5/report/41');
  });

  it('falls back to "Report" when the activity has no report yet', () => {
    mockData.mockReturnValue({ isLoading: false, data: { broads, specifics, reports: [] } });
    renderPage();
    expect(screen.getByRole('button', { name: 'Report' })).toBeInTheDocument();
    expect(screen.getByText('Not started')).toBeInTheDocument();
  });

  it('keeps the N/A display when the only report is NOT_APPLICABLE', () => {
    mockData.mockReturnValue({
      isLoading: false,
      data: {
        broads,
        specifics,
        reports: [{
          id: 43, plan_node_id: 5, status: STATUSES.NOT_APPLICABLE,
          prepared_by_name: 'Carol C', rejection_reason: 'Cancelled by donor', quarter: 'Q3',
        }],
      },
    });
    renderPage();
    expect(screen.getByText('N/A')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New report/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Carol C/)).not.toBeInTheDocument();
  });

  it('excludes the N/A row from the per-report links when real reports coexist', () => {
    mockData.mockReturnValue({
      isLoading: false,
      data: {
        broads,
        specifics,
        reports: [
          ...twoReports,
          { id: 44, plan_node_id: 5, status: STATUSES.NOT_APPLICABLE, prepared_by_name: 'Carol C', quarter: 'Q3' },
        ],
      },
    });
    renderPage();
    expect(screen.getByText(/Alice A/)).toBeInTheDocument();
    expect(screen.queryByText(/Carol C/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New report/i })).toBeInTheDocument();
  });
});
