// ── EmailRemindersSettings (D-20260707-01) ──
//
// Admin section editing the `reminders.*` rows of app_settings. Covers:
// loading state, hydration from fetched rows, dirty-tracking on edit,
// save payload, and the days-CSV validation guard.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockUseAppSettings, mockMutateAsync, mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockUseAppSettings: vi.fn(),
  mockMutateAsync: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock('../hooks/useAdminQueries', () => ({
  useAppSettings: (...args) => mockUseAppSettings(...args),
  useUpdateAppSettings: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

vi.mock('sonner', () => ({
  toast: { error: mockToastError, success: mockToastSuccess },
}));

import EmailRemindersSettings from '../EmailRemindersSettings';

const ROWS = [
  { key: 'reminders.draft.enabled', value: '0', description: '' },
  { key: 'reminders.draft.hour_utc', value: '6', description: '' },
  { key: 'reminders.deadline.enabled', value: '0', description: '' },
  { key: 'reminders.deadline.days_before', value: '7,3,1', description: '' },
  { key: 'reminders.deadline.hour_utc', value: '6', description: '' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAppSettings.mockReturnValue({ data: ROWS, isLoading: false, error: null, refetch: vi.fn() });
  mockMutateAsync.mockResolvedValue({ data: { updated: [] } });
});

describe('EmailRemindersSettings', () => {
  it('should render both reminder cards from fetched settings', () => {
    render(<EmailRemindersSettings />);
    expect(screen.getByText('Email Reminders')).toBeInTheDocument();
    expect(screen.getByText('Draft reports — reporters')).toBeInTheDocument();
    expect(screen.getByText('Quarter deadline — approvers')).toBeInTheDocument();
    expect(screen.getByDisplayValue('7,3,1')).toBeInTheDocument();
  });

  it('should show a spinner while loading', () => {
    mockUseAppSettings.mockReturnValue({ data: [], isLoading: true, error: null, refetch: vi.fn() });
    const { container } = render(<EmailRemindersSettings />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('should show an error state with retry', () => {
    mockUseAppSettings.mockReturnValue({ data: [], isLoading: false, error: new Error('boom'), refetch: vi.fn() });
    render(<EmailRemindersSettings />);
    expect(screen.getByText('Failed to load reminder settings.')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('should show an empty state when no settings rows exist (migration not run)', () => {
    mockUseAppSettings.mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() });
    render(<EmailRemindersSettings />);
    expect(screen.getByText(/run the latest database migrations/i)).toBeInTheDocument();
  });

  it('should keep Save disabled until a field changes, then send the payload', async () => {
    render(<EmailRemindersSettings />);
    const save = screen.getByRole('button', { name: /save/i });
    expect(save).toBeDisabled();

    // Toggle deadline enabled
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
    expect(save).not.toBeDisabled();

    fireEvent.click(save);
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ 'reminders.deadline.enabled': '1' }),
    ));
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it('should block save with a toast when the days CSV is invalid', async () => {
    render(<EmailRemindersSettings />);
    const daysInput = screen.getByDisplayValue('7,3,1');
    fireEvent.change(daysInput, { target: { value: '7,abc' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('should surface the backend error message on save failure', async () => {
    mockMutateAsync.mockRejectedValue({ response: { data: { message: 'Unknown setting key(s): x' } } });
    render(<EmailRemindersSettings />);
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Unknown setting key(s): x'));
  });
});
