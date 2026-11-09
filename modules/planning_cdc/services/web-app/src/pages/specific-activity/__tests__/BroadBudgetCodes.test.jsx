import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BroadBudgetCodes from '../BroadBudgetCodes';

describe('BroadBudgetCodes', () => {
  it('should list each budget code of the broad with its fund', () => {
    render(<BroadBudgetCodes codes={[
      { id: 1, budget_code: '11201', fund_code: 'MS-1', fund_description: 'Member States' },
      { id: 2, budget_code: '11202', fund_code: null, fund_description: null },
    ]} />);
    expect(screen.getByText('11201')).toBeTruthy();
    expect(screen.getByText(/Fund MS-1/)).toBeTruthy();
    expect(screen.getByText(/Member States/)).toBeTruthy();
    expect(screen.getByText('11202')).toBeTruthy();
  });

  it('should say when the broad has no budget code', () => {
    render(<BroadBudgetCodes codes={[]} />);
    expect(screen.getByText('No budget code for this broad activity yet.')).toBeTruthy();
  });

  it('should treat missing codes as none', () => {
    render(<BroadBudgetCodes />);
    expect(screen.getByText('No budget code for this broad activity yet.')).toBeTruthy();
  });
});
