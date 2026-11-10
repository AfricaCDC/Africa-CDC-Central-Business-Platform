// ── SpecificActivityPage donor / budgeting filter tests ──
//
// The /tasks page filters client-side over plan_nodes SPECIFIC_ACTIVITY
// rows. These tests cover the two funding filters:
//   1. Donor — options are built dynamically from primary/other funding
//      sources present in the data (N/A and blanks excluded)
//   2. Budgeting — Intramural / Extramural on budgeting_arrangement
// A donor match on EITHER primary or other funding source keeps the row.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NODE_TYPES, ORG_LEVEL_TYPES } from '@rbm/lib/enums';

const { mockHookReturn } = vi.hoisted(() => ({
  mockHookReturn: vi.fn(),
}));
vi.mock('@/hooks/usePlanNodeQueries', () => ({
  useSpecificActivityData: (...args) => mockHookReturn(...args),
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasRole: vi.fn().mockReturnValue(true),
    can: vi.fn().mockReturnValue(true),
  }),
}));

vi.mock('@/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }) => <div data-testid="dashboard">{children}</div>,
}));

import SpecificActivityPage from '../SpecificActivityPage';

const YEAR = new Date().getFullYear().toString();

const specifics = [
  {
    id: 1, code: '1.0101', title: 'WB primary activity', parent_id: 10,
    node_type: NODE_TYPES.SPECIFIC_ACTIVITY, sort_order: 1, fiscal_year: YEAR,
    responsible_division_code: 'DIG', budget_total_2026: 100,
    primary_funding_source: 'World Bank', other_funding_source: null,
    budgeting_arrangement: 'Intramural',
  },
  {
    id: 2, code: '1.0102', title: 'GAVI other activity', parent_id: 10,
    node_type: NODE_TYPES.SPECIFIC_ACTIVITY, sort_order: 2, fiscal_year: YEAR,
    responsible_division_code: 'DIG', budget_total_2026: 200,
    primary_funding_source: null, other_funding_source: 'GAVI',
    budgeting_arrangement: 'Extramural',
  },
  {
    id: 3, code: '1.0103', title: 'Unfunded activity', parent_id: 10,
    node_type: NODE_TYPES.SPECIFIC_ACTIVITY, sort_order: 3, fiscal_year: YEAR,
    responsible_division_code: 'DIG', budget_total_2026: 0,
    primary_funding_source: 'N/A', other_funding_source: '',
    budgeting_arrangement: null,
  },
];

const broads = [{ id: 10, code: '1.01', title: 'Broad one', node_type: NODE_TYPES.BROAD_ACTIVITY }];

// IMZ is promoted to directorate in the org chart (level_type) and carries
// its own activity — it must move from the Divisions filter to Directorates.
const specificsWithDirectorate = [
  ...specifics,
  {
    id: 4, code: '1.0104', title: 'Immunization campaign activity', parent_id: 10,
    node_type: NODE_TYPES.SPECIFIC_ACTIVITY, sort_order: 4, fiscal_year: YEAR,
    responsible_division_code: 'IMZ', budget_total_2026: 50,
    primary_funding_source: 'GAVI', other_funding_source: null,
    budgeting_arrangement: 'Extramural',
  },
];

const divisionsWithDirectorate = [
  { code: 'DIG', division_name: 'Digital Health', directorate: 'Directorate of Digital', level_type: ORG_LEVEL_TYPES.DIVISION },
  { code: 'IMZ', division_name: 'Directorate of Immunization', directorate: null, level_type: ORG_LEVEL_TYPES.DIRECTORATE },
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SpecificActivityPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockHookReturn.mockReturnValue({
    isLoading: false,
    data: { specifics, broads, t3: [], t4: [], divisions: [{ code: 'DIG', division_name: 'Digital Health' }] },
  });
});

describe('SpecificActivityPage — donor filter', () => {
  it('builds donor options from the data, excluding N/A and blanks', () => {
    renderPage();
    // 4 selects on the page: directorate, division, donor, budgeting.
    const selects = screen.getAllByRole('combobox');
    const donor = selects.find((s) => s.options[0].text.startsWith('All Donors'));
    expect(donor).toBeTruthy();
    const labels = [...donor.options].map((o) => o.value);
    expect(labels).toContain('World Bank');
    expect(labels).toContain('GAVI');
    expect(labels).not.toContain('N/A');
    expect(labels).not.toContain('');
  });

  it('filters rows by donor, matching primary OR other funding source', async () => {
    renderPage();
    const selects = screen.getAllByRole('combobox');
    const donor = selects.find((s) => s.options[0].text.startsWith('All Donors'));

    await userEvent.selectOptions(donor, 'GAVI');
    expect(screen.getByText('GAVI other activity')).toBeInTheDocument();
    expect(screen.queryByText('WB primary activity')).not.toBeInTheDocument();

    await userEvent.selectOptions(donor, 'World Bank');
    expect(screen.getByText('WB primary activity')).toBeInTheDocument();
    expect(screen.queryByText('GAVI other activity')).not.toBeInTheDocument();
  });
});

describe('SpecificActivityPage — budgeting arrangement filter', () => {
  it('filters rows by Intramural / Extramural', async () => {
    renderPage();
    const selects = screen.getAllByRole('combobox');
    const budgeting = selects.find((s) => s.options[0].text.startsWith('All Budgeting'));
    expect(budgeting).toBeTruthy();

    await userEvent.selectOptions(budgeting, 'Intramural');
    expect(screen.getByText('WB primary activity')).toBeInTheDocument();
    expect(screen.queryByText('GAVI other activity')).not.toBeInTheDocument();
    expect(screen.queryByText('Unfunded activity')).not.toBeInTheDocument();

    await userEvent.selectOptions(budgeting, 'Extramural');
    expect(screen.getByText('GAVI other activity')).toBeInTheDocument();
    expect(screen.queryByText('WB primary activity')).not.toBeInTheDocument();
  });

  it('combines donor and budgeting filters', async () => {
    renderPage();
    const selects = screen.getAllByRole('combobox');
    const donor = selects.find((s) => s.options[0].text.startsWith('All Donors'));
    const budgeting = selects.find((s) => s.options[0].text.startsWith('All Budgeting'));

    await userEvent.selectOptions(donor, 'GAVI');
    await userEvent.selectOptions(budgeting, 'Intramural');
    expect(screen.queryByText('GAVI other activity')).not.toBeInTheDocument();
    expect(screen.getByText('No specific activities found.')).toBeInTheDocument();
  });
});

describe('SpecificActivityPage — directorate-level codes (org chart)', () => {
  beforeEach(() => {
    mockHookReturn.mockReturnValue({
      isLoading: false,
      data: {
        specifics: specificsWithDirectorate,
        broads,
        t3: [],
        t4: [],
        divisions: divisionsWithDirectorate,
      },
    });
  });

  it('excludes level_type=directorate codes from the Divisions filter', () => {
    renderPage();
    const selects = screen.getAllByRole('combobox');
    const division = selects.find((s) => s.options[0].text.startsWith('All Divisions'));
    const values = [...division.options].map((o) => o.value);
    expect(values).toContain('DIG');
    expect(values).not.toContain('IMZ');
  });

  it('lists the promoted directorate under the Directorates filter and filters by it', async () => {
    renderPage();
    const selects = screen.getAllByRole('combobox');
    const directorate = selects.find((s) => s.options[0].text.startsWith('All Directorates'));
    const labels = [...directorate.options].map((o) => o.value);
    expect(labels).toContain('Directorate of Immunization');

    await userEvent.selectOptions(directorate, 'Directorate of Immunization');
    expect(screen.getByText('Immunization campaign activity')).toBeInTheDocument();
    expect(screen.queryByText('WB primary activity')).not.toBeInTheDocument();
  });
});
