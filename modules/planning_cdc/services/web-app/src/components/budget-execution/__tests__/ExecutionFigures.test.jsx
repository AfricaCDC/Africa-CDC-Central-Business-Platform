import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ExecutionFigures from '../ExecutionFigures';
import ExecutionBar from '../ExecutionBar';

const totals = { released_budget: 394550, committed: 90404, spent: 227045.16, balance: 77100.84, execution_pct: 80.5, spend_pct: 57.5 };

describe('ExecutionFigures', () => {
  it('should show the balance first, then released, committed, spent and both rates', () => {
    const { container } = render(<ExecutionFigures totals={totals} />);
    const labels = [...container.querySelectorAll('.uppercase')].map((n) => n.textContent);
    expect(labels).toEqual(['Balance', 'Released', 'Committed', 'Spent', 'Execution', 'Spent only']);
    expect(screen.getByText('$77,101')).toBeInTheDocument();
    expect(screen.getByText('$394,550')).toBeInTheDocument();
    expect(screen.getByText('80.5%')).toBeInTheDocument();
  });

  it('should explain how the balance is computed', () => {
    render(<ExecutionFigures totals={totals} />);
    expect(screen.getByText(/Released − committed − spent/)).toBeInTheDocument();
  });

  it('should show a negative balance in red and a dash when nothing was released', () => {
    render(<ExecutionFigures totals={{ released_budget: 0, committed: 0, spent: 500, balance: -500, execution_pct: null, spend_pct: null }} />);
    expect(screen.getByText('-$500')).toHaveClass('text-red-700');
    expect(screen.getAllByText('—')).toHaveLength(2);
  });
});

describe('ExecutionBar', () => {
  it('should describe the split for screen readers', () => {
    render(<ExecutionBar totals={totals} />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Spent $227,045, committed $90,404, balance $77,101 of $394,550 released');
  });

  it('should flag an overspent budget', () => {
    render(<ExecutionBar totals={{ released_budget: 100, committed: 50, spent: 80, balance: -30 }} />);
    expect(screen.getByText('Overspent by $30')).toBeInTheDocument();
  });

  it('should hide the legend when asked', () => {
    render(<ExecutionBar totals={totals} showLegend={false} />);
    expect(screen.queryByText('Committed')).not.toBeInTheDocument();
  });
});
