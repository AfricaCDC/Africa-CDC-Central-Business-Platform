import { describe, it, expect } from 'vitest';
import { safeReturnTo, loginUrlFor, isSafePath } from '../returnTo';

describe('safeReturnTo', () => {
  it('should accept an app path', () => {
    expect(safeReturnTo(new URLSearchParams('return_to=%2Fdecide%2F311%3Fd%3Dapprove'))).toBe('/decide/311?d=approve');
  });

  it('should refuse another site, a missing value and the login page', () => {
    expect(safeReturnTo(new URLSearchParams('return_to=%2F%2Fevil.example'))).toBeNull();
    expect(safeReturnTo(new URLSearchParams('return_to=https%3A%2F%2Fevil.example'))).toBeNull();
    expect(safeReturnTo(new URLSearchParams('return_to=%2F%5Cevil'))).toBeNull();
    expect(safeReturnTo(new URLSearchParams(''))).toBeNull();
    expect(safeReturnTo(new URLSearchParams('return_to=%2Flogin'))).toBeNull();
  });
});

describe('loginUrlFor', () => {
  it('should carry the page and its query to the login page', () => {
    expect(loginUrlFor({ pathname: '/decide/311', search: '?d=reject' })).toBe('/login?return_to=%2Fdecide%2F311%3Fd%3Dreject');
  });

  it('should not add return_to for the home page', () => {
    expect(loginUrlFor({ pathname: '/', search: '' })).toBe('/login');
  });

  it('should keep the page /login was going to when already on /login', () => {
    expect(loginUrlFor({ pathname: '/login', search: '?return_to=%2Fprofile&reason=session_expired' })).toBe('/login?return_to=%2Fprofile');
  });

  it('should not wrap /login in itself', () => {
    expect(loginUrlFor({ pathname: '/login', search: '' })).toBe('/login');
    expect(loginUrlFor({ pathname: '/login', search: '?return_to=%2F%2Fevil.example' })).toBe('/login');
  });
});

describe('isSafePath', () => {
  it('should accept an app path with its query', () => {
    expect(isSafePath('/decide/311?d=approve')).toBe(true);
  });

  it('should refuse another host, a control character or a space', () => {
    expect(isSafePath('//evil.example')).toBe(false);
    expect(isSafePath('/\\evil.example')).toBe(false);
    expect(isSafePath('/\t/evil.example')).toBe(false);
    expect(isSafePath('/a b')).toBe(false);
  });

  it('should refuse a missing or overlong path', () => {
    expect(isSafePath(null)).toBe(false);
    expect(isSafePath(`/${'a'.repeat(600)}`)).toBe(false);
  });
});
