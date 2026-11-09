import { describe, it, expect } from 'vitest';
import { FULL_TOUR, TOUR_VERSION, navTourKey, tourFor } from '../onboardingTour';
import { USER_GUIDES_VERSION } from '../userGuides';

const STEP = (id) => ({ id, title: id, body: id });

describe('onboardingTour', () => {
  it('should follow the guides version', () => {
    expect(TOUR_VERSION).toBe(USER_GUIDES_VERSION);
  });

  it('should build the anchor key of a menu entry from its label', () => {
    expect(navTourKey('Dashboard')).toBe('nav-dashboard');
    expect(navTourKey('M&E')).toBe('nav-m-e');
    expect(navTourKey('Review Submissions')).toBe('nav-review-submissions');
    expect(navTourKey('User guides')).toBe('nav-user-guides');
  });

  it('should give the full tour to a user who never took it', () => {
    expect(tourFor(null)).toEqual({ mode: 'full', steps: FULL_TOUR });
    expect(tourFor('')).toEqual({ mode: 'full', steps: FULL_TOUR });
  });

  it('should show nothing when the user saw the current version', () => {
    expect(tourFor(TOUR_VERSION, { whatsNew: {} })).toEqual({ mode: null, steps: [] });
  });

  it('should show the new steps of every release since the version seen, oldest first', () => {
    const whatsNew = { '1.10': [STEP('c')], '1.3': [STEP('a')], '1.4': [STEP('b')], '1.11': [STEP('later')] };
    const res = tourFor('1.2', { version: '1.10', whatsNew });
    expect(res.mode).toBe('new');
    expect(res.steps.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('should skip releases the user already saw', () => {
    const whatsNew = { '1.3': [STEP('a')], '1.4': [STEP('b')] };
    expect(tourFor('1.3', { version: '1.4', whatsNew }).steps.map((s) => s.id)).toEqual(['b']);
  });

  it('should show the new search to a user who saw the 1.4 tour', () => {
    const { mode, steps } = tourFor('1.4', { version: '1.5' });
    expect(mode).toBe('new');
    expect(steps.map((s) => [s.target, s.title])).toEqual([['search', 'New: a faster search']]);
  });

  it('should show Donors & Reports to a user who saw the 1.5 tour', () => {
    const { mode, steps } = tourFor('1.5', { version: '1.6' });
    expect(mode).toBe('new');
    expect(steps.map((s) => [s.target, s.title])).toEqual([['nav-reporting', 'New: Donors & Reports']]);
  });

  it('should tell a user who saw the 1.7 tour that sign-in brings them back to their page', () => {
    const { mode, steps } = tourFor('1.7', { version: '1.8' });
    expect(mode).toBe('new');
    expect(steps.map((s) => [s.target, s.title])).toEqual([['avatar', 'Sign in again, carry on']]);
  });

  it('should tell a user who saw the 1.6 tour that sign-in is Microsoft only', () => {
    const { mode, steps } = tourFor('1.6', { version: '1.7' });
    expect(mode).toBe('new');
    expect(steps.map((s) => [s.target, s.title])).toEqual([['avatar', 'Sign-in: Microsoft only']]);
  });

  it('should start and end the full tour with steps that need no anchor', () => {
    expect(FULL_TOUR[0].target).toBeUndefined();
    expect(FULL_TOUR.at(-1).target).toBeUndefined();
    expect(FULL_TOUR.at(-1).cta.path).toBe('/user-guides');
    expect(new Set(FULL_TOUR.map((s) => s.id)).size).toBe(FULL_TOUR.length);
  });
});
