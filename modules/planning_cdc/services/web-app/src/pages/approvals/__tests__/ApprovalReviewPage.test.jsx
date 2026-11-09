import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('react-router-dom', async () => await vi.importActual('react-router-dom'));

const hoisted = vi.hoisted(() => ({
  mockUseApprovalHistory: vi.fn(),
  mockUseApproveStep: vi.fn(),
  mockUseRejectStep: vi.fn(),
  mockUseAdminBypass: vi.fn(),
  mockGetScope: vi.fn(),
}));

vi.mock('../hooks/useApprovalQueries', () => ({
  useApprovalHistory: hoisted.mockUseApprovalHistory,
  useApproveStep: hoisted.mockUseApproveStep,
  useRejectStep: hoisted.mockUseRejectStep,
  useAdminBypass: hoisted.mockUseAdminBypass,
}));

vi.mock('../../../hooks/usePermissions', () => ({
  usePermissions: () => ({ getScope: hoisted.mockGetScope }),
}));

import ApprovalReviewPage from '../ApprovalReviewPage';

function makeMutation(overrides = {}) {
  return {
    mutate: vi.fn(),
    isPending: false,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/approvals/42']}>
      <Routes>
        <Route path="/approvals/:instanceId" element={<ApprovalReviewPage />} />
        <Route path="/approvals/inbox" element={<div>INBOX</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const baseHistoryData = {
  instance: { id: 42, entityType: 'ACTIVITY_REPORT', entityId: 7 },
  currentStep: { id: 101, step: 1 },
  steps: [],
};

describe('ApprovalReviewPage', () => {
  beforeEach(() => {
    hoisted.mockUseApprovalHistory.mockReset();
    hoisted.mockUseApproveStep.mockReset();
    hoisted.mockUseRejectStep.mockReset();
    hoisted.mockUseAdminBypass.mockReset();
    hoisted.mockGetScope.mockReset();
    hoisted.mockUseApproveStep.mockReturnValue(makeMutation());
    hoisted.mockUseRejectStep.mockReturnValue(makeMutation());
    hoisted.mockUseAdminBypass.mockReturnValue(makeMutation());
    hoisted.mockGetScope.mockReturnValue(null);
  });

  it('renders loading state while history loads', () => {
    hoisted.mockUseApprovalHistory.mockReturnValue({
      data: null, isLoading: true, isError: false, error: null, refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText(/loading approval/i)).toBeInTheDocument();
  });

  it('renders error state with retry', () => {
    const refetch = vi.fn();
    hoisted.mockUseApprovalHistory.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: { response: { data: { message: 'History failed' } } },
      refetch,
    });
    renderPage();
    expect(screen.getByText(/history failed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders the action form when a current step is pending', () => {
    hoisted.mockUseApprovalHistory.mockReturnValue({
      data: baseHistoryData,
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /approve/i })).toBeChecked();
  });

  it('fires approve mutation when the Approve button is clicked', () => {
    const approve = makeMutation();
    hoisted.mockUseApproveStep.mockReturnValue(approve);
    hoisted.mockUseApprovalHistory.mockReturnValue({
      data: baseHistoryData,
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }));
    expect(approve.mutate).toHaveBeenCalledTimes(1);
    expect(approve.mutate.mock.calls[0][0]).toEqual({ comment: undefined });
  });

  it('disables the reject submit button when reason is empty', () => {
    const reject = makeMutation();
    hoisted.mockUseRejectStep.mockReturnValue(reject);
    hoisted.mockUseApprovalHistory.mockReturnValue({
      data: baseHistoryData,
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: /reject/i }));
    const submitButton = screen.getByRole('button', { name: /^reject$/i });
    expect(submitButton).toBeDisabled();
    fireEvent.click(submitButton);
    expect(reject.mutate).not.toHaveBeenCalled();
  });

  it('fires reject mutation with reason when provided', () => {
    const reject = makeMutation();
    hoisted.mockUseRejectStep.mockReturnValue(reject);
    hoisted.mockUseApprovalHistory.mockReturnValue({
      data: baseHistoryData,
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: /reject/i }));
    const textarea = screen.getByPlaceholderText(/explain why/i);
    fireEvent.change(textarea, { target: { value: 'Budget too high' } });
    fireEvent.click(screen.getByRole('button', { name: /^reject$/i }));
    expect(reject.mutate).toHaveBeenCalledTimes(1);
    expect(reject.mutate.mock.calls[0][0]).toEqual({ reason: 'Budget too high' });
  });

  it('shows no-pending-step message when currentStep is null', () => {
    hoisted.mockUseApprovalHistory.mockReturnValue({
      data: { instance: baseHistoryData.instance, currentStep: null, steps: [] },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    renderPage();
    expect(
      screen.getByText(/this approval instance has no pending step/i),
    ).toBeInTheDocument();
  });

  it('shows admin-bypass card only when user has approve:all permission', () => {
    hoisted.mockGetScope.mockImplementation(
      (mod, action) => (mod === 'reports' && action === 'approve' ? 'all' : null),
    );
    hoisted.mockUseApprovalHistory.mockReturnValue({
      data: baseHistoryData,
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText(/admin bypass/i)).toBeInTheDocument();
  });

  it('reads instance/currentStep from data.data envelope variant', () => {
    hoisted.mockUseApprovalHistory.mockReturnValue({
      data: {
        data: {
          instance: { id: 42, entityType: 'ACTIVITY_REPORT', entityId: 9 },
          currentStep: { id: 202, step: 2 },
          steps: [],
        },
      },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
  });
});
