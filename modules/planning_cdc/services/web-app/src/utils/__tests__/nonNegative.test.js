import { describe, it, expect, vi } from 'vitest';
import { blockNegativeKeys, nonNegative } from '../nonNegative';

describe('nonNegative (D-20261013-11)', () => {
  it('should drop a negative value and keep the others', () => {
    expect(nonNegative('-100')).toBe('');
    expect(nonNegative('-0.5')).toBe('');
    expect(nonNegative('0')).toBe('0');
    expect(nonNegative('45')).toBe('45');
    expect(nonNegative('')).toBe('');
  });

  it('should block the minus, plus and exponent keys only', () => {
    for (const key of ['-', '+', 'e', 'E']) {
      const e = { key, preventDefault: vi.fn() };
      blockNegativeKeys(e);
      expect(e.preventDefault).toHaveBeenCalled();
    }
    const digit = { key: '5', preventDefault: vi.fn() };
    blockNegativeKeys(digit);
    expect(digit.preventDefault).not.toHaveBeenCalled();
  });
});
