// ── ActivityReportPage — contributor specifics (D-20260708-01) ──
//
// A division listed in a specific activity's own `contributing_divisions`
// must see that specific on /activity-report (with a "Contributor" badge)
// and be able to open the report form. Contributors are declared at the
// SPECIFIC level only — broad-level contributors do NOT inherit.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NODE_TYPES, ORG_LEVEL_TYPES } from '@rbm/lib/enums';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 9, email: 'comms@africacdc.org', full_name: 'Comms Focal', roles: ['FOCAL_PERSON'] },
  }),
}));

// Viewing division: CPI (Communications)
vi.mock('@/contexts/ActiveDivisionContext', () => ({
  useActiveDivision: () => ({
    activeDivision: null,
    activeCodes: new Set(['CPI']),
    loaded: true,
    divisions: [{ code: 'CPI', division_name: 'Communications', level_type: ORG_LEVEL_TYPES.DIVISION }],
  }),
}));

vi.mock('@/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }) => <div data-testid="dashboard">{children}</div>,
}));

const { mockData } = vi.hoisted(() => ({ mockData: vi.fn() }));
vi.mock('../hooks/useReportingQueries', () => ({
  useActivityReportsData: (...args) => mockData(...args),
  useReportingPeriods: () => ({ data: [], isLoading: false }),
  useMarkNotApplicable: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import ActivityReportPage from '../ActivityReportPage';

const broads = [{
  id: 154, code: '4.2.4.02', title: 'RCCE broad (IMZ-owned)',
  node_type: NODE_TYPES.BROAD_ACTIVITY, responsible_division_code: 'IMZ',
  budget_total_2026: 1000,
  // Broad-level contributor list must NOT grant reporting (specific-only rule)
  contributing_divisions: '["CPI"]',
}];
const specifics = [
  {
    id: 601, code: '4.2.4.02.03', title: 'IMZ specific listing CPI as contributor', parent_id: 154,
    node_type: NODE_TYPES.SPECIFIC_ACTIVITY, responsible_division_code: 'IMZ',
    contributing_divisions: '["CPI"]', budget_total_2026: 100, sort_order: 1,
  },
  {
    id: 602, code: '4.2.4.02.04', title: 'IMZ specific without contributors', parent_id: 154,
    node_type: NODE_TYPES.SPECIFIC_ACTIVITY, responsible_division_code: 'IMZ',
    contributing_divisions: '[]', budget_total_2026: 100, sort_order: 2,
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <ActivityReportPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockData.mockReturnValue({
    isLoading: false,
    data: { broads, specifics, reports: [] },
  });
});

describe('ActivityReportPage — contributor specifics', () => {
  it('shows the specific where the division is a declared contributor', () => {
    renderPage();
    expect(screen.getByText('IMZ specific listing CPI as contributor')).toBeInTheDocument();
  });

  it('marks the contributed specific with a Contributor badge', () => {
    renderPage();
    expect(screen.getByText('Contributor')).toBeInTheDocument();
  });

  it('offers the Report action on the contributed specific', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Report' })).toBeInTheDocument();
  });

  it('does NOT inherit broad-level contributors — sibling without contribs stays hidden', () => {
    renderPage();
    expect(screen.queryByText('IMZ specific without contributors')).not.toBeInTheDocument();
  });

  it('does not badge specifics the division is RESPONSIBLE for', () => {
    mockData.mockReturnValue({
      isLoading: false,
      data: {
        broads,
        specifics: [{ ...specifics[0], responsible_division_code: 'CPI', contributing_divisions: '["CPI"]' }],
        reports: [],
      },
    });
    renderPage();
    expect(screen.queryByText('Contributor')).not.toBeInTheDocument();
  });
});
