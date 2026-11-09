// ── ActivityReportFormPage — create vs edit mode (D-20260818-01) ──
//
// Several independent reports may exist per activity × quarter, so the form
// is a page: /activity-report/:activityId/new creates (POST), and
// /activity-report/:activityId/report/:reportId updates that row (PUT /:id).

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { STATUSES } from '@rbm/lib/enums';
import ActivityReportFormPage from '../ActivityReportFormPage';

// A report that clears the submission gate (D-20260818-01) — dates, location,
// lead organiser, narrative and actual spend. The verification file is
// simulated separately via `mockEvidenceCount`.
// Carries no dates/location of its own: edit mode falls back to the activity
// when the report lacks them, so a seeded activity would smuggle values past
// the gate and mask what the test is asserting.
const BARE_ACTIVITY = { id: 5, code: 'SA-1', title: 'Act', budget_main: 0 };

const COMPLETE_REPORT = {
  id: 42,
  status: 'DRAFT',
  quarter: 'Q3',
  fiscal_year: '2026',
  start_date: '2026-07-01',
  end_date: '2026-07-03',
  location: 'Addis Ababa (HQ)',
  lead_organiser: 'Jane Doe',
  narrative: 'Key achievements',
  actual_spend: 1200,
};

const mockNavigate = vi.fn();
let mockParams = { activityId: '5' };
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => mockParams,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams('q=Q3'), vi.fn()],
    useLocation: () => ({ pathname: '/activity-report/5/new', search: '', hash: '', state: null, key: 't' }),
    Link: ({ children }) => children,
  };
});

const saveMutateAsync = vi.fn();
const submitMutateAsync = vi.fn();
let mockFormData = { activity: { id: 5, code: 'SA-1', title: 'Act', budget_main: 0 }, report: null, staff: [] };
vi.mock('../hooks/useReportingQueries', () => ({
  useActivityReportForm: () => ({ data: mockFormData, isLoading: false }),
  useSaveActivityReport: () => ({ mutateAsync: saveMutateAsync, isPending: false, error: null }),
  useSubmitActivityReport: () => ({ mutateAsync: submitMutateAsync, isPending: false }),
  useApproveActivityReportFromForm: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReportingPeriods: () => ({ data: mockPeriods }),
  useDeleteActivityReport: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
// Q3 window open: a new report without ?q= is written for Q3, not the calendar quarter.
let mockPeriods = [{ quarter: 'Q3', fiscal_year: '2026', status: STATUSES.OPEN, end_date: '2026-10-30' }];

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, email: 'u@x.org' }, logout: vi.fn() }),
}));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => false, getScope: () => null }) }));
// The real component loads its own file list; the mock replays that contract
// by reporting `mockEvidenceCount` through onFilesChange on mount, which is
// what drives the submit gate in the page.
let mockEvidenceCount = 0;
vi.mock('@/components/shared/VerificationUpload', () => {
  function MockVerificationUpload({ onFilesChange }) {
    React.useEffect(() => {
      if (onFilesChange) onFilesChange(mockEvidenceCount);
    }, [onFilesChange]);
    return null;
  }
  return { default: MockVerificationUpload };
});

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('sonner', () => ({ toast }));

// Stubbed out so the test exercises the form, not the nav/page-tracker shell.
vi.mock('@/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }) => <div data-testid="dashboard">{children}</div>,
}));

/**
 * Pick a name in the "Lead organiser(s)" SearchSelect (a combobox, not a
 * native select): open the trigger, then click the matching option.
 * @param {string} name
 */
function selectLeadOrganiser(name) {
  const trigger = screen.getByText('— Select from CBP staff —');
  fireEvent.click(trigger);
  fireEvent.click(screen.getByText(name));
}

beforeEach(() => {
  mockEvidenceCount = 0;
  saveMutateAsync.mockClear();
  saveMutateAsync.mockResolvedValue({ data: { id: 42, status: 'DRAFT' } });
  submitMutateAsync.mockClear();
  submitMutateAsync.mockResolvedValue({ data: { id: 42, status: 'SUBMITTED' } });
  mockNavigate.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
});

describe('ActivityReportFormPage — multi-report modes', () => {
  it('create mode: save POSTs (no reportId) then navigates to the report URL', async () => {
    mockParams = { activityId: '5' };
    mockFormData = { ...mockFormData, report: null };

    render(<ActivityReportFormPage />);
    fireEvent.click(screen.getByRole('button', { name: /Save draft/i }));

    await waitFor(() => expect(saveMutateAsync).toHaveBeenCalled());
    expect(saveMutateAsync.mock.calls[0][0].reportId).toBeNull();
    expect(saveMutateAsync.mock.calls[0][0].payload.plan_node_id).toBe(5);
    expect(saveMutateAsync.mock.calls[0][0].payload.status).toBeUndefined();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(
      '/activity-report/5/report/42', { replace: true },
    ));
  });

  it('create mode: should write a new report for the open window and say so', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T09:00:00Z')); // calendar Q4
    try {
      mockParams = { activityId: '5' };
      mockFormData = { ...mockFormData, activity: { ...mockFormData.activity, fiscal_year: '2026' }, report: null };

      render(<ActivityReportFormPage />);
      expect(screen.getByRole('status')).toHaveTextContent('Activity reports written now count for Q3 2026');
      fireEvent.click(screen.getByRole('button', { name: /Save draft/i }));

      await waitFor(() => expect(saveMutateAsync).toHaveBeenCalled());
      expect(saveMutateAsync.mock.calls[0][0].payload.quarter).toBe('Q3');
    } finally {
      vi.useRealTimers();
    }
  });

  it('edit mode: save PUTs with the reportId from the URL and does not re-navigate', async () => {
    mockParams = { activityId: '5', reportId: '42' };
    mockFormData = { ...mockFormData, report: { id: 42, status: 'DRAFT', quarter: 'Q3', fiscal_year: '2026' } };

    render(<ActivityReportFormPage />);
    fireEvent.click(screen.getByRole('button', { name: /Save draft/i }));

    await waitFor(() => expect(saveMutateAsync).toHaveBeenCalled());
    expect(saveMutateAsync.mock.calls[0][0].reportId).toBe(42);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('edit mode: "save & submit" saves then submits the same report id', async () => {
    mockParams = { activityId: '5', reportId: '42' };
    mockFormData = { activity: BARE_ACTIVITY, staff: [], report: COMPLETE_REPORT };
    mockEvidenceCount =1;

    render(<ActivityReportFormPage />);
    fireEvent.click(screen.getByRole('button', { name: /Save & submit for approval/i }));

    await waitFor(() => expect(submitMutateAsync).toHaveBeenCalled());
    expect(saveMutateAsync.mock.calls[0][0].reportId).toBe(42);
    expect(submitMutateAsync).toHaveBeenCalledWith(42);
  });

  it('create mode: "save & submit" with an id-less save response warns instead of silently succeeding', async () => {
    mockParams = { activityId: '5' };
    // Create mode seeds dates + location from the activity; the remaining
    // required values are typed below. `mockEvidenceCount = 1` lets the test
    // past the file gate to reach the save/submit path it is actually about.
    mockFormData = {
      ...mockFormData,
      activity: {
        id: 5, code: 'SA-1', title: 'Act', budget_main: 0,
        start_date: '2026-07-01', end_date: '2026-07-03', location: 'Addis Ababa (HQ)',
      },
      report: null,
      staff: [{ fullName: 'Jane Doe' }],
    };
    mockEvidenceCount = 1;
    saveMutateAsync.mockResolvedValue({ data: {} });

    render(<ActivityReportFormPage />);
    fireEvent.change(screen.getByPlaceholderText(/Key results achieved/i), { target: { value: 'Key achievements' } });
    fireEvent.change(screen.getByPlaceholderText(/^Budget:/i), { target: { value: '1200' } });
    selectLeadOrganiser('Jane Doe');
    fireEvent.click(screen.getByRole('button', { name: /Save & submit for approval/i }));

    // The form is heavy (template sections + sign-off): under a full parallel
    // run the default 1 s waitFor was occasionally too short.
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'Saved, but could not submit — reopen the report to submit',
    ), { timeout: 5000 });
    expect(submitMutateAsync).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

// ── D-20260818-01: required-fields gate on submission ────────────────────────
describe('ActivityReportFormPage — submission gate', () => {
  const submitButton = () => screen.getByRole('button', { name: /Save & submit for approval/i });

  it('disables submit when every field is filled but no verification file is attached', () => {
    mockParams = { activityId: '5', reportId: '42' };
    mockFormData = { activity: BARE_ACTIVITY, staff: [], report: COMPLETE_REPORT };
    mockEvidenceCount =0;

    render(<ActivityReportFormPage />);

    expect(submitButton()).toBeDisabled();
    expect(screen.getByText(/Missing: verification file/i)).toBeInTheDocument();
  });

  it('enables submit once every field is filled and a verification file exists', () => {
    mockParams = { activityId: '5', reportId: '42' };
    mockFormData = { activity: BARE_ACTIVITY, staff: [], report: COMPLETE_REPORT };
    mockEvidenceCount =1;

    render(<ActivityReportFormPage />);

    expect(submitButton()).toBeEnabled();
    expect(screen.queryByText(/^Missing:/i)).not.toBeInTheDocument();
  });

  it('lists every missing field in the hint, not just the narrative', () => {
    mockParams = { activityId: '5', reportId: '42' };
    mockFormData = {
      activity: BARE_ACTIVITY,
      staff: [],
      report: { ...COMPLETE_REPORT, location: '', lead_organiser: '', narrative: '' },
    };
    mockEvidenceCount = 1;

    render(<ActivityReportFormPage />);

    expect(submitButton()).toBeDisabled();
    expect(screen.getByText(/Missing: location, lead organiser, narrative/i)).toBeInTheDocument();
  });

  it('create mode: tells the author to save the draft before uploading a file', () => {
    mockParams = { activityId: '5' };
    // No report exists yet, so files cannot be attached — with everything else
    // filled, the hint must point at the save rather than blame a missing file.
    mockFormData = {
      ...mockFormData,
      activity: {
        id: 5, code: 'SA-1', title: 'Act', budget_main: 0,
        start_date: '2026-07-01', end_date: '2026-07-03', location: 'Addis Ababa (HQ)',
      },
      report: null,
      staff: [{ fullName: 'Jane Doe' }],
    };
    mockEvidenceCount = 0;

    render(<ActivityReportFormPage />);

    fireEvent.change(screen.getByPlaceholderText(/Key results achieved/i), { target: { value: 'Key achievements' } });
    fireEvent.change(screen.getByPlaceholderText(/^Budget:/i), { target: { value: '1200' } });
    selectLeadOrganiser('Jane Doe');

    expect(submitButton()).toBeDisabled();
    expect(screen.getByText('Save draft first, then upload a verification file to submit')).toBeInTheDocument();
  });

  it('keeps "Save draft" available regardless of the missing fields', () => {
    mockParams = { activityId: '5', reportId: '42' };
    mockFormData = { activity: BARE_ACTIVITY, staff: [], report: { id: 42, status: 'DRAFT', quarter: 'Q3', fiscal_year: '2026' } };
    mockEvidenceCount = 0;

    render(<ActivityReportFormPage />);

    expect(screen.getByRole('button', { name: /Save draft/i })).toBeEnabled();
    expect(submitButton()).toBeDisabled();
  });
});

// ── Activity Reporting Template layout (D-20261001-01) ───────────────────────
describe('ActivityReportFormPage — activity reporting template', () => {
  const TEMPLATE_ACTIVITY = {
    ...BARE_ACTIVITY,
    activity_type: 'TRAINING',
    description: 'Train 30 surveillance officers',
    tier2_outcome: { id: 40, code: '2.1.1', title: 'Stronger surveillance systems' },
    parent_broad: { id: 20, code: '2.1.1.01', title: 'Field epidemiology', budget_codes: [{ id: 1, fund_code: 'MS-0042' }] },
  };

  beforeEach(() => {
    mockParams = { activityId: '5' };
    mockFormData = { activity: TEMPLATE_ACTIVITY, report: null, staff: [] };
  });

  it('should show the Tier 2 outcome and the broad activity from the workplan', () => {
    render(<ActivityReportFormPage />);
    expect(screen.getByText('Stronger surveillance systems')).toBeInTheDocument();
    expect(screen.getByText('Field epidemiology')).toBeInTheDocument();
  });

  it('should show the activity type, read-only, and open its specific section', () => {
    render(<ActivityReportFormPage />);
    expect(screen.getByText('II. Training')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('II. Training')).not.toBeInTheDocument();
    expect(screen.getByText('Description of the trainees')).toBeInTheDocument();
    expect(screen.getByText('Of whom female')).toBeInTheDocument();
  });

  it('should open the section of the activity type, whatever the report held', () => {
    mockFormData = { activity: { ...TEMPLATE_ACTIVITY, activity_type: 'OFFICIAL_ENGAGEMENT' }, report: { mission_type: 'TRAINING' }, staff: [] };
    render(<ActivityReportFormPage />);
    expect(screen.getByText('Name of the visited entity')).toBeInTheDocument();
    expect(screen.queryByText('Description of the trainees')).not.toBeInTheDocument();
  });

  it('should hide the specific section for a type the template gives none', () => {
    mockFormData = { activity: { ...TEMPLATE_ACTIVITY, activity_type: 'PROCUREMENT' }, report: null, staff: [] };
    render(<ActivityReportFormPage />);
    expect(screen.queryByText(/^Specific information/)).not.toBeInTheDocument();
  });

  it('should ask to set the type on the activity when a legacy activity has none', () => {
    mockFormData = { activity: { ...TEMPLATE_ACTIVITY, activity_type: null }, report: null, staff: [] };
    render(<ActivityReportFormPage />);
    expect(screen.getByText('Not set: choose it on the specific activity.')).toBeInTheDocument();
  });

  it('should prefill the objectives from the planned activity', () => {
    render(<ActivityReportFormPage />);
    expect(screen.getByDisplayValue('Train 30 surveillance officers')).toBeInTheDocument();
  });

  it('should show the budget code of the broad activity', () => {
    render(<ActivityReportFormPage />);
    expect(screen.getByDisplayValue('MS-0042')).toBeInTheDocument();
  });

  it('should save the template fields with the report', async () => {
    render(<ActivityReportFormPage />);
    fireEvent.change(screen.getByPlaceholderText(/conference room/i), { target: { value: 'UNCC' } });
    fireEvent.click(screen.getByRole('button', { name: /Save draft/i }));
    await waitFor(() => expect(saveMutateAsync).toHaveBeenCalled());
    expect(saveMutateAsync.mock.calls[0][0].payload).toMatchObject({
      mission_type: 'TRAINING', venue: 'UNCC', objectives: 'Train 30 surveillance officers', budget_code: 'MS-0042',
    });
  });

  it('should show the sign-off block with the author and the approver', () => {
    mockParams = { activityId: '5', reportId: '42' };
    mockFormData = {
      activity: TEMPLATE_ACTIVITY,
      report: { ...COMPLETE_REPORT, status: 'APPROVED', prepared_by_name: 'Jane Doe', approved_by_name: 'Dr Boss', submitted_at: '2026-07-04T10:00:00Z' },
      staff: [],
    };
    render(<ActivityReportFormPage />);
    expect(screen.getByText('Prepared by')).toBeInTheDocument();
    expect(screen.getByText('Dr Boss')).toBeInTheDocument();
    expect(screen.getByText('04 July 2026')).toBeInTheDocument();
  });
});
