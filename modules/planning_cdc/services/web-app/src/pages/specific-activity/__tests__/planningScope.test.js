// ── Broads and T3/T4 offered by the specific activity form (D-20261028-03) ──

import { describe, it, expect } from 'vitest';
import { scopeBroads, indicatorsForBroad, countryOfficeOf } from '../planningScope';

const broad = (id, bu, extra = {}) => ({ id, responsible_division_code: bu, ...extra });
const ind = (id, bu, extra = {}) => ({ id, responsible_division_code: bu, ...extra });
const ids = (rows) => rows.map((r) => r.id);

describe('scopeBroads', () => {
  const broads = [broad(1, 'DCM'), broad(2, 'HR', { contributing_divisions: '["dcm"]' }), broad(3, 'LAB')];

  it('should keep only the broads the user BU is responsible for, not those it contributes to', () => {
    expect(ids(scopeBroads(broads, new Set(['DCM'])))).toEqual([1]);
  });

  it('should keep the broad already saved on the activity', () => {
    expect(ids(scopeBroads(broads, new Set(['DCM']), '3'))).toEqual([1, 3]);
  });

  it('should keep every broad when no unit is given', () => {
    expect(ids(scopeBroads(broads, new Set()))).toEqual([1, 2, 3]);
  });
});

describe('indicatorsForBroad', () => {
  const indicators = [ind(10, 'DCM'), ind(11, 'LAB', { contributing_divisions: ['DCM'] }), ind(12, 'HR'), ind(13, 'COMMS')];
  const codes = new Set(['HR']);

  it('should offer the indicators of the broad BU, whatever Activity Mapping links', () => {
    expect(ids(indicatorsForBroad({ indicators, codes, broad: broad(1, 'dcm', { indicator_ids: [13] }) }))).toEqual([10, 11]);
  });

  it('should fall back to the user units when the broad BU has no indicator, and with no broad', () => {
    expect(ids(indicatorsForBroad({ indicators, codes, broad: broad(1, 'CPI_ASM') }))).toEqual([12]);
    expect(ids(indicatorsForBroad({ indicators, codes }))).toEqual([12]);
  });

  it('should keep the indicator already saved on the activity', () => {
    expect(ids(indicatorsForBroad({ indicators, codes, broad: broad(1, 'DCM'), keepId: 13 }))).toEqual([13, 10, 11]);
  });
});

describe('countryOfficeOf', () => {
  it('should give the office code and its country name', () => {
    expect(countryOfficeOf({ code: 'CO-KEN', is_country_office: true, country_code: 'KEN' })).toEqual({ code: 'CO-KEN', country: 'Kenya' });
  });

  it('should return null for a division or no unit', () => {
    expect(countryOfficeOf({ code: 'DCM', is_country_office: false })).toBeNull();
    expect(countryOfficeOf(null)).toBeNull();
  });

  it('should keep the office when its country code is unknown', () => {
    expect(countryOfficeOf({ code: 'CO-X', is_country_office: true, country_code: 'ZZZ' })).toEqual({ code: 'CO-X', country: null });
  });
});
