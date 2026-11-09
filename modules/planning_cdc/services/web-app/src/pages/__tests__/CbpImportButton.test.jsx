// ── CbpImportButton — outcome reporting and in-progress state (D-20260713-01) ──
//
// Covers: success toast with counts + list refresh, partial-failure warning,
// 409 while another run is active, gateway timeout copy, a network error with
// no response, and the in-progress button state.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockToast, mockApiPost } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  mockApiPost: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: mockToast }));

vi.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: mockApiPost, put: vi.fn(), delete: vi.fn() },
}));

import CbpImportButton from '../CbpImportButton';
import { describeCbpImportError, formatCbpImportSummary } from '../cbpImportMessages';

const SUMMARY = { fetched: 461, eligible: 439, inserted: 82, updated: 300, skipped: 57, failed: 0 };

function renderButton() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  render(
    <QueryClientProvider client={qc}>
      <CbpImportButton />
    </QueryClientProvider>,
  );
  return invalidate;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiPost.mockResolvedValue({ data: SUMMARY });
});

describe('describeCbpImportError', () => {
  it('should pass a backend message through as a string', () => {
    const err = { response: { status: 409, data: { code: 'IMPORT_IN_PROGRESS', message: 'already running' } } };
    expect(describeCbpImportError(err)).toBe('already running');
  });

  it('should explain a gateway timeout instead of showing BAD_GATEWAY', () => {
    const err = { response: { status: 502, data: { code: 'BAD_GATEWAY', message: 'Backend temporarily unavailable' } } };
    expect(describeCbpImportError(err)).toMatch(/may still complete/);
  });

  it('should fall back to a generic message for a network error with no response', () => {
    expect(describeCbpImportError(new Error('Network Error'))).toBe('CBP import failed. Please try again.');
  });

  it('should ignore a non-string message and never return the raw object', () => {
    const err = { response: { data: { message: { nested: true } } } };
    expect(describeCbpImportError(err)).toBe('CBP import failed. Please try again.');
  });
});

describe('formatCbpImportSummary', () => {
  it('should format the counts for the success toast', () => {
    expect(formatCbpImportSummary({ inserted: 2, updated: 1, skipped: 3, eligible: 6 }))
      .toBe('CBP import: 2 created, 1 completed, 3 already up to date (6 CBP accounts scanned)');
  });

  it('should mention users placed in their CBP division only when some were', () => {
    expect(formatCbpImportSummary({ inserted: 0, updated: 0, skipped: 6, eligible: 6, divisions_filled: 4 }))
      .toBe('CBP import: 0 created, 0 completed, 6 already up to date (6 CBP accounts scanned), 4 placed in their CBP division');
    expect(formatCbpImportSummary({ eligible: 6, divisions_filled: 0 })).not.toMatch(/placed/);
  });
});

describe('CbpImportButton', () => {
  it('should toast the summary and invalidate the users list on success', async () => {
    const invalidate = renderButton();
    fireEvent.click(screen.getByText('Import CBP users'));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith(
      'CBP import: 82 created, 300 completed, 57 already up to date (439 CBP accounts scanned)',
    ));
    expect(mockApiPost).toHaveBeenCalledWith('/admin/import-cbp-users', {});
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'users-page'] });
  });

  it('should warn when some records could not be written', async () => {
    mockApiPost.mockResolvedValueOnce({ data: { ...SUMMARY, failed: 2 } });
    renderButton();
    fireEvent.click(screen.getByText('Import CBP users'));
    await waitFor(() => expect(mockToast.warning).toHaveBeenCalledWith(expect.stringContaining('2 could not be imported')));
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('should show the in-progress state and disable the button while the run is pending', async () => {
    mockApiPost.mockReturnValueOnce(new Promise(() => {}));
    renderButton();
    fireEvent.click(screen.getByText('Import CBP users'));
    const btn = await screen.findByText(/Importing/);
    expect(btn.closest('button')).toBeDisabled();
  });

  it('should report a 409 from a run that is already in progress', async () => {
    mockApiPost.mockRejectedValueOnce({ response: { status: 409, data: { code: 'IMPORT_IN_PROGRESS', message: 'A CBP import is already running.' } } });
    const invalidate = renderButton();
    fireEvent.click(screen.getByText('Import CBP users'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('A CBP import is already running.'));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('should report a gateway timeout in readable terms', async () => {
    mockApiPost.mockRejectedValueOnce({ response: { status: 502, data: { code: 'BAD_GATEWAY', message: 'Backend temporarily unavailable' } } });
    renderButton();
    fireEvent.click(screen.getByText('Import CBP users'));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/may still complete/)));
  });
});
