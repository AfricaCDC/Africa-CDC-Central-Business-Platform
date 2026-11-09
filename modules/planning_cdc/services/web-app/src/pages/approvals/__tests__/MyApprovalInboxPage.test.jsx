import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('react-router-dom', async () => await vi.importActual('react-router-dom'));

const { mockUseApprovalInbox } = vi.hoisted(() => ({
  mockUseApprovalInbox: vi.fn(),
}));

vi.mock('../hooks/useApprovalQueries', () => ({
  useApprovalInbox: mockUseApprovalInbox,
}));

import MyApprovalInboxPage from '../MyApprovalInboxPage';

function renderPage(initialEntries = ['/approvals/inbox']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/approvals/inbox" element={<MyApprovalInboxPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MyApprovalInboxPage', () => {
  beforeEach(() => {
    mockUseApprovalInbox.mockReset();
  });

  it('renders loading state', () => {
    mockUseApprovalInbox.mockReturnValue({
      data: null, isLoading: true, isError: false, error: null, refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders error state with retry button', () => {
    const refetch = vi.fn();
    mockUseApprovalInbox.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: { response: { data: { message: 'Boom from server' } } },
      refetch,
    });
    renderPage();
    expect(screen.getByText(/boom from server/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders empty state when there are no rows', () => {
    mockUseApprovalInbox.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText(/nothing pending/i)).toBeInTheDocument();
  });

  it('renders rows from the inbox', () => {
    mockUseApprovalInbox.mockReturnValue({
      data: {
        items: [
          {
            stepId: 10, instanceId: 5, step: 1,
            reportCode: 'AR-2026-Q1-001', reportTitle: 'SRH Outreach',
            contribOrg: 'DPHI', submitterName: 'Alice',
            submittedAt: '2026-04-10T09:00:00Z', entityType: 'ACTIVITY_REPORT',
          },
        ],
        total: 1,
      },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('AR-2026-Q1-001')).toBeInTheDocument();
    expect(screen.getByText(/SRH Outreach/)).toBeInTheDocument();
    expect(screen.getByText('DPHI')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('shows pagination when total exceeds pageSize', () => {
    mockUseApprovalInbox.mockReturnValue({
      data: {
        items: Array.from({ length: 15 }, (_, i) => ({
          stepId: i + 1, instanceId: i + 1, step: 1,
          reportCode: `AR-${i}`, entityType: 'ACTIVITY_REPORT',
        })),
        total: 42,
      },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled();
  });

  it('shows active filter count badge when URL has filters', () => {
    mockUseApprovalInbox.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    renderPage(['/approvals/inbox?step=2&entityType=ACTIVITY_REPORT']);
    expect(screen.getByRole('button', { name: /clear \(2\)/i })).toBeInTheDocument();
    expect(screen.getByText(/2 filter\(s\) active/i)).toBeInTheDocument();
  });

  it('falls back to generic message when error has no backend message', () => {
    mockUseApprovalInbox.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: {},
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText(/could not load/i)).toBeInTheDocument();
  });
});
