// ── OrgDivisionDetail — Team members (reporting) panel ──
//
// A Head of Division (division.responsible_user_id === current user) can see
// and use the "Team members (reporting)" panel even without org_structure:update.
// Adding a member calls POST /me/divisions/:code/members.

import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import OrgDivisionDetail from '../OrgDivisionDetail';

// This HOD is the responsible user of division DPHI.
const HOD = { id: 20, email: 'hod@x.com', first_name: 'Head', last_name: 'Ofdiv' };

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ code: 'DPHI' }),
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: '/reference/org/DPHI', search: '', hash: '', state: null, key: 't' }),
    Link: ({ children }) => children,
  };
});

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: HOD }) }));

// Not an org editor — proves the panel shows for a HOD via responsible_user_id.
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => false }) }));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <OrgDivisionDetail />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.get.mockImplementation((url) => {
    if (url.includes('/admin/divisions/')) {
      return Promise.resolve({ data: {
        code: 'DPHI', division_name: 'Digital PH',
        // eslint-disable-next-line no-restricted-syntax -- 'division' is a division_codes.level_type column-enum value in a test fixture, not an ENTITY_TYPES identifier.
        level_type: 'division',
        responsible_user_id: HOD.id, responsible_user: HOD,
        children: [], ancestors: [], users: [],
      } });
    }
    if (url.includes('/admin/users')) {
      return Promise.resolve({ data: [
        { id: 55, first_name: 'Awa', last_name: 'Diop', email: 'awa@x.com', status: 'ACTIVE' },
      ] });
    }
    if (url.includes('/me/divisions/DPHI/members')) {
      return Promise.resolve({ data: { success: true, data: [] } });
    }
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { success: true, data: { added: true } } });
});

describe('OrgDivisionDetail — Team members panel', () => {
  it('shows the reporting team panel for the Head of Division', async () => {
    renderPage();
    expect(await screen.findByText(/Team members \(reporting\)/i)).toBeInTheDocument();
  });

  it('lists the division staff to add and posts to the members endpoint', async () => {
    renderPage();
    await screen.findByText(/Team members \(reporting\)/i);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/me/divisions/DPHI/members');
    });
  });
});
