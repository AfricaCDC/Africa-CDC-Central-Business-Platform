// ── Combobox component tests ──
//
// Behaviour under test:
//   - shows the controlled value in the input
//   - opens a suggestion list on focus
//   - filters suggestions as the user types
//   - typing fires onChange with the raw text (free text allowed)
//   - clicking a suggestion fires onChange with that suggestion + closes
//   - keyboard: ArrowDown + Enter picks the highlighted suggestion

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Combobox from '../Combobox';

const OPTIONS = ['African Union', 'GAVI', 'World Bank', 'CEPI'];

describe('<Combobox />', () => {
  it('should render the controlled value in the input', () => {
    render(<Combobox value="GAVI" options={OPTIONS} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('GAVI')).toBeInTheDocument();
  });

  it('should open the suggestion list on focus', () => {
    render(<Combobox value="" options={OPTIONS} onChange={vi.fn()} placeholder="Pick" />);
    expect(screen.queryByText('African Union')).toBeNull();
    fireEvent.focus(screen.getByPlaceholderText('Pick'));
    expect(screen.getByText('African Union')).toBeInTheDocument();
    expect(screen.getByText('CEPI')).toBeInTheDocument();
  });

  it('should fire onChange with raw text as the user types (free text allowed)', () => {
    const onChange = vi.fn();
    render(<Combobox value="" options={OPTIONS} onChange={onChange} placeholder="Pick" />);
    fireEvent.change(screen.getByPlaceholderText('Pick'), { target: { value: 'Canadian Gov' } });
    expect(onChange).toHaveBeenCalledWith('Canadian Gov');
  });

  it('should filter suggestions by the typed substring (case-insensitive)', () => {
    render(<Combobox value="wor" options={OPTIONS} onChange={vi.fn()} placeholder="Pick" />);
    fireEvent.focus(screen.getByPlaceholderText('Pick'));
    expect(screen.getByText('World Bank')).toBeInTheDocument();
    expect(screen.queryByText('GAVI')).toBeNull();
    expect(screen.queryByText('CEPI')).toBeNull();
  });

  it('should fire onChange with the clicked suggestion and close the list', () => {
    const onChange = vi.fn();
    render(<Combobox value="" options={OPTIONS} onChange={onChange} placeholder="Pick" />);
    fireEvent.focus(screen.getByPlaceholderText('Pick'));
    fireEvent.click(screen.getByText('World Bank'));
    expect(onChange).toHaveBeenCalledWith('World Bank');
    expect(screen.queryByText('African Union')).toBeNull();
  });

  it('should pick the highlighted option with ArrowDown + Enter', () => {
    const onChange = vi.fn();
    render(<Combobox value="" options={OPTIONS} onChange={onChange} placeholder="Pick" />);
    const input = screen.getByPlaceholderText('Pick');
    fireEvent.focus(input);
    // highlight starts at 0 (African Union); ArrowDown → GAVI, Enter picks it.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('GAVI');
  });
});
