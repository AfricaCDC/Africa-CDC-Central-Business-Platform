// ── SearchSelect component tests ──
//
// Behaviour under test:
//   - Trigger shows placeholder when no value is selected
//   - Trigger shows the selected label when a value is selected
//   - Clicking the trigger opens the dropdown
//   - Typing in the search input filters the options
//   - Clicking an option fires onChange + closes the dropdown
//   - Keyboard navigation: ArrowDown/ArrowUp move highlight, Enter picks
//   - Escape closes the dropdown
//   - allowClear: the × button calls onChange(null)
//   - disabled trigger does not open
//   - Empty-result state renders the "No matches" message
//
// Note: the component uses a portal-free absolute dropdown so screen queries
// work without any extra setup.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchSelect from '../SearchSelect';

const OPTIONS = [
  { value: 1, label: 'Alpha',   sub: 'First letter' },
  { value: 2, label: 'Bravo',   sub: 'Second letter' },
  { value: 3, label: 'Charlie', sub: 'Third letter' },
  { value: 4, label: 'Delta',   sub: 'Fourth letter' },
];

describe('<SearchSelect />', () => {
  it('should show the placeholder when value is empty', () => {
    render(
      <SearchSelect
        value={null}
        options={OPTIONS}
        onChange={vi.fn()}
        placeholder="Pick one"
      />
    );
    expect(screen.getByText('Pick one')).toBeInTheDocument();
  });

  it('should show the selected option label when a value is provided', () => {
    render(
      <SearchSelect value={2} options={OPTIONS} onChange={vi.fn()} />
    );
    expect(screen.getByText('Bravo')).toBeInTheDocument();
  });

  it('should open the dropdown when the trigger is clicked', () => {
    render(<SearchSelect value={null} options={OPTIONS} onChange={vi.fn()} />);
    // Dropdown not open yet
    expect(screen.queryByPlaceholderText(/Type to filter/)).toBeNull();

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByPlaceholderText(/Type to filter/)).toBeInTheDocument();
    // All options should be visible
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('should NOT open when disabled', () => {
    render(
      <SearchSelect
        value={null}
        options={OPTIONS}
        onChange={vi.fn()}
        disabled
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByPlaceholderText(/Type to filter/)).toBeNull();
  });

  it('should filter options case-insensitively as the user types', () => {
    render(<SearchSelect value={null} options={OPTIONS} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByPlaceholderText(/Type to filter/);
    fireEvent.change(input, { target: { value: 'cha' } });
    expect(screen.getByText('Charlie')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).toBeNull();
    expect(screen.queryByText('Bravo')).toBeNull();
  });

  it('should also match against the sub field', () => {
    render(<SearchSelect value={null} options={OPTIONS} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByPlaceholderText(/Type to filter/);
    fireEvent.change(input, { target: { value: 'third' } });
    expect(screen.getByText('Charlie')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).toBeNull();
  });

  it('should show the "No matches" empty state when the filter finds nothing', () => {
    render(<SearchSelect value={null} options={OPTIONS} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText(/Type to filter/), {
      target: { value: 'nonexistent' },
    });
    expect(screen.getByText(/No matches/)).toBeInTheDocument();
  });

  it('should fire onChange with the option value when an option is clicked', () => {
    const onChange = vi.fn();
    render(<SearchSelect value={null} options={OPTIONS} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Delta'));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('should close the dropdown after picking an option', () => {
    const onChange = vi.fn();
    render(<SearchSelect value={null} options={OPTIONS} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Bravo'));
    expect(screen.queryByPlaceholderText(/Type to filter/)).toBeNull();
  });

  it('should navigate options with ArrowDown + Enter', () => {
    const onChange = vi.fn();
    render(<SearchSelect value={null} options={OPTIONS} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByPlaceholderText(/Type to filter/);
    // Highlight starts at 0 (Alpha). Press Down twice → Charlie, then Enter.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(3); // Charlie
  });

  it('should stop at the last option on ArrowDown', () => {
    const onChange = vi.fn();
    render(<SearchSelect value={null} options={OPTIONS} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByPlaceholderText(/Type to filter/);
    // Press Down 10 times — should clamp at index 3 (Delta).
    for (let i = 0; i < 10; i += 1) {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
    }
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(4); // Delta
  });

  it('should not go below index 0 on ArrowUp', () => {
    const onChange = vi.fn();
    render(<SearchSelect value={null} options={OPTIONS} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByPlaceholderText(/Type to filter/);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(1); // Alpha (first)
  });

  it('should close the dropdown when Escape is pressed', () => {
    render(<SearchSelect value={null} options={OPTIONS} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByPlaceholderText(/Type to filter/)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByPlaceholderText(/Type to filter/)).toBeNull();
  });

  it('should render a clear button when allowClear=true and a value is set', () => {
    const onChange = vi.fn();
    render(
      <SearchSelect
        value={2}
        options={OPTIONS}
        onChange={onChange}
        allowClear
      />
    );
    const clearBtn = screen.getByTitle('Clear');
    expect(clearBtn).toBeInTheDocument();
    fireEvent.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('should NOT render the clear button when allowClear=false', () => {
    render(
      <SearchSelect value={2} options={OPTIONS} onChange={vi.fn()} />
    );
    expect(screen.queryByTitle('Clear')).toBeNull();
  });

  it('should use a custom filterFn when provided', () => {
    // filterFn that only matches values ending in an even id
    const filterFn = (opt) => opt.value % 2 === 0;
    render(
      <SearchSelect
        value={null}
        options={OPTIONS}
        onChange={vi.fn()}
        filterFn={filterFn}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Bravo')).toBeInTheDocument();
    expect(screen.getByText('Delta')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).toBeNull();
    expect(screen.queryByText('Charlie')).toBeNull();
  });
});
