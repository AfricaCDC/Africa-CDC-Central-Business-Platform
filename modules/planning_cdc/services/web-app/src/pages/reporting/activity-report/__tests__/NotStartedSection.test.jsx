import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NotStartedSection, { NotStartedNotice } from '../NotStartedSection';
import { EMPTY_FORM } from '../reportTemplate';

describe('NotStartedSection', () => {
  it('should show the quarter picker only once ticked', () => {
    const set = vi.fn();
    const { rerender } = render(<NotStartedSection form={EMPTY_FORM} set={set} quarter="Q3" fiscalYear="2026" />);
    expect(screen.queryByLabelText('Expected to start in')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('This activity has not started yet'));
    expect(set).toHaveBeenCalledWith('not_started', true);

    rerender(<NotStartedSection form={{ ...EMPTY_FORM, not_started: true }} set={set} quarter="Q3" fiscalYear="2026" />);
    const select = screen.getByLabelText('Expected to start in');
    expect(screen.queryByRole('option', { name: 'Q3 2026' })).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'Q4-2026' } });
    expect(set).toHaveBeenCalledWith('expected_start', 'Q4-2026');
  });

  it('should clear the expected start when unticked', () => {
    const set = vi.fn();
    render(<NotStartedSection form={{ ...EMPTY_FORM, not_started: true, expected_start: 'Q4-2026' }} set={set} quarter="Q3" fiscalYear="2026" />);
    fireEvent.click(screen.getByLabelText('This activity has not started yet'));
    expect(set).toHaveBeenCalledWith('not_started', false);
    expect(set).toHaveBeenCalledWith('expected_start', '');
  });
});

describe('NotStartedNotice', () => {
  it('should say when the activity is expected to start', () => {
    render(<NotStartedNotice form={{ not_started: true, expected_start: 'Q1-2027' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Expected to start in Q1 2027');
  });

  it('should render nothing for a started activity', () => {
    const { container } = render(<NotStartedNotice form={{ not_started: false }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
