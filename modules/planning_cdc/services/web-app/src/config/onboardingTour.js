// In-app onboarding tour (D-20261105-16). The tour follows the guides'
// version: when a release changes what users see, bump USER_GUIDES_VERSION
// and add its steps to WHATS_NEW; users who took an older tour then see
// only what changed. A step whose `target` is not on screen (another role's
// menu, a phone layout) is skipped, so one list serves every role.

import { USER_GUIDES_VERSION } from './userGuides';

export const TOUR_VERSION = USER_GUIDES_VERSION;

/** `data-tour` key of a main-menu entry, from its label: 'M&E' → 'nav-m-e'. */
export const navTourKey = (label) => `nav-${String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

const HELP_STEP = Object.freeze({ id: 'help', target: 'help', title: 'Help on this page',
  body: 'Opens, in a new tab, the chapter of your guide that explains the page you are on.' });

const SEARCH_STEP = Object.freeze({ id: 'search', target: 'search', title: 'Search',
  body: 'Type a code or a name: activities and indicators of the selected year, Business Units, member states. Ctrl K puts the cursor here.' });

const FULL_TOUR = Object.freeze([
  { id: 'welcome', title: 'Welcome to the RBM platform',
    body: 'A one-minute tour of your screen. Leave it at any time; you can take it again from the menu under your initials.' },
  { id: 'burger', target: 'burger', title: 'The menu',
    body: 'Every page of the platform, the search, your Business Unit and the plan year.' },
  { id: 'dashboard', target: 'nav-dashboard', title: 'Dashboard',
    body: 'Your home page: what waits for you, the figures of your Business Unit and its budget execution.' },
  { id: 'aggregates', target: 'nav-aggregates', title: 'Aggregates',
    body: 'What your Business Unit has: workplan, PIRS indicators, project proposal and budget.' },
  { id: 'activities', target: 'nav-activities', title: 'Activities',
    body: 'Plan your specific activities, follow their approval and write the activity reports. Copy an activity to the next year from its Actions menu.' },
  { id: 'indicators', target: 'nav-indicators', title: 'Indicators',
    body: 'Write the quarterly indicator reports. The form lists the approved activity reports of the quarter to help you write the narrative.' },
  { id: 'review', target: 'nav-review-submissions', title: 'Review Submissions',
    body: 'What waits for your approval. You can also approve or reject from the email: its buttons open a page that asks you to confirm.' },
  { id: 'governance', target: 'nav-governance', title: 'Governance',
    body: 'The Approval Inbox: what waits for your decision.' },
  { id: 'structure', target: 'nav-project', title: 'Project structure',
    body: 'The structure of the plan: impacts, outcomes, broad and specific activities, workplan.' },
  { id: 'tools', target: 'nav-tools', title: 'Tools',
    body: 'The logframe, the Gantt chart and the budget pages.' },
  { id: 'budget', target: 'nav-budget', title: 'Budget',
    body: 'The budget base and the budget overview.' },
  { id: 'pirs', target: 'nav-pirs', title: 'PIRS',
    body: 'The indicators, their mapping to the broad activities and the contributions report.' },
  { id: 'me', target: 'nav-m-e', title: 'M&E',
    body: 'Review Submissions, and Data Health: the records to complete before they hold up an approval, a report or the budget follow-up.' },
  { id: 'reporting', target: 'nav-reporting', title: 'Reporting',
    body: 'Big Tickets, the quarterly dashboard, the funding by donor and the monthly digest of a directorate, which you can print as PDF.' },
  { id: 'reference', target: 'nav-reference', title: 'Reference',
    body: 'The strategic plan, the member states, the partners and the organisation structure.' },
  { id: 'admin', target: 'nav-admin', title: 'Admin',
    body: 'Users, permissions, workflows, notifications and settings.' },
  { id: 'guides', target: 'nav-user-guides', title: 'User guides',
    body: 'The guide of each role, to read in the browser or download as PDF.' },
  HELP_STEP,
  { id: 'selectors', target: 'selectors', title: 'Business Unit and year',
    body: 'Choose the Business Unit and the plan year you work on. Every page follows them.' },
  SEARCH_STEP,
  { id: 'tasks', target: 'tasks', title: 'Your tasks',
    body: 'The bell lists what waits for you. A red number means something to do.' },
  { id: 'avatar', target: 'avatar', title: 'Your menu',
    body: 'Your profile and your Business Units, Out of office (a colleague approves for you while you are away), this tour, and sign out.' },
  { id: 'done', title: 'You are ready',
    body: 'The guide of your role explains each screen step by step.', cta: { label: 'Open the guides', path: '/user-guides' } },
]);

/**
 * Steps shown in a release to users who took an older tour, by version.
 * Add an entry when USER_GUIDES_VERSION is bumped for a user-visible change.
 */
export const WHATS_NEW = Object.freeze({
  '1.4': [{ ...HELP_STEP, title: 'New: Help on this page' }],
  '1.5': [{ ...SEARCH_STEP, title: 'New: a faster search' }],
  '1.6': [{ id: 'donors', target: 'nav-reporting', title: 'New: Donors & Reports',
    body: 'Donors & Reports lists the funding sources of the plan year, from the budget codes. Open one to see what it funds, by Business Unit.' }],
  '1.7': [{ id: 'microsoft-only', target: 'avatar', title: 'Sign-in: Microsoft only',
    body: 'You sign in with your Africa CDC Microsoft account, the same as Outlook and Teams. The platform no longer has passwords.' }],
  '1.8': [{ id: 'session-return', target: 'avatar', title: 'Sign in again, carry on',
    body: 'If your session ends, the sign-in page says so. Sign in again and you come back to the page you were on.' }],
});

const toNumber = (v) => {
  const [major, minor] = String(v).split('.').map(Number);
  return (major || 0) * 1000 + (minor || 0);
};

/**
 * The steps to show a user, before anchors are checked.
 *
 * @param {string|null} seenVersion - last tour version finished or skipped; null = never
 * @param {{ version?: string, whatsNew?: object, full?: object[] }} [opts]
 * @returns {{ mode: 'full'|'new'|null, steps: object[] }} mode null = nothing to show
 * @example tourFor(null).mode // 'full'
 */
export function tourFor(seenVersion, { version = TOUR_VERSION, whatsNew = WHATS_NEW, full = FULL_TOUR } = {}) {
  if (!seenVersion) return { mode: 'full', steps: full };
  const newer = Object.keys(whatsNew)
    .filter((v) => toNumber(v) > toNumber(seenVersion) && toNumber(v) <= toNumber(version))
    .sort((a, b) => toNumber(a) - toNumber(b))
    .flatMap((v) => whatsNew[v]);
  return newer.length ? { mode: 'new', steps: newer } : { mode: null, steps: [] };
}

export { FULL_TOUR };
