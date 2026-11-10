import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/components/layout/DashboardLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({}), useNavigate: () => vi.fn() };
});

import api from '@/services/api';
import IndicatorFormPage from '../IndicatorFormPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><IndicatorFormPage /></QueryClientProvider>,
  );
}

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.get.mockImplementation(() => Promise.resolve({ data: [] }));
  api.post.mockResolvedValue({ data: { id: 7 } });
});

describe('IndicatorFormPage — big ticket checkbox', () => {
  it('renders the Big ticket checkbox (unchecked in create mode)', async () => {
    renderPage();
    const cb = await screen.findByRole('checkbox', { name: /big ticket/i });
    expect(cb).not.toBeChecked();
  });

  it('toggles the checkbox state on click', async () => {
    renderPage();
    const cb = await screen.findByRole('checkbox', { name: /big ticket/i });
    expect(cb).not.toBeChecked();
    fireEvent.click(cb);
    expect(cb).toBeChecked();
  });

  it('sends is_big_ticket=true in the create payload when checked and saved', async () => {
    renderPage();

    // Fill the three required fields (name, code, tier) so the Save
    // button becomes enabled — canSave gates the POST.
    fireEvent.change(await screen.findByPlaceholderText(/Full indicator name/i), { target: { value: 'Big One' } });
    fireEvent.change(screen.getByPlaceholderText(/e.g. CHSISD/i), { target: { value: 'BIG.1' } });

    // Tier is a SearchSelect combobox: open it via its trigger (the
    // "— Select —" placeholder also appears as a native <select> option,
    // so pick the one inside the role="button" trigger), then choose T3.
    const tierTrigger = screen
      .getAllByText('— Select —')
      .map((el) => el.closest('[role="button"]'))
      .find(Boolean);
    fireEvent.click(tierTrigger);
    fireEvent.click(await screen.findByText(/T3 — Short-term Outcome/i));

    // Tick the big-ticket flag, then submit in create mode.
    fireEvent.click(screen.getByRole('checkbox', { name: /big ticket/i }));
    fireEvent.click(screen.getByRole('button', { name: /Create Indicator/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/plan-nodes/indicator',
        expect.objectContaining({ is_big_ticket: true }),
      ),
    );
  });
});
