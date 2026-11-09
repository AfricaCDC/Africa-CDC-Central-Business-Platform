// ── MultiSearchSelect — several values from a long list (D-20261026-02) ──

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MultiSearchSelect from '../MultiSearchSelect';
import { parseCodeList } from '@/utils/codeList';

const OPTIONS = [
  { value: 'EPR', label: 'Emergency Preparedness' },
  { value: 'SCI', label: 'Science and Innovation' },
  { value: 'HR', label: 'Human Resources' },
];

describe('<MultiSearchSelect />', () => {
  it('should show one chip per selected value with its label', () => {
    render(<MultiSearchSelect values={['EPR', 'SCI']} options={OPTIONS} onChange={vi.fn()} />);
    expect(screen.getByText('Emergency Preparedness')).toBeInTheDocument();
    expect(screen.getByText('Science and Innovation')).toBeInTheDocument();
  });

  it('should add a picked value and offer only the values not yet selected', () => {
    const onChange = vi.fn();
    render(<MultiSearchSelect values={['EPR']} options={OPTIONS} onChange={onChange} placeholder="Add" />);
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    expect(screen.queryAllByText('Emergency Preparedness')).toHaveLength(1);
    fireEvent.click(screen.getByText('Human Resources'));
    expect(onChange).toHaveBeenCalledWith(['EPR', 'HR']);
  });

  it('should remove a value from its chip', () => {
    const onChange = vi.fn();
    render(<MultiSearchSelect values={['EPR', 'SCI']} options={OPTIONS} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Emergency Preparedness' }));
    expect(onChange).toHaveBeenCalledWith(['SCI']);
  });

  it('should hide the remove buttons when disabled', () => {
    render(<MultiSearchSelect values={['EPR']} options={OPTIONS} onChange={vi.fn()} disabled />);
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
  });
});

describe('parseCodeList', () => {
  it('should read a JSON array, an array, or nothing', () => {
    expect(parseCodeList('["EPR","SCI"]')).toEqual(['EPR', 'SCI']);
    expect(parseCodeList(['HR'])).toEqual(['HR']);
    expect(parseCodeList(null)).toEqual([]);
    expect(parseCodeList('')).toEqual([]);
  });

  it('should return an empty list for unreadable or non-array JSON', () => {
    expect(parseCodeList('EPR')).toEqual([]);
    expect(parseCodeList('{"a":1}')).toEqual([]);
  });
});
