// ── Workplans page tests ──
//
// Covers the H-7 round-2 fixes:
//   1. Strategic Priority Area + Impact breadcrumb renders on the outcome
//      header (data comes from `useWorkplanRows` — `outcomesList[].strategicPlan`
//      / `.impact`).
//   2. Broad vs Specific activity rows get distinct type badges/colours.
//   3. Tier 2/3/4 indicator rows are never dropped by an active filter, even
//      when that filter matches zero activities in an outcome area.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { NODE_TYPES, STATUSES } from '@rbm/lib/enums';

// Workplans reads usePermissions() for the export gate only — stub it so
// the real Zustand store's async load() doesn't fire a state update after
// the test has already asserted (React `act()` warning).
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => false }),
}));

// Stub the heavy layout wrapper — we only care about the table body.
vi.mock('@/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }) => <div data-testid="dashboard">{children}</div>,
}));

const { mockRowsReturn } = vi.hoisted(() => ({ mockRowsReturn: vi.fn() }));
vi.mock('../workplans/hooks/useWorkplansQueries', () => ({
  useWorkplanRows: (...args) => mockRowsReturn(...args),
  useUpdateWorkplanRow: () => vi.fn(),
}));

// react-router-dom's useSearchParams is globally stubbed to an empty
// URLSearchParams (see src/__tests__/setup.js). Override per-test so
// useWorkplanFilters() can read a populated query string.
let searchParams = new URLSearchParams();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({}),
    useLocation: () => ({ pathname: '/workplan', search: '', hash: '', state: null, key: 'test' }),
    useSearchParams: () => [searchParams, vi.fn()],
  };
});

// Loaded AFTER the mocks are registered.
import Workplans from '../Workplans';

const AREA_ID = 7;

const OUTCOME_LIST = [{
  id: AREA_ID,
  code: '1.1',
  name: 'Strengthened Integrated health systems',
  amert_index: '1.1',
  strategicPlan: { id: 14, sp_code: 'P1', sp_type: 'priority', short_name: 'Primary Health Care' },
  impact: { id: 2, code: '1', title: 'Number of Member States attaining 70% of universal health coverage' },
}];

const BROAD_ACTIVITY = {
  id: 501,
  code: '1.1.1.01',
  title: 'Support the domestication of the continental strategy',
  node_type: NODE_TYPES.BROAD_ACTIVITY,
  budget_total: 1600000,
  responsible_division: 'NCDs',
  percent_complete: 0,
  status: STATUSES.NOT_STARTED,
  result_id: AREA_ID,
  tasks: [{
    id: 601,
    code: '1.1.1.01.01',
    title: 'Conduct high level advocacy visits',
    node_type: NODE_TYPES.SPECIFIC_ACTIVITY,
    budget_total: 0,
    responsible_division: 'NCDs',
    percent_complete: 0,
    status: STATUSES.NOT_STARTED,
  }],
};

const INDICATORS_BY_AREA = {
  [AREA_ID]: [
    { id: 20, code: '1.1.1', title: 'Proportion of AU Member States achieving reduction', node_type: NODE_TYPES.OUTCOME_INDICATOR, tier_id: 2, level: 0, activities: [BROAD_ACTIVITY] },
    { id: 6043, code: 'CHSISD.1.1-17', title: 'Community Health Workers Density Population Ratio', node_type: NODE_TYPES.OUTCOME_INDICATOR, tier_id: 3, level: 1, activities: [] },
    { id: 6197, code: 'ID.1.1-19', title: 'Number of Member States implementing integrated strategies', node_type: NODE_TYPES.OUTCOME_INDICATOR, tier_id: 4, level: 2, activities: [] },
  ],
};

function primeHappyPath() {
  mockRowsReturn.mockReturnValue({
    data: { activities: [BROAD_ACTIVITY], outcomesList: OUTCOME_LIST, indicatorsByArea: INDICATORS_BY_AREA },
    isLoading: false,
  });
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderWithClient(ui) {
  const queryClient = makeQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockRowsReturn.mockReset();
  searchParams = new URLSearchParams();
});

describe('<Workplans /> — strategic priority + impact breadcrumb', () => {
  it('should show the Strategic Priority Area chip and Impact title on the outcome header', () => {
    primeHappyPath();
    renderWithClient(<Workplans />);

    expect(screen.getByText(/P1 · Primary Health Care/)).toBeInTheDocument();
    expect(screen.getByText(/Number of Member States attaining 70% of universal health coverage/)).toBeInTheDocument();
  });
});

describe('<Workplans /> — broad vs specific activity distinction', () => {
  it('should badge the broad activity as Broad and the expanded nested task as Specific', async () => {
    primeHappyPath();
    renderWithClient(<Workplans />);

    expect(screen.getByText('Broad')).toBeInTheDocument();

    // Tasks are collapsed by default — expand the broad activity row.
    const codeCell = screen.getByText('1.1.1.01');
    const row = codeCell.closest('tr');
    await userEvent.click(row.querySelector('button'));

    expect(screen.getByText('Specific')).toBeInTheDocument();
  });
});

describe('<Workplans /> — tier 2/3/4 visibility (H-7 regression)', () => {
  it('should render T2/T3/T4 indicator rows with no filters active', () => {
    primeHappyPath();
    renderWithClient(<Workplans />);

    expect(screen.getByText('T2')).toBeInTheDocument();
    expect(screen.getByText('T3')).toBeInTheDocument();
    expect(screen.getByText('T4')).toBeInTheDocument();
  });

  it('should keep T2/T3/T4 indicator rows visible when a filter matches zero activities', () => {
    // COMPLETED matches nothing — every fixture activity is NOT_STARTED.
    searchParams = new URLSearchParams('status=COMPLETED');
    primeHappyPath();
    renderWithClient(<Workplans />);

    // The broad activity (and its badge) is filtered out...
    expect(screen.queryByText('Broad')).toBeNull();
    // ...but the outcome area's indicator tiers must still render.
    expect(screen.getByText('T2')).toBeInTheDocument();
    expect(screen.getByText('T3')).toBeInTheDocument();
    expect(screen.getByText('T4')).toBeInTheDocument();
  });
});
