// ── ActivityReportPage — specifics under a FOREIGN broad ──
//
// Regression for the "Communications cannot report" bug (plan node 154):
// a division responsible for specific activities whose PARENT broad belongs
// to another division saw those specifics counted in the totals but never
// rendered — the page only displayed broads owned by the division. The
// foreign broad must now appear (with an "Owner: <code>" badge) carrying
// ONLY the specifics the viewing division is responsible for.

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

// Mirrors the real node-154 shape: broad owned by IMZ, children split CPI/IMZ.
const broads = [{
  id: 154, code: '4.2.4.02', title: 'Support institutionalization of RCCE',
  node_type: NODE_TYPES.BROAD_ACTIVITY, responsible_division_code: 'IMZ',
  budget_total_2026: 1000,
}];
const specifics = [
  {
    id: 501, code: '4.2.4.02.01', title: 'CPI-owned specific under IMZ broad', parent_id: 154,
    node_type: NODE_TYPES.SPECIFIC_ACTIVITY, responsible_division_code: 'CPI',
    budget_total_2026: 100, sort_order: 1,
  },
  {
    id: 502, code: '4.2.4.02.03', title: 'IMZ-owned specific stays hidden', parent_id: 154,
    node_type: NODE_TYPES.SPECIFIC_ACTIVITY, responsible_division_code: 'IMZ',
    budget_total_2026: 100, sort_order: 2,
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

describe('ActivityReportPage — orphan specifics under a foreign broad', () => {
  it('renders the foreign broad because the division owns specifics under it', () => {
    renderPage();
    expect(screen.getByText('Support institutionalization of RCCE')).toBeInTheDocument();
    expect(screen.getByText('CPI-owned specific under IMZ broad')).toBeInTheDocument();
  });

  it('shows ONLY the specifics the viewing division is responsible for', () => {
    renderPage();
    expect(screen.queryByText('IMZ-owned specific stays hidden')).not.toBeInTheDocument();
  });

  it('marks the foreign broad with an Owner badge', () => {
    renderPage();
    expect(screen.getByText('Owner: IMZ')).toBeInTheDocument();
  });

  it('keeps totals consistent with the displayed rows (1 specific, 0 reported)', () => {
    renderPage();
    // Shown in the hero AND on the broad header — both must agree on 1 spec.
    expect(screen.getAllByText('0 / 1 reported').length).toBeGreaterThanOrEqual(1);
  });

  it('does not show the Owner badge on broads the division owns', () => {
    mockData.mockReturnValue({
      isLoading: false,
      data: {
        broads: [{ ...broads[0], responsible_division_code: 'CPI' }],
        specifics,
        reports: [],
      },
    });
    renderPage();
    expect(screen.queryByText(/Owner:/)).not.toBeInTheDocument();
    // Owning the broad shows ALL its children (pre-existing behaviour)
    expect(screen.getByText('IMZ-owned specific stays hidden')).toBeInTheDocument();
  });
});
