// ── ExecutionYearGate tests ──
//
// The defect this closes: the quarterly dashboard showed FY2026 reports while
// the top nav read FY2027. Showing one year's data under another year's label
// is worse than showing none, so the gate blocks the page outright.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExecutionYearGate from '../ExecutionYearGate';

const setPlanningYear = vi.fn();
let ctx;

vi.mock('@/contexts/PlanningYearContext', () => ({
  usePlanningYear: () => ctx,
}));

vi.mock('@/components/layout/DashboardLayout', () => ({
  default: ({ children }) => <div data-testid="layout">{children}</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  ctx = { planningYear: '2027', reportableYear: '2026', isFuturePlan: true, setPlanningYear };
});

describe('ExecutionYearGate', () => {
  it('should render the page when the selected year has started', () => {
    ctx = { ...ctx, planningYear: '2026', isFuturePlan: false };
    render(<ExecutionYearGate><p>quarterly dashboard</p></ExecutionYearGate>);
    expect(screen.getByText('quarterly dashboard')).toBeInTheDocument();
  });

  it('should block the page when the selected year has not started', () => {
    render(<ExecutionYearGate><p>quarterly dashboard</p></ExecutionYearGate>);
    expect(screen.queryByText('quarterly dashboard')).not.toBeInTheDocument();
  });

  it('should name the year that has not started', () => {
    render(<ExecutionYearGate><p>hidden</p></ExecutionYearGate>);
    expect(screen.getByText(/FY2027 has not started/)).toBeInTheDocument();
  });

  it('should say planning stays open, so the block does not read as a failure', () => {
    render(<ExecutionYearGate><p>hidden</p></ExecutionYearGate>);
    expect(screen.getByText(/activities, indicators and budgets\s+are all open/)).toBeInTheDocument();
  });

  it('should offer a way back to the year in progress', async () => {
    render(<ExecutionYearGate><p>hidden</p></ExecutionYearGate>);
    await userEvent.click(screen.getByRole('button', { name: /switch to fy2026/i }));
    expect(setPlanningYear).toHaveBeenCalledWith('2026');
  });

  it('should offer the workplan as the alternative destination', () => {
    render(<ExecutionYearGate><p>hidden</p></ExecutionYearGate>);
    expect(screen.getByRole('link', { name: /workplan/i })).toHaveAttribute('href', '/my-workplan');
  });
});
