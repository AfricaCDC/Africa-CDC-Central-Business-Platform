import { describe, it, expect } from 'vitest';
import {
  resolveReportEditRole,
  parseContributingDivisions,
  focalDivisionCodesFromMe,
  REPORT_ROLE_MAIN,
  REPORT_ROLE_CONTRIB,
  REPORT_ROLE_ADMIN,
  REPORT_REASON_NOT_AUTHENTICATED,
  REPORT_REASON_NOT_IN_DIVISIONS,
} from '../reportEditGate';

describe('parseContributingDivisions', () => {
  it('accepts a JSON string', () => {
    expect(parseContributingDivisions('["srh","dsi"]')).toEqual(['SRH', 'DSI']);
  });

  it('accepts an already-parsed array', () => {
    expect(parseContributingDivisions(['srh', ' dsi '])).toEqual(['SRH', 'DSI']);
  });

  it('returns [] for null / undefined / empty', () => {
    expect(parseContributingDivisions(null)).toEqual([]);
    expect(parseContributingDivisions(undefined)).toEqual([]);
    expect(parseContributingDivisions('')).toEqual([]);
  });

  it('returns [] for malformed JSON', () => {
    expect(parseContributingDivisions('{not-json}')).toEqual([]);
  });

  it('filters falsy entries and upper-cases', () => {
    expect(parseContributingDivisions(['', null, 'hr', undefined])).toEqual(['HR']);
  });
});

describe('resolveReportEditRole', () => {
  it('denies when unauthenticated', () => {
    const res = resolveReportEditRole({ isAuthenticated: false });
    expect(res).toEqual({ allowed: false, role: null, reason: REPORT_REASON_NOT_AUTHENTICATED });
  });

  it('admin bypass wins', () => {
    const res = resolveReportEditRole({
      mainDivisionCode: 'SRH',
      contributingDivisions: [],
      focalDivisionCodes: [],
      isAdmin: true,
    });
    expect(res).toEqual({ allowed: true, role: REPORT_ROLE_ADMIN, reason: null });
  });

  it('allows as MAIN when focal set contains MAIN', () => {
    const res = resolveReportEditRole({
      mainDivisionCode: 'SRH',
      contributingDivisions: ['DSI'],
      focalDivisionCodes: ['SRH', 'HR'],
    });
    expect(res).toEqual({ allowed: true, role: REPORT_ROLE_MAIN, reason: null });
  });

  it('allows as CONTRIB when focal set misses MAIN but hits CONTRIB', () => {
    const res = resolveReportEditRole({
      mainDivisionCode: 'SRH',
      contributingDivisions: '["DSI","EPR"]',
      focalDivisionCodes: ['DSI'],
    });
    expect(res).toEqual({ allowed: true, role: REPORT_ROLE_CONTRIB, reason: null });
  });

  it('denies when focal set misses both MAIN and CONTRIB', () => {
    const res = resolveReportEditRole({
      mainDivisionCode: 'SRH',
      contributingDivisions: ['DSI'],
      focalDivisionCodes: ['HR'],
    });
    expect(res).toEqual({ allowed: false, role: null, reason: REPORT_REASON_NOT_IN_DIVISIONS });
  });

  it('is case-insensitive on codes', () => {
    const res = resolveReportEditRole({
      mainDivisionCode: 'srh',
      contributingDivisions: ['dsi'],
      focalDivisionCodes: ['Srh'],
    });
    expect(res.role).toBe(REPORT_ROLE_MAIN);
  });

  it('reproducer: user focal(SRH, DSI) on indicator MAIN=SRH → MAIN', () => {
    const res = resolveReportEditRole({
      mainDivisionCode: 'SRH',
      contributingDivisions: null,
      focalDivisionCodes: ['SRH', 'DSI'],
    });
    expect(res.allowed).toBe(true);
    expect(res.role).toBe(REPORT_ROLE_MAIN);
  });

  it('MAIN takes precedence over CONTRIB when both would match', () => {
    const res = resolveReportEditRole({
      mainDivisionCode: 'SRH',
      contributingDivisions: ['DSI'],
      focalDivisionCodes: ['SRH', 'DSI'],
    });
    expect(res.role).toBe(REPORT_ROLE_MAIN);
  });
});

describe('focalDivisionCodesFromMe', () => {
  it('returns only codes whose reasons include "focal"', () => {
    const divs = [
      { code: 'SRH', reasons: ['focal', 'attached'] },
      { code: 'DSI', reasons: ['responsible'] },
      { code: 'HR', reasons: ['focal'] },
      { code: 'EPR', reasons: [] },
      { code: 'NO_REASONS' },
    ];
    expect(focalDivisionCodesFromMe(divs)).toEqual(['SRH', 'HR']);
  });

  it('returns [] for non-array input', () => {
    expect(focalDivisionCodesFromMe(null)).toEqual([]);
    expect(focalDivisionCodesFromMe(undefined)).toEqual([]);
  });
});
