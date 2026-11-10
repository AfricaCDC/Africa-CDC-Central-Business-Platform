/* eslint-disable no-restricted-syntax, complexity --
 * navConfig.js carries pre-existing legacy debt:
 *   - 9 sidebar section/menu LABEL string literals (UI display strings +
 *     URL paths, NOT ENTITY_TYPES references). P-31 false positive — see
 *     scripts/forbidden.allowlist.json P-31 entry for the full reason
 *     (D-20260417-10).
 *   - getNavForUser() complexity (18) — explicit role/section merge
 *     algorithm with documented special cases. Refactor would split
 *     the merge logic across helpers; out of scope for chunk D.
 * (The legacy ADMIN_ROLES re-export shim was removed once App.jsx moved to
 *  the dynamic RBAC matrix — D-20260418-04 / Sprint 5.)
 * Do NOT add new violations; this pragma is a ceiling, not a green light.
 */
import {
    LayoutDashboard, FolderTree, CalendarRange, DollarSign,
    Database, Inbox,
    BarChart3, FileText, Globe, Users, Building2, CheckCircle2,
    Shield, Settings, GanttChart, ScrollText, GitBranch,
    Target, TrendingUp, Zap, PackageCheck, Sheet, Grid3x3,
    ClipboardList, ListChecks, Link, Bell, KeyRound, Flag, Globe2, Files, Layers, HeartPulse, Newspaper, BookOpen, UserCheck,
} from 'lucide-react';
import { ROLE_PRIORITY } from '@rbm/lib/roles';

/* ═══════════════════════════════════════════════════════
   NAVIGATION CONFIG — One definition per role
   ═══════════════════════════════════════════════════════ */

/* ── Shared building blocks ──
 * Each item has a `module` key matching an rbac_modules.code so the nav
 * can be filtered by the user's actual RBAC permissions from the DB.
 * Items without `module` (dashboard) are always visible.
 */
export const BLOCKS = {
    dashboard: { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    myDashboard: { icon: LayoutDashboard, label: 'Dashboard', path: '/report' },
    myWorkplan: { icon: CalendarRange, label: 'Workplan', path: '/my-workplan', module: 'workplan' },
    // The PIRS as imported, filtered on the BU in the BU selector (D-20261105-02).
    buPirs: { icon: Database, label: 'PIRS', path: '/pirs', module: 'pirs' },
    myBroads: { icon: PackageCheck, label: 'Broad Activities', path: '/my-broads', module: 'activities' },
    myIndicators: { icon: TrendingUp, label: 'T3 / T4 Indicators', path: '/my-indicators', module: 'pirs' },
    mySpecifics: { icon: ListChecks, label: 'Specific Activities', path: '/my-specifics', exact: true, module: 'activities' },
    // Added by useNavItems only for a user who can see at least one country (D-20261028-01).
    countryWorkplan: { icon: Globe2, label: 'Country Workplan', path: '/country-workplan' },
    // Every user, every role: the guides of every role (useNavItems appends it).
    userGuides: { icon: BookOpen, label: 'User guides', path: '/user-guides' },
    actReport: { icon: FileText, label: 'Write Indicator Report', path: '/division-reports', module: 'quarterly_report' },
    activityReport: { icon: ClipboardList, label: 'Write Activity Reports', path: '/activity-report', module: 'activity_report' },
    // Lists of submitted reports: tabs of Review Submissions, same gate as its route.
    activityReportList: { icon: Files, label: 'Approve Activity Reports', path: '/review-submissions?tab=activities', module: 'quarterly_report', action: 'approve' },
    quarterlyReportList: { icon: Files, label: 'Approve Indicator Reports', path: '/review-submissions?tab=reports', module: 'quarterly_report', action: 'approve' },
    project: { icon: FolderTree, label: 'Project', path: '/amert', module: 'plans' },
    impacts: { icon: Target, label: 'Impacts (T1)', path: '/impact', module: 'impact' },
    outcomes: { icon: TrendingUp, label: 'Outcomes (T2)', path: '/outcome', module: 'outcome' },
    stOutcomes: { icon: Zap, label: 'Short Term Outcomes', path: '/short-term-outcome', module: 'short_term_outcome' },
    broadActs: { icon: CalendarRange, label: 'Broad Activities', path: '/activities', module: 'activities' },
    workplan: { icon: CalendarRange, label: 'Workplan', path: '/workplan', module: 'workplan' },
    gantt: { icon: GanttChart, label: 'Gantt Chart', path: '/gantt', module: 'gantt' },
    budgetBase: { icon: Sheet, label: 'Budget Base', path: '/budget-base', module: 'budget' },
    budgetOver: { icon: DollarSign, label: 'Budget Overview', path: '/budget', module: 'budget' },
    pirs: { icon: Database, label: 'Indicators', path: '/pirs', exact: true, module: 'pirs' },
    pirsMapping: { icon: Link, label: 'Activity Mapping', path: '/pirs/mapping', module: 'indicator_mapping' },
    pirsContrib: { icon: BarChart3, label: 'Contributions Report', path: '/pirs/contributions', module: 'indicator_contributions' },
    quarterlyDashboard: { icon: BarChart3, label: 'Quarterly Dashboard', path: '/reporting/quarterly-dashboard', module: 'quarterly_report' },
    bigTickets: { icon: Flag, label: 'Big Tickets', path: '/big-tickets', module: 'big_ticket' },
    // Funding sources of the plan year, from the budget codes (D-20261106-13).
    donors: { icon: BarChart3, label: 'Donors & Reports', path: '/reporting/donors', module: 'division_report' },
    stratPlan: { icon: FileText, label: 'Strategic Plan', path: '/reference/strategic-plan', module: 'strategic_plan' },
    memberStates: { icon: Globe, label: 'Member States', path: '/reference/member-states', module: 'member_states' },
    partners: { icon: Users, label: 'Partners', path: '/reference/partners', module: 'partners' },
    orgStructure: { icon: Building2, label: 'Org Structure', path: '/reference/org', module: 'org_structure' },
    users: { icon: Shield, label: 'Users & Roles', path: '/admin/users', module: 'users' },
    adoption: { icon: UserCheck, label: 'Adoption', path: '/admin/adoption', module: 'users' },
    auditTrail: { icon: ScrollText, label: 'Audit Trail', path: '/governance/audit', module: 'audit_log' },
    workflows: { icon: GitBranch, label: 'Workflows', path: '/admin/workflows', module: 'workflows' },
    rbac: { icon: Shield, label: 'Permissions (RBAC)', path: '/admin/rbac', module: 'users' },
    notifWizard: { icon: Bell, label: 'Notification Wizard', path: '/admin/notifications', module: 'notifications' },
    notifOutbox: { icon: Inbox, label: 'Notif Outbox', path: '/admin/notifications/outbox', module: 'notifications' },
    apiKeys: { icon: KeyRound, label: 'API Keys', path: '/admin/api-keys', module: 'users' },
    settings: { icon: Settings, label: 'Settings', path: '/admin/settings', module: 'settings' },
    inbox: { icon: Inbox, label: 'Approval Inbox', path: '/governance/inbox', module: 'inbox' },
    // Monthly digest of a directorate (D-20261105-15); the API decides who reads which directorate.
    digest: { icon: Newspaper, label: 'Monthly Digest', path: '/digest' },
    dataHealth: { icon: HeartPulse, label: 'Data Health', path: '/admin/data-health', module: 'data_health' },
    reviewSubs: { icon: CheckCircle2, label: 'Review Submissions', path: '/review-submissions', badge: true, module: 'quarterly_report', action: 'approve' },
    logframe: { icon: Grid3x3, label: 'Logframe', path: '/logframe', module: 'logframe' },
    projProposal: { icon: ClipboardList, label: 'Project Proposal', path: '/amert', module: 'plans' },
    specActivity: { icon: ListChecks, label: 'Specific Activities', path: '/tasks', module: 'activities' },
    stOutOutput: { icon: Zap, label: 'Short Term Outcome / Output', path: '/short-term-outcome', module: 'short_term_outcome' },
};

const B = BLOCKS;

/* ── Operational dropdowns (D-20261105-02): what the BU has (Aggregates),
   planning and activity reports (Activities), indicator reporting (Indicators).
   A specific activity is created from the Specific Activities list. ── */
const AGGREGATES_MENU = {
    icon: Layers, label: 'Aggregates', path: '/my-workplan',
    children: [B.myWorkplan, B.buPirs, B.projProposal, B.budgetOver],
};
const ACTIVITIES_MENU = {
    icon: ListChecks, label: 'Activities', path: '/my-specifics',
    children: [B.myBroads, B.mySpecifics, B.activityReport, B.activityReportList],
};
const INDICATORS_MENU = {
    icon: FileText, label: 'Indicators', path: '/division-reports',
    children: [B.myIndicators, B.actReport, B.quarterlyReportList],
};

/* ── Navigation per role ── */
const NAV_BY_ROLE = {

    SYSTEM_ADMIN: [
        { section: '', collapsible: false, items: [B.dashboard] },
        {
            section: 'Project', collapsible: true, items: [
                B.projProposal, B.impacts, B.outcomes, B.broadActs, B.workplan, B.stOutOutput, B.specActivity,
            ]
        },
        { section: 'Tools', collapsible: true, items: [B.logframe, B.gantt, B.budgetBase, B.budgetOver] },
        { section: 'PIRS', collapsible: true, items: [B.pirs, B.pirsMapping, B.pirsContrib] },
        { section: 'M&E', collapsible: true, items: [B.reviewSubs, B.dataHealth] },
        { section: 'Reporting', collapsible: true, items: [B.bigTickets, B.quarterlyDashboard, B.donors, B.digest] },
        { section: 'Reference', collapsible: true, items: [B.stratPlan, B.memberStates, B.partners, B.orgStructure] },
        { section: 'Admin', collapsible: true, items: [B.users, B.adoption, B.auditTrail, B.workflows, B.rbac, B.notifWizard, B.notifOutbox, B.apiKeys, B.settings] },
    ],

    RBM_ADMIN: [
        { section: '', collapsible: false, items: [B.dashboard] },
        {
            section: 'Project', collapsible: true, items: [
                B.projProposal, B.impacts, B.outcomes, B.broadActs, B.workplan, B.stOutOutput, B.specActivity,
            ]
        },
        { section: 'Tools', collapsible: true, items: [B.logframe, B.gantt, B.budgetBase, B.budgetOver] },
        { section: 'PIRS', collapsible: true, items: [B.pirs, B.pirsMapping, B.pirsContrib] },
        { section: 'M&E', collapsible: true, items: [B.reviewSubs, B.dataHealth] },
        { section: 'Reporting', collapsible: true, items: [B.bigTickets, B.quarterlyDashboard, B.donors, B.digest] },
        { section: 'Reference', collapsible: true, items: [B.stratPlan, B.memberStates, B.partners, B.orgStructure] },
    ],

    ME_OFFICER: [
        { section: '', collapsible: false, items: [B.dashboard] },
        {
            section: 'Project', collapsible: true, items: [
                B.projProposal, B.impacts, B.outcomes, B.broadActs, B.workplan, B.stOutOutput, B.specActivity,
            ]
        },
        { section: 'Tools', collapsible: true, items: [B.logframe] },
        { section: 'PIRS', collapsible: true, items: [B.pirs, B.pirsMapping, B.pirsContrib] },
        { section: 'M&E', collapsible: true, items: [B.reviewSubs, B.dataHealth] },
        { section: 'Reporting', collapsible: true, items: [B.bigTickets, B.quarterlyDashboard, B.donors, B.digest] },
        { section: 'Reference', collapsible: true, items: [B.stratPlan] },
    ],

    FINANCE_OFFICER: [
        { section: '', collapsible: false, items: [B.dashboard] },
        { section: 'Budget', collapsible: true, items: [B.budgetBase, B.budgetOver] },
        { section: 'Reporting', collapsible: true, items: [B.bigTickets, B.quarterlyDashboard, B.donors] },
        { section: 'Reference', collapsible: true, items: [B.partners, B.orgStructure] },
    ],

    PLANNER: [
        { section: '', collapsible: false, items: [B.myDashboard, B.workplan, B.outcomes, B.broadActs, B.stOutOutput, B.specActivity, B.activityReport, B.actReport] },
    ],

    PROJECT_MANAGER: [
        { section: '', collapsible: false, items: [B.myDashboard, B.workplan, B.outcomes, B.broadActs, B.stOutOutput, B.specActivity, B.activityReport, B.actReport, B.gantt] },
    ],

    PROGRAM_OWNER: [
        { section: '', collapsible: false, items: [B.dashboard] },
        { section: 'Project', collapsible: true, items: [B.projProposal, B.impacts, B.outcomes, B.broadActs, B.workplan] },
        { section: 'Tools', collapsible: true, items: [B.budgetOver] },
        { section: 'Reference', collapsible: true, items: [B.stratPlan, B.memberStates, B.orgStructure] },
    ],

    APPROVER: [
        { section: '', collapsible: false, items: [B.dashboard] },
        { section: 'Governance', collapsible: true, items: [B.inbox] },
        {
            section: 'Project', collapsible: true, items: [
                B.projProposal, B.impacts, B.outcomes, B.broadActs, B.workplan, B.stOutOutput, B.specActivity,
            ]
        },
        { section: 'Tools', collapsible: true, items: [B.budgetOver] },
        { section: 'Reporting', collapsible: true, items: [B.bigTickets, B.quarterlyDashboard, B.donors] },
        { section: 'Reference', collapsible: true, items: [B.stratPlan, B.partners] },
    ],

    EXECUTIVE_VIEWER: [
        { section: '', collapsible: false, items: [B.dashboard] },
        { section: 'Project', collapsible: true, items: [B.projProposal, B.impacts, B.outcomes] },
        { section: 'Tools', collapsible: true, items: [B.budgetOver] },
        { section: 'Reporting', collapsible: true, items: [B.bigTickets, B.quarterlyDashboard, B.donors, B.digest] },
        { section: 'Reference', collapsible: true, items: [B.stratPlan] },
    ],

    PARTNER_VIEWER: [
        { section: '', collapsible: false, items: [B.budgetOver] },
        { section: 'Reporting', collapsible: true, items: [B.bigTickets, B.quarterlyDashboard, B.donors] },
    ],

    // Operational roles: same full nav for all — RBAC filter in MainNav
    // hides pages the user doesn't have permission for.
    FOCAL_PERSON: [
        { section: '', collapsible: false, items: [B.myDashboard, AGGREGATES_MENU, ACTIVITIES_MENU, INDICATORS_MENU, B.reviewSubs] },
        { section: 'Reporting', collapsible: true, items: [B.bigTickets, B.quarterlyDashboard, B.donors] },
    ],

    HEAD_OF_DIVISION: [
        { section: '', collapsible: false, items: [B.myDashboard, AGGREGATES_MENU, ACTIVITIES_MENU, INDICATORS_MENU, B.reviewSubs] },
        { section: 'Reporting', collapsible: true, items: [B.bigTickets, B.quarterlyDashboard, B.donors, B.digest] },
    ],

    DIRECTOR: [
        { section: '', collapsible: false, items: [B.myDashboard, AGGREGATES_MENU, ACTIVITIES_MENU, INDICATORS_MENU, B.reviewSubs] },
        { section: 'Reporting', collapsible: true, items: [B.bigTickets, B.quarterlyDashboard, B.donors, B.digest] },
    ],

    STAFF: [
        { section: '', collapsible: false, items: [B.myDashboard, AGGREGATES_MENU, ACTIVITIES_MENU, INDICATORS_MENU] },
        { section: 'Reporting', collapsible: true, items: [B.bigTickets, B.quarterlyDashboard, B.donors] },
    ],
};

/* Fallback for unknown roles — give everyone at least the read-only STAFF nav
   so a user who somehow has no role assigned can still navigate the app. */
const DEFAULT_NAV = NAV_BY_ROLE.STAFF;

// Dropdown that holds the operational items of a second role (business unit).
const BU_SECTION = 'BU';

// A dropdown cannot nest: in "BU" a menu contributes its children.
const itemsForSection = (key, items) => (key === BU_SECTION ? items.flatMap(i => i.children || [i]) : items);

/** Add the item to the merged group unless its path is already shown; a menu also claims its children's paths. */
function addOnce(merged, item, seenPaths) {
    if (item.path && seenPaths.has(item.path)) return;
    [item, ...(item.children || [])].forEach(i => i.path && seenPaths.add(i.path));
    merged.items.push(item);
}

/**
 * Resolve the navigation tree for a user by MERGING the nav sections
 * from ALL of the user's roles (not just the highest-priority one).
 *
 * A SYSTEM_ADMIN who is also HEAD_OF_DIVISION sees both the admin menu
 * AND the focal/HOD operational menu (My Workplan, My Specifics, etc.).
 *
 * Deduplication: items with the same `path` appear only once, keeping
 * the version from the higher-priority role. Sections with the same
 * name are merged into a single group.
 *
 * @param {string[]} roles — user role strings from AuthContext
 * @returns {Array<{section: string, collapsible: boolean, items: object[]}>}
 */
export function getNavForUser(roles) {
    if (!roles || roles.length === 0) return DEFAULT_NAV;

    // Collect navs for every role the user has, in priority order.
    const matchedNavs = [];
    for (const r of ROLE_PRIORITY) {
        if (roles.includes(r) && NAV_BY_ROLE[r]) matchedNavs.push(NAV_BY_ROLE[r]);
    }
    if (matchedNavs.length === 0) return DEFAULT_NAV;
    if (matchedNavs.length === 1) return matchedNavs[0];

    // Merge: walk each role's section groups, dedup by section name +
    // item path so the resulting menu is clean.
    //
    // Special case: when a lower-priority role contributes items from
    // its flat section (section: '') and the flat section already has
    // items from the primary role, we DON'T dump everything on the same
    // bar — that looks chaotic. Instead, the extra flat items go into a
    // dedicated "BU" dropdown so the layout stays readable.
    // An admin+HOD sees: Dashboard (flat) + "BU" dropdown.
    const seenPaths = new Set();
    const sectionMap = new Map();   // section name → { section, collapsible, items[] }
    let flatSectionOwner = null;    // tracks which nav (index) created the '' section

    for (let navIdx = 0; navIdx < matchedNavs.length; navIdx++) {
        const nav = matchedNavs[navIdx];
        for (const group of nav) {
            let key = group.section || '';

            // If the flat section already exists from a different (higher)
            // role, redirect these items into "BU" instead.
            if (key === '' && flatSectionOwner !== null && flatSectionOwner !== navIdx) {
                key = BU_SECTION;
            }

            if (!sectionMap.has(key)) {
                sectionMap.set(key, {
                    section: key === '' ? '' : key,
                    collapsible: key !== '',
                    items: [],
                });
                if (key === '') flatSectionOwner = navIdx;
            }
            const merged = sectionMap.get(key);
            itemsForSection(key, group.items).forEach(item => addOnce(merged, item, seenPaths));
        }
    }

    // Place "BU" right after the flat section (position 1)
    // so it's the first dropdown the user sees — their operational
    // context before the admin/management sections.
    const result = [...sectionMap.values()].filter(g => g.items.length > 0);
    const myDivIdx = result.findIndex(g => g.section === BU_SECTION);
    if (myDivIdx > 1) {
        const [myDiv] = result.splice(myDivIdx, 1);
        result.splice(1, 0, myDiv);
    }

    return result;
}
