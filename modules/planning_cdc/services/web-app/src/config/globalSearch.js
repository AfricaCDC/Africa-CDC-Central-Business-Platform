// Global search (D-20261106-05): how each result group of GET /api/search is
// shown and where its rows lead. Pages come from the user's own menu.

import { Building2, CalendarRange, Database, FileText, Globe2, ListChecks, Target } from 'lucide-react';
import { SEARCH_GROUPS, SEARCH_GROUP_LABELS, STATUS_LABELS } from '@rbm/lib/enums';

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_CHARS = 100;
/** Results per group: the top bar, then the full results page. */
export const SEARCH_BAR_LIMIT = 6;
export const SEARCH_PAGE_LIMIT = 50;
/** Typing pause before the top bar searches, in ms. */
export const SEARCH_DEBOUNCE_MS = 250;

/** Menu pages: a group of the top bar only, not returned by the API. */
export const PAGES_GROUP = 'PAGES';
const PAGES_SHOWN = 3;

export const SEARCH_GROUP_VIEW = Object.freeze({
  [PAGES_GROUP]: { label: 'Pages', Icon: FileText, color: 'text-gray-400' },
  [SEARCH_GROUPS.SPECIFIC]: { Icon: ListChecks, color: 'text-[#E8A838]' },
  [SEARCH_GROUPS.BROAD]: { Icon: CalendarRange, color: 'text-[#B4A269]' },
  [SEARCH_GROUPS.INDICATOR]: { Icon: Database, color: 'text-[#9F2241]' },
  [SEARCH_GROUPS.RESULT]: { Icon: Target, color: 'text-[#1A5632]' },
  [SEARCH_GROUPS.UNIT]: { Icon: Building2, color: 'text-[#348F41]' },
  [SEARCH_GROUPS.COUNTRY]: { Icon: Globe2, color: 'text-blue-700' },
});

const capitalize = (text) => (text ? text[0].toUpperCase() + text.slice(1) : '');

const planRow = (item) => ({
  code: item.code,
  label: item.title,
  sub: [item.responsible_division_code, STATUS_LABELS[item.status] || item.status].filter(Boolean).join(' · '),
  path: `/plan/node/${item.id}`,
});

// A row without a path (a page the user may not open) is left out.
const ROW_BUILDERS = Object.freeze({
  [SEARCH_GROUPS.UNIT]: (item, access) => ({
    code: item.code,
    label: item.name,
    sub: capitalize(item.level_type),
    path: access.canOpenReference ? `/reference/org/${encodeURIComponent(item.code)}` : null,
  }),
  [SEARCH_GROUPS.COUNTRY]: (item, access) => ({
    code: item.code,
    label: item.name,
    sub: item.region,
    path: access.countryCodes.includes(item.code) ? `/country-workplan?country=${item.code}`
      : access.canOpenReference ? '/reference/member-states' : null,
  }),
});

/**
 * Result sections, ready to render: menu pages first, then the API groups in
 * their order, each row with its label, code, sub-line and link.
 *
 * @param {{ pages?: object[], groups?: Array<{ group: string, items: object[] }>, access: { countryCodes: string[], canOpenReference: boolean } }} input
 * @returns {Array<{ group: string, label: string, rows: Array<{ key: string, group: string, code?: string, label: string, sub?: string, path: string }> }>}
 * @example buildSections({ groups: data.groups, access: { countryCodes: ['KEN'], canOpenReference: false } })
 */
export function buildSections({ pages = [], groups = [], access }) {
  const sections = pages.length ? [{ group: PAGES_GROUP, label: SEARCH_GROUP_VIEW[PAGES_GROUP].label, rows: pages }] : [];
  groups.forEach(({ group, items }) => {
    const build = ROW_BUILDERS[group] || planRow;
    const rows = items
      .map((item) => ({ key: `${group}-${item.id ?? item.code}`, group, ...build(item, access) }))
      .filter((row) => row.path);
    if (rows.length) sections.push({ group, label: SEARCH_GROUP_LABELS[group] || group, rows });
  });
  return sections;
}

/**
 * Pages of the user's menu whose label contains the text.
 *
 * @param {Array<{ items: object[] }>} nav - from useNavItems()
 * @param {string} text
 * @returns {Array<{ key: string, group: string, label: string, path: string }>}
 * @example matchPages(useNavItems(), 'budget')
 */
export function matchPages(nav, text) {
  const needle = text.trim().toLowerCase();
  if (!needle) return [];
  const seen = new Set();
  return nav
    .flatMap((g) => g.items.flatMap((item) => item.children || [item]))
    .filter((item) => item.path && item.label.toLowerCase().includes(needle) && !seen.has(item.path) && seen.add(item.path))
    .slice(0, PAGES_SHOWN)
    .map((item) => ({ key: `page-${item.path}`, group: PAGES_GROUP, label: item.label, path: item.path }));
}

/** @returns {string} the /search URL for a text */
export const searchPageUrl = (text) => `/search?q=${encodeURIComponent(text.trim())}`;
