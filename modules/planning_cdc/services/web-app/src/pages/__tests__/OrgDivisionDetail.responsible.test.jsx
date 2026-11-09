// ── OrgDivisionDetail — Responsible slot reads the pointer (D-20261009-03) ──
//
// The approver shown is division_codes.responsible_user_id (what approvals
// read), labelled "Responsible person" at every level.
// The level comes from level_type, never from a DIR_ code prefix (CPI). A
// division without a head shows the ancestor approver it escalates to.

import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { ORG_LEVEL_TYPES } from '@rbm/lib/enums';
import OrgDivisionDetail from '../OrgDivisionDetail';

const ADMIN = { id: 1, email: 'admin@x.com' };
const DIRECTOR = { id: 40, first_name: 'Dalia', last_name: 'Director', email: 'dalia@x.com' };
const STALE_HEAD = { id: 41, first_name: 'Stan', last_name: 'Stale', email: 'stan@x.com' };

let currentCode = 'CPI';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ code: currentCode }),
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: `/reference/org/${currentCode}`, search: '', hash: '', state: null, key: 't' }),
    Link: ({ children }) => children,
  };
});
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: ADMIN }) }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => true, canAccessModule: () => true }) }));

const DIVISIONS = {
  // A directorate whose code has no DIR_ prefix.
  CPI: {
    code: 'CPI', division_name: 'Centre for Primary Health', level_type: ORG_LEVEL_TYPES.DIRECTORATE,
    responsible_user_id: DIRECTOR.id, responsible_user: DIRECTOR, inherited_responsible: null,
    children: [], ancestors: [],
    // user_divisions disagrees on purpose: the pointer wins on screen.
    users: [{ ...STALE_HEAD, status: 'ACTIVE', roles: [], division_roles: ['HEAD_OF_DIVISION'] }],
  },
  // A division with no head of its own under CPI.
  NOHEAD: {
    code: 'NOHEAD', division_name: 'Headless Division', level_type: ORG_LEVEL_TYPES.DIVISION,
    responsible_user_id: null, responsible_user: null,
    inherited_responsible: { code: 'CPI', division_name: 'Centre for Primary Health', level_type: ORG_LEVEL_TYPES.DIRECTORATE, user_id: DIRECTOR.id, user: DIRECTOR },
    children: [], ancestors: [{ code: 'CPI', division_name: 'Centre for Primary Health' }], users: [],
  },
};

function renderPage(code) {
  currentCode = code;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <OrgDivisionDetail />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.post.mockResolvedValue({ data: {} }); // page tracker
  api.get.mockImplementation((url) => {
    if (url.includes('/admin/divisions/')) return Promise.resolve({ data: DIVISIONS[currentCode] });
    if (url.includes('/admin/users')) return Promise.resolve({ data: [DIRECTOR, STALE_HEAD] });
    return Promise.resolve({ data: [] });
  });
});

describe('OrgDivisionDetail — Responsible slot', () => {
  it('labels the slot Responsible person on a directorate without a DIR_ prefix and shows the pointer holder', async () => {
    renderPage('CPI');
    expect(await screen.findByText('Responsible person (approver)')).toBeInTheDocument();
    // Shown in the slot (and echoed by the picker's current value).
    expect(screen.getAllByText('Dalia Director').length).toBeGreaterThan(0);
  });

  it('labels the slot Responsible person on a division and shows the inherited approver when empty', async () => {
    renderPage('NOHEAD');
    expect(await screen.findByText('Responsible person (approver)')).toBeInTheDocument();
    expect(screen.getByText(/approvals go to/i)).toBeInTheDocument();
    expect(screen.getByText('Dalia Director')).toBeInTheDocument();
    expect(screen.getByText(/Responsible person of/)).toBeInTheDocument();
  });
});
