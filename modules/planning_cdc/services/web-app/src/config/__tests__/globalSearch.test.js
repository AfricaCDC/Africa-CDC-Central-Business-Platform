import { describe, it, expect } from 'vitest';
import { ORG_LEVEL_TYPES, SEARCH_GROUPS } from '@rbm/lib/enums';
import { buildSections, matchPages, searchPageUrl, PAGES_GROUP } from '../globalSearch';

const NONE = { countryCodes: [], canOpenReference: false };
const SPECIFIC = { id: 41, code: 'SDI.2.1.3', title: 'Train lab staff', responsible_division_code: 'SDI', status: 'APPROVED' };
const UNIT = { code: 'SDI', name: 'Surveillance and Disease Intelligence', level_type: ORG_LEVEL_TYPES.DIVISION };
const KENYA = { code: 'KEN', name: 'Kenya', region: 'Eastern' };

describe('buildSections', () => {
  it('should open a plan item on its detail page, with its unit and status', () => {
    const [section] = buildSections({ groups: [{ group: SEARCH_GROUPS.SPECIFIC, items: [SPECIFIC] }], access: NONE });
    expect(section).toEqual({
      group: SEARCH_GROUPS.SPECIFIC,
      label: 'Specific activities',
      rows: [{ key: 'SPECIFIC-41', group: SEARCH_GROUPS.SPECIFIC, code: 'SDI.2.1.3', label: 'Train lab staff', sub: 'SDI · Approved', path: '/plan/node/41' }],
    });
  });

  it('should put menu pages first', () => {
    const pages = [{ key: 'page-/budget', group: PAGES_GROUP, label: 'Budget', path: '/budget' }];
    const sections = buildSections({ pages, groups: [{ group: SEARCH_GROUPS.SPECIFIC, items: [SPECIFIC] }], access: NONE });
    expect(sections.map((s) => s.label)).toEqual(['Pages', 'Specific activities']);
  });

  it('should open a Business Unit only for a user who may open the reference pages', () => {
    const groups = [{ group: SEARCH_GROUPS.UNIT, items: [UNIT] }];
    expect(buildSections({ groups, access: NONE })).toEqual([]);
    const [section] = buildSections({ groups, access: { countryCodes: [], canOpenReference: true } });
    expect(section.rows[0]).toMatchObject({ label: 'Surveillance and Disease Intelligence', sub: expect.stringMatching(/^Division$/), path: '/reference/org/SDI' });
  });

  it('should open the country workplan of a viewable member state, else the member states page', () => {
    const groups = [{ group: SEARCH_GROUPS.COUNTRY, items: [KENYA] }];
    const rowFor = (access) => buildSections({ groups, access })[0]?.rows[0]?.path;
    expect(rowFor({ countryCodes: ['KEN'], canOpenReference: false })).toBe('/country-workplan?country=KEN');
    expect(rowFor({ countryCodes: [], canOpenReference: true })).toBe('/reference/member-states');
    expect(rowFor(NONE)).toBeUndefined();
  });
});

describe('matchPages', () => {
  const NAV = [
    { items: [{ label: 'Dashboard', path: '/dashboard' }, { label: 'Budget', children: [{ label: 'Budget Overview', path: '/budget' }, { label: 'Budget Execution', path: '/budget-execution' }] }] },
    { section: 'Admin', items: [{ label: 'Budget Overview', path: '/budget' }, { label: 'Budget Base', path: '/budget-base' }, { label: 'Budget plan', path: '/budget-plan' }] },
  ];

  it('should match menu labels, children included, once per page, 3 at most', () => {
    expect(matchPages(NAV, ' BUDGET ').map((p) => p.path)).toEqual(['/budget', '/budget-execution', '/budget-base']);
  });

  it('should return nothing for an empty text', () => {
    expect(matchPages(NAV, '  ')).toEqual([]);
  });
});

describe('searchPageUrl', () => {
  it('should encode the trimmed text', () => {
    expect(searchPageUrl(' SDI & co ')).toBe('/search?q=SDI%20%26%20co');
  });
});
