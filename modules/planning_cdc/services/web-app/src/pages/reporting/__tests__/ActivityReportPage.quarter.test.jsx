// ── ActivityReportPage — which quarter is shown ──
//
// The page followed the calendar quarter: on 1 October it jumped to Q4 while
// the Q3 reporting window was still open, every Q3 report vanished from the
// page and new reports were filed under Q4. It now shows `?q=` when given,
// else the OPEN period of the year, else the calendar quarter, and offers a
// Q1-Q4 selector.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NODE_TYPES, ORG_LEVEL_TYPES, STATUSES } from '@rbm/lib/enums';

const { mockData, mockPeriods } = vi.hoisted(() => ({ mockData: vi.fn(), mockPeriods: vi.fn() }));

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 9, email: 'f@africacdc.org', roles: ['FOCAL_PERSON'] } }),
}));

vi.mock('@/contexts/ActiveDivisionContext', () => ({
  useActiveDivision: () => ({
    activeDivision: { code: 'EPR', division_name: 'Preparedness' },
    activeCodes: new Set(['EPR']),
    loaded: true,
    divisions: [{ code: 'EPR', division_name: 'Preparedness', level_type: ORG_LEVEL_TYPES.DIVISION }],
  }),
}));

vi.mock('@/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock('../hooks/useReportingQueries', () => ({
  useActivityReportsData: (...args) => mockData(...args),
  useReportingPeriods: () => mockPeriods(),
  useMarkNotApplicable: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import ActivityReportPage from '../ActivityReportPage';

const DATA = {
  broads: [{ id: 1, code: 'BA-1', title: 'Broad', node_type: NODE_TYPES.BROAD_ACTIVITY, responsible_division_code: 'EPR', budget_total_2026: 1000 }],
  specifics: [{ id: 5, code: 'SA-1', title: 'Spec', parent_id: 1, node_type: NODE_TYPES.SPECIFIC_ACTIVITY, responsible_division_code: 'EPR', budget_total_2026: 100, sort_order: 1 }],
  reports: [],
};

const renderAt = (url = '/activity-report') => render(
  <MemoryRouter initialEntries={[url]}><ActivityReportPage /></MemoryRouter>,
);
const lastQuarter = () => mockData.mock.calls.at(-1)[0].quarter;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-12T09:00:00Z')); // calendar Q4
  mockData.mockReset();
  mockData.mockReturnValue({ isLoading: false, data: DATA });
  mockPeriods.mockReturnValue({
    isLoading: false,
    data: [
      { quarter: 'Q2', fiscal_year: '2026', status: STATUSES.CLOSED },
      { quarter: 'Q3', fiscal_year: '2026', status: STATUSES.OPEN },
    ],
  });
});

afterEach(() => { vi.useRealTimers(); });

describe('ActivityReportPage — quarter', () => {
  it('should show the open reporting period, not the calendar quarter', () => {
    renderAt();
    expect(lastQuarter()).toBe('Q3');
    expect(screen.getByRole('button', { name: 'Q3' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('should follow ?q= when it is a valid quarter', () => {
    renderAt('/activity-report?q=Q2');
    expect(lastQuarter()).toBe('Q2');
  });

  it('should fall back to the calendar quarter when no period is open', () => {
    mockPeriods.mockReturnValue({ isLoading: false, data: [{ quarter: 'Q3', fiscal_year: '2026', status: STATUSES.CLOSED }] });
    renderAt('/activity-report?q=Q9');
    expect(lastQuarter()).toBe('Q4');
  });

  it('should ignore an open period of another year', () => {
    mockPeriods.mockReturnValue({ isLoading: false, data: [{ quarter: 'Q1', fiscal_year: '2027', status: STATUSES.OPEN }] });
    renderAt();
    expect(lastQuarter()).toBe('Q4');
  });

  it('should switch quarter from the selector', () => {
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: 'Q4' }));
    expect(lastQuarter()).toBe('Q4');
    expect(screen.getByRole('button', { name: 'Q4' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('should wait for the periods before picking a default', () => {
    mockPeriods.mockReturnValue({ isLoading: true, data: undefined });
    renderAt();
    expect(screen.queryByRole('group', { name: 'Quarter' })).not.toBeInTheDocument();
  });
});
