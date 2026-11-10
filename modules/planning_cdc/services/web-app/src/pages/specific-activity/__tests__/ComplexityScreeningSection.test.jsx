import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { COMPLEXITY_CRITERIA } from '@rbm/lib/complexity';
import ComplexityScreeningSection from '../ComplexityScreeningSection';

const empty = { requires_complex_decision: null, ...Object.fromEntries(COMPLEXITY_CRITERIA.map((c) => [c.key, null])) };

describe('ComplexityScreeningSection', () => {
  it('should hide the matrix until Yes is answered', () => {
    const onChange = vi.fn();
    render(<ComplexityScreeningSection value={empty} onChange={onChange} />);
    expect(screen.queryByText('Information Requirements')).toBeNull();
    fireEvent.click(screen.getByLabelText('Yes'));
    expect(onChange).toHaveBeenCalledWith({ ...empty, requires_complex_decision: true });
  });

  it('should count the rated criteria until all five are rated', () => {
    render(<ComplexityScreeningSection value={{ ...empty, requires_complex_decision: true, scope_impact: 2 }} onChange={vi.fn()} />);
    expect(screen.getByText('1 of 5 criteria rated. Rate all five to see the result.')).toBeTruthy();
  });

  it('should show the score and band once the five criteria are rated', () => {
    const value = { ...empty, requires_complex_decision: true, ...Object.fromEntries(COMPLEXITY_CRITERIA.map((c) => [c.key, 3])) };
    render(<ComplexityScreeningSection value={value} onChange={vi.fn()} />);
    expect(screen.getByText('Score 15 / 15')).toBeTruthy();
    expect(screen.getByText(/High complexity/)).toBeTruthy();
  });

  it('should send the rating of a criterion', () => {
    const onChange = vi.fn();
    render(<ComplexityScreeningSection value={{ ...empty, requires_complex_decision: true }} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Risk & Uncertainty: Moderate'));
    expect(onChange).toHaveBeenCalledWith({ ...empty, requires_complex_decision: true, risk_uncertainty: 2 });
  });
});
