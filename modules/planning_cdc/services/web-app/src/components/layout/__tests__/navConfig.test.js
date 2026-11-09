// ── Operational menu: Aggregates, Activities and Indicators dropdowns, BU ──

import { describe, it, expect } from 'vitest';
import { ROLES } from '@rbm/lib/roles';
import { getNavForUser } from '../navConfig';

const labels = (items) => items.map((i) => i.label);
const flat = (nav) => nav.find((g) => !g.section).items;

describe('getNavForUser', () => {
  it('should group the BU aggregates, planning and indicator reporting into three dropdowns for a focal person', () => {
    const items = flat(getNavForUser([ROLES.FOCAL_PERSON]));
    expect(labels(items)).toEqual(['Dashboard', 'Aggregates', 'Activities', 'Indicators', 'Review Submissions']);
    const [aggregates, activities, indicators] = items.filter((i) => i.children);
    expect(aggregates.children.map((c) => c.path)).toEqual(['/my-workplan', '/pirs', '/amert', '/budget']);
    expect(labels(aggregates.children).slice(1)).toEqual(['PIRS', 'Project Proposal', 'Budget Overview']);
    expect(labels(activities.children)).toEqual([
      'Broad Activities', 'Specific Activities', 'Write Activity Reports', 'Approve Activity Reports',
    ]);
    expect(labels(indicators.children)).toEqual(['T3 / T4 Indicators', 'Write Indicator Report', 'Approve Indicator Reports']);
    expect(activities.children.find((c) => c.label === 'Approve Activity Reports').path).toBe('/review-submissions?tab=activities');
  });

  it('should not repeat the operational items for a focal person who is also head of division', () => {
    const nav = getNavForUser([ROLES.FOCAL_PERSON, ROLES.HEAD_OF_DIVISION]);
    expect(nav.some((g) => g.section === 'BU')).toBe(false);
  });

  it('should list the menu entries one by one in BU for an admin who is also head of division', () => {
    const nav = getNavForUser([ROLES.SYSTEM_ADMIN, ROLES.HEAD_OF_DIVISION]);
    const bu = nav.find((g) => g.section === 'BU');
    expect(nav.indexOf(bu)).toBe(1);
    expect(bu.items.some((i) => i.children)).toBe(false);
    expect(labels(bu.items)).toEqual(expect.arrayContaining(['Write Indicator Report', 'Specific Activities', 'Approve Indicator Reports']));
  });
});
