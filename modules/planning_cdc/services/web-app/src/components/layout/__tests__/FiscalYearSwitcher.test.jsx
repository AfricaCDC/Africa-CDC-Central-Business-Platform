// ── FiscalYearSwitcher tests ──
//
// The switcher is the only UI that writes the planning year, so what matters
// is that it offers exactly the years the server reports, that it says which
// ones have not started, and that it stays out of the way when there is a
// single generation.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FiscalYearSwitcher from '../FiscalYearSwitcher';

const setPlanningYear = vi.fn();
let ctx;

vi.mock('@/contexts/PlanningYearContext', () => ({
  usePlanningYear: () => ctx,
}));

beforeEach(() => {
  vi.clearAllMocks();
  ctx = {
    planningYear: '2026',
    setPlanningYear,
    years: ['2027', '2026'],
    reportableYear: '2026',
    isLoading: false,
  };
});

describe('FiscalYearSwitcher', () => {
  it('should show the selected year', () => {
    render(<FiscalYearSwitcher />);
    expect(screen.getByRole('button', { name: /fiscal year 2026/i })).toBeInTheDocument();
  });

  it('should show a plain chip while the years are loading', () => {
    ctx.isLoading = true;
    render(<FiscalYearSwitcher />);
    expect(screen.getByText(/FY 2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('should show a plain chip when a single generation exists', () => {
    // One option is not a choice, but the nav must still state the year:
    // this slot is the only place it appears.
    ctx.years = ['2026'];
    render(<FiscalYearSwitcher />);
    expect(screen.getByText(/FY 2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('should list every year the server reported', async () => {
    render(<FiscalYearSwitcher />);
    await userEvent.click(screen.getByRole('button', { name: /fiscal year/i }));
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByRole('option', { name: /2027/ })).toBeInTheDocument();
  });

  it('should mark a year that has not started', async () => {
    render(<FiscalYearSwitcher />);
    await userEvent.click(screen.getByRole('button', { name: /fiscal year/i }));
    expect(screen.getByText(/not started, planning only/i)).toBeInTheDocument();
  });

  it('should not mark the year in progress', async () => {
    render(<FiscalYearSwitcher />);
    await userEvent.click(screen.getByRole('button', { name: /fiscal year/i }));
    expect(screen.getAllByText(/not started, planning only/i)).toHaveLength(1);
  });

  it('should select a year and close', async () => {
    render(<FiscalYearSwitcher />);
    await userEvent.click(screen.getByRole('button', { name: /fiscal year/i }));
    await userEvent.click(screen.getByRole('option', { name: /2027/ }));
    expect(setPlanningYear).toHaveBeenCalledWith('2027');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('should flag the trigger when the selected year has not started', () => {
    ctx.planningYear = '2027';
    render(<FiscalYearSwitcher />);
    expect(screen.getByText('Planning')).toBeInTheDocument();
  });

  it('should mark the selected option for assistive technology', async () => {
    render(<FiscalYearSwitcher />);
    await userEvent.click(screen.getByRole('button', { name: /fiscal year/i }));
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('2026');
  });
});
