import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DivisionsTable, ActivitiesTable } from '../ExecutionTables';

const fig = { released_budget: 1000, committed: 200, spent: 300, balance: 500, execution_pct: 50, spend_pct: 30 };
const activities = [
  { id: 68, code: '1.1.1.02', title: 'NCD strategy', division_code: 'NCD', ...fig,
    fund_centers: [{ fund_center: 'CDC100202MB' }] },
  { id: 69, code: '1.1.2.01', title: 'CHSISD implementation', division_code: 'CHSISD', ...fig, balance: -50,
    fund_centers: [{ fund_center: 'CDC100203MB' }, { fund_center: 'CDC100204MB' }] },
];

describe('ActivitiesTable', () => {
  it('should list each activity with its budget codes and balance', () => {
    render(<ActivitiesTable items={activities} onOpen={vi.fn()} />);
    expect(screen.getByText('CDC100203MB, CDC100204MB · 2 budget codes')).toBeInTheDocument();
    expect(screen.getByText('-$50')).toHaveClass('text-red-700');
    expect(screen.getByText('2 shown · click a row for the budget lines')).toBeInTheDocument();
  });

  it('should open the activity when its row is clicked', () => {
    const onOpen = vi.fn();
    render(<ActivitiesTable items={activities} onOpen={onOpen} />);
    fireEvent.click(screen.getByText('NCD strategy'));
    expect(onOpen).toHaveBeenCalledWith(68);
  });

  it('should flag an activity over budget or executing slowly, and nothing otherwise', () => {
    const flagged = [
      { ...activities[0], variance: 'OVER', expected_pct: 75 },
      { ...activities[1], variance: 'UNDER', expected_pct: 75 },
    ];
    render(<ActivitiesTable items={flagged} onOpen={vi.fn()} />);
    expect(screen.getByText('Over budget')).toHaveClass('text-red-700');
    expect(screen.getByText('Slow execution')).toHaveAttribute('title', '75 % of the year has passed');
  });

  it('should show no flag without a variance', () => {
    render(<ActivitiesTable items={activities} onOpen={vi.fn()} />);
    expect(screen.queryByText('Over budget')).toBeNull();
    expect(screen.queryByText('Slow execution')).toBeNull();
  });
});

describe('DivisionsTable', () => {
  it('should filter on the business unit clicked', () => {
    const onSelect = vi.fn();
    render(<DivisionsTable divisions={[{ division_code: 'EPR', division_name: 'Emergency', activity_count: 3, ...fig }]} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Emergency'));
    expect(onSelect).toHaveBeenCalledWith('EPR');
  });
});
