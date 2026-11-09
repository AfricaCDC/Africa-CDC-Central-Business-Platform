import { describe, it, expect } from 'vitest';
import { getMasterDivisionCode } from '../divisionPrefixMap';

describe('getMasterDivisionCode', () => {
  it('should send indicator prefixes of a renamed division to the new code', () => {
    expect(getMasterDivisionCode('PHAHM.6.1-2', [{ code: 'APPM' }])).toBe('APPM');
    expect(getMasterDivisionCode('PHAHM 6.1-2', [{ code: 'APPM' }])).toBe('APPM');
  });

  it('should send indicator prefixes of a merged division to the surviving code', () => {
    expect(getMasterDivisionCode('PHC-ID.3.1-1', [{ code: 'ID' }])).toBe('ID');
  });

  it('should still match an unmapped prefix case-insensitively', () => {
    expect(getMasterDivisionCode('sdi.2.5-4', [{ code: 'SDI' }])).toBe('SDI');
  });

  it('should return null for an unknown prefix', () => {
    expect(getMasterDivisionCode('ZZZ.1', [{ code: 'SDI' }])).toBeNull();
  });
});
