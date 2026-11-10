// ── ActivityReportPage division guard ──
//
// Regression for the "No division assigned to your account." dead-end:
// the page used to gate on user.division_code — the LEGACY single-division
// column, NULL for anyone assigned through the admin since the
// multi-division model. The guard must rely on the active-division context
// (user_divisions) and only fall back to the legacy column.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NODE_TYPES, ORG_LEVEL_TYPES } from '@rbm/lib/enums';

// User WITHOUT the legacy division_code (multi-division-era account)
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'lennyt@africacdc.org', full_name: 'Lenny Tandou', roles: ['SYSTEM_ADMIN'] },
  }),
}));

let mockActive = {
  activeDivision: null, // "All my divisions" mode
  activeCodes: new Set(['DIGITAL']),
  loaded: true,
  divisions: [{ code: 'Digital', division_name: 'Digital Health', level_type: ORG_LEVEL_TYPES.DIVISION }],
};
vi.mock('@/contexts/ActiveDivisionContext', () => ({
  useActiveDivision: () => mockActive,
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
  id: 10, code: '1.01', title: 'Broad digital activity',
  node_type: NODE_TYPES.BROAD_ACTIVITY, responsible_division_code: 'Digital',
}];
const specifics = [{
  id: 1, code: '1.0101', title: 'Digital specific activity', parent_id: 10,
  node_type: NODE_TYPES.SPECIFIC_ACTIVITY, responsible_division_code: 'Digital',
  budget_total_2026: 100, sort_order: 1,
}];

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

describe('ActivityReportPage — division guard (legacy division_code NULL)', () => {
  it('renders the reporting list when the context has divisions', () => {
    renderPage();
    expect(screen.queryByText(/No division assigned/i)).not.toBeInTheDocument();
    expect(screen.getByText('Digital specific activity')).toBeInTheDocument();
  });

  it('shows the empty state only when the context is loaded AND empty', () => {
    mockActive = { activeDivision: null, activeCodes: new Set(), loaded: true, divisions: [] };
    renderPage();
    expect(screen.getByText(/No division assigned/i)).toBeInTheDocument();
    // restore for other tests
    mockActive = {
      activeDivision: null,
      activeCodes: new Set(['DIGITAL']),
      loaded: true,
      divisions: [{ code: 'Digital', division_name: 'Digital Health', level_type: ORG_LEVEL_TYPES.DIVISION }],
    };
  });
});
