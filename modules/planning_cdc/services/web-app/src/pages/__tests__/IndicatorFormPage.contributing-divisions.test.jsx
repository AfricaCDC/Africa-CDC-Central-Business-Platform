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
    useParams: () => ({ id: '6069' }),
  };
});

import api from '@/services/api';
import IndicatorFormPage from '../IndicatorFormPage';

const DIVISIONS = [
  { code: 'CT', division_name: 'Clinical Trials', alias_of: null },
  { code: 'SCI', division_name: 'Science and Innovation', alias_of: null },
  { code: 'DIG', division_name: 'Digital Health', alias_of: null },
];

// CT is the accountable (MAIN) division. SCI was added explicitly by a
// user (lives in plan_nodes.contributing_divisions). DIG is never in the
// explicit list — it only shows up because a linked Specific Activity's
// responsible division is DIG.
const INDICATOR_DETAIL = {
  id: 6069,
  indicator_name: 'Test indicator',
  indicator_code: 'RBM-T3-6069',
  tier_id: 3,
  accountable_division_id: 'CT',
  contributing_divisions: ['SCI'],
  linked_specifics: [
    { id: 1, code: 'SA-1', title: 'Specific activity 1', division: { code: 'DIG', name: 'Digital Health' } },
  ],
};

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage() {
  const queryClient = makeQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <IndicatorFormPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.get.mockReset();
  api.put.mockReset();
  api.get.mockImplementation((url) => {
    if (url === '/admin/division-codes') return Promise.resolve({ data: DIVISIONS });
    if (url === '/plan-nodes') return Promise.resolve({ data: [] });
    if (url === '/admin/units-of-measure') return Promise.resolve({ data: [] });
    if (url === '/reporting/disaggregations') return Promise.resolve({ data: { items: [], grouped: {} } });
    if (url === '/plan-nodes/6069') return Promise.resolve({ data: INDICATOR_DETAIL });
    return Promise.resolve({ data: [] });
  });
  api.put.mockResolvedValue({ data: { ...INDICATOR_DETAIL, contributing_divisions: [] } });
});

describe('IndicatorFormPage — contributing divisions removal (PIRS edit form)', () => {
  it('renders explicit divisions as removable chips and linked-activity divisions as a separate read-only group', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText(/Science and Innovation/)).toBeInTheDocument());
    expect(screen.getByText(/Auto-included via linked Specific Activities/)).toBeInTheDocument();
    expect(screen.getByText(/Digital Health/)).toBeInTheDocument();
  });

  it('permanently removes an explicit contributing division on save (does not resurrect it)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/Science and Innovation/)).toBeInTheDocument());

    const chip = screen.getByText(/Science and Innovation/).closest('span');
    fireEvent.click(chip.querySelector('button'));
    expect(screen.queryByText(/Science and Innovation/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const [, payload] = api.put.mock.calls[0];
    expect(payload.contributing_divisions).toEqual([]);
  });

  it('never includes linked-Specific-Activity divisions in the saved payload', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/Science and Innovation/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const [, payload] = api.put.mock.calls[0];
    expect(payload.contributing_divisions).toEqual(['SCI']);
  });
});
