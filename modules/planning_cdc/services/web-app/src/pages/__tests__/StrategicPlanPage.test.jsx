import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const state = vi.hoisted(() => ({ query: {} }));

vi.mock('@/components/layout/DashboardLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('@/hooks/useMiscQueries', () => ({ useStrategicPlan: () => state.query }));

import StrategicPlanPage from '../StrategicPlanPage';

beforeEach(() => { state.query = { data: [], isLoading: false, isError: false, refetch: vi.fn() }; });

describe('StrategicPlanPage', () => {
  it('should list the priorities and the enablers apart', () => {
    state.query.data = [
      { id: 14, sp_code: 'P1', sp_type: 'priority', short_name: 'Primary Health Care', full_goal: 'Goal 1' },
      { id: 20, sp_code: 'EA', sp_type: 'enabler', short_name: 'Digital', full_goal: 'Goal A' },
    ];
    render(<StrategicPlanPage />);
    expect(screen.getByText('Strategic Priorities')).toBeTruthy();
    expect(screen.getByText('Primary Health Care')).toBeTruthy();
    expect(screen.getByText('Strategic Enablers')).toBeTruthy();
    expect(screen.getByText('Digital')).toBeTruthy();
    expect(screen.getAllByText('(1)')).toHaveLength(2);
  });

  it('should say when nothing is configured', () => {
    render(<StrategicPlanPage />);
    expect(screen.getByText('No Strategic Plan items are configured.')).toBeTruthy();
  });

  it('should offer a retry when the plan cannot be loaded', () => {
    state.query = { ...state.query, isError: true };
    render(<StrategicPlanPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.query.refetch).toHaveBeenCalled();
  });
});
