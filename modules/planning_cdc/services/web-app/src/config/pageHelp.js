// Help on this page (D-20261106-04): which chapter of which guide explains a
// page. The first entry whose `path` matches wins, so specific paths come
// first. `chapters` = guide key (USER_GUIDES) → chapter number. When the
// guides are rebuilt and a chapter moves, update its number here.

import { USER_GUIDES, guideChapterUrl } from './userGuides';

const PAGE_HELP = Object.freeze([
  { path: /^\/(dashboard|report)$/, chapters: { focal: 2, responsible: 2, me: 2 } },
  { path: /^\/my-specifics\/(new|\d+\/edit)$/, chapters: { focal: 4 } },
  { path: /^\/my-specifics$/, chapters: { focal: 6, me: 5 } },
  { path: /^\/plan\/node\//, chapters: { focal: 6, responsible: 5, me: 5 } },
  { path: /^\/(my-workplan|my-broads|my-indicators|my-outcomes|activities)$/, chapters: { focal: 3 } },
  { path: /^\/activity-report/, chapters: { focal: 7, responsible: 6, me: 7 } },
  { path: /^\/(division-reports|quarterly-report\/)/, chapters: { focal: 8, responsible: 7, me: 6 } },
  { path: /^\/review-submissions/, chapters: { responsible: 4, me: 6 } },
  { path: /^\/decide\//, chapters: { responsible: 3 } },
  { path: /^\/out-of-office$/, chapters: { responsible: 8 } },
  { path: /^\/(budget-execution|budget$)/, chapters: { responsible: 9 } },
  { path: /^\/digest$/, chapters: { responsible: 9, me: 10 } },
  { path: /^\/country-workplan$/, chapters: { focal: 9, me: 8 } },
  { path: /^\/pirs\/(mapping|contributions)$/, chapters: { me: 4 } },
  { path: /^\/pirs/, chapters: { me: 3 } },
  { path: /^\/admin\/data-health$/, chapters: { me: 9 } },
  { path: /^\/reporting\//, chapters: { me: 10 } },
]);

/**
 * The guide chapter that explains a page, for a user: the guide of one of
 * the user's roles when it covers the page, else the first guide that does.
 *
 * @param {string} pathname
 * @param {string[]} [roles] - the user's role codes
 * @returns {{ title: string, chapter: number, url: string }|null} null = no chapter for this page
 * @example helpFor('/division-reports', user.roles).url // a focal person: '/guides/RBM-Focal-Person-Guide.html?v=1.4#ch-8'
 */
export function helpFor(pathname, roles = []) {
  const entry = PAGE_HELP.find((e) => e.path.test(pathname));
  if (!entry) return null;
  const guides = USER_GUIDES.filter((g) => entry.chapters[g.key]);
  const guide = guides.find((g) => g.roles.some((r) => roles.includes(r))) || guides[0];
  const chapter = entry.chapters[guide.key];
  return { title: guide.title, chapter, url: guideChapterUrl(guide, chapter) };
}

export { PAGE_HELP };
