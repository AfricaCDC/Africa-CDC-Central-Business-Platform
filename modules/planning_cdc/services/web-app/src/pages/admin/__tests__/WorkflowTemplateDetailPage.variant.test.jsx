// ── WorkflowTemplateDetailPage — variant selection at creation ──
//
// D-20260817-02: a new template can be created as DEFAULT or
// CONTRIBUTOR_CHAIN; the variant is fixed after creation (badge only).

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '@/services/api';
import WorkflowTemplateDetailPage from '../WorkflowTemplateDetailPage';

const mutateAsync = vi.fn().mockResolvedValue({ id: 9 });

beforeEach(() => {
  // clearMocks wipes the global api stub implementations — re-prime them
  // (usePageTracker fires api.post on mount).
  api.get.mockResolvedValue({ data: {}, status: 200 });
  api.post.mockResolvedValue({ data: {}, status: 200 });
  mutateAsync.mockClear();
  mutateAsync.mockResolvedValue({ id: 9 });
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'new' }),
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: '/admin/workflows/new', search: '', hash: '', state: null, key: 't' }),
    Link: ({ children }) => children,
  };
});

vi.mock('../hooks/useWorkflowQueries', () => ({
  useWorkflowTemplate: () => ({ data: undefined, isLoading: false }),
  useSaveWorkflowTemplate: () => ({ mutateAsync, isPending: false, error: null }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, email: 'admin@x.org' }, logout: vi.fn() }),
}));

describe('WorkflowTemplateDetailPage — variant at creation', () => {
  it('offers both variants and sends the chosen one in the create payload', async () => {
    render(<WorkflowTemplateDetailPage />);

    // Variant select present in create mode with the two options — the
    // second combobox on the page (first is Entity Type).
    expect(screen.getByText(/Default — owner division submits/i)).toBeInTheDocument();
    expect(screen.getByText(/Contributor chain — contributor division submits/i)).toBeInTheDocument();
    const variantSelect = screen.getAllByRole('combobox')[1];

    fireEvent.change(screen.getByPlaceholderText(/Indicator Approval Chain/i), {
      target: { value: 'My Chain' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Step label/i), {
      target: { value: 'HOD approval' },
    });
    fireEvent.change(variantSelect, { target: { value: 'CONTRIBUTOR_CHAIN' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Template/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const arg = mutateAsync.mock.calls[0][0];
    expect(arg.isNew).toBe(true);
    expect(arg.form.template_variant).toBe('CONTRIBUTOR_CHAIN');
  });
});
