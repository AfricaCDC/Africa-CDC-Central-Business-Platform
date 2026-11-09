/**
 * @rbm/lib/enums — Statuses, status styles, entity types, tiers, indicator
 * types, fiscal periods. Single source of truth used by api-server, web-app
 * and any future service.
 *
 * Per CLAUDE.md "Zero Hardcoded Values" — DO NOT redefine these constants
 * inline in any consuming file.
 */

const { TIER_CONFIG, TIER_BY_NUMBER, getTierByNumber, getTierByCode } = require('./theme');

const ENTITY_TYPES = {
  STRATEGIC_PLAN: 'STRATEGIC_PLAN',
  PROGRAM: 'PROGRAM',
  PROJECT: 'PROJECT',
  WORKPLAN: 'WORKPLAN',
  BUDGET: 'BUDGET',
  LOGFRAME: 'LOGFRAME',
  RESULT: 'RESULT',
  INDICATOR: 'INDICATOR',
  REPORT: 'REPORT',
  PLAN_NODE: 'PLAN_NODE',
};

const ENTITY_TABLES = {
  [ENTITY_TYPES.STRATEGIC_PLAN]: 'strategic_plans',
  [ENTITY_TYPES.PROGRAM]: 'programs',
  [ENTITY_TYPES.INDICATOR]: 'indicators',
  [ENTITY_TYPES.PLAN_NODE]: 'plan_nodes',
};

const OWNER_FIELDS = {
  [ENTITY_TYPES.STRATEGIC_PLAN]: 'owner_user_id',
  [ENTITY_TYPES.PROGRAM]: 'owner_user_id',
  [ENTITY_TYPES.INDICATOR]: 'owner_user_id',
  [ENTITY_TYPES.PLAN_NODE]: 'owner_user_id',
};

/**
 * Canonical workflow statuses. Union of every status used across services.
 * Add new statuses here, never inline in components.
 */
// eslint-disable-next-line cdc-rbm/no-inline-status-map -- this IS the canonical map
const STATUSES = Object.freeze({
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
  IN_EXECUTION: 'IN_EXECUTION',
  CLOSED: 'CLOSED',
  LOCKED: 'LOCKED',
  // Extended statuses (used in workplans/activities/reports)
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  BLOCKED: 'BLOCKED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
  PLANNING: 'PLANNING',
  SUBMITTED: 'SUBMITTED',
  OPEN: 'OPEN',
  VALIDATED: 'VALIDATED',
  // Flags an activity_report ownership dispute — the focal person is declaring
  // this specific activity does not apply to their division. Added by migration
  // 20260412100000_add_not_applicable_status.js.
  NOT_APPLICABLE: 'NOT_APPLICABLE',
});

/**
 * Human-readable status labels. Keep aligned with `STATUSES` keys.
 */
const STATUS_LABELS = Object.freeze({
  [STATUSES.DRAFT]: 'Draft',
  [STATUSES.IN_REVIEW]: 'In Review',
  [STATUSES.APPROVED]: 'Approved',
  [STATUSES.PUBLISHED]: 'Published',
  [STATUSES.ARCHIVED]: 'Archived',
  [STATUSES.IN_EXECUTION]: 'In Execution',
  [STATUSES.CLOSED]: 'Closed',
  [STATUSES.LOCKED]: 'Locked',
  [STATUSES.NOT_STARTED]: 'Not Started',
  [STATUSES.IN_PROGRESS]: 'In Progress',
  [STATUSES.BLOCKED]: 'Blocked',
  [STATUSES.REJECTED]: 'Rejected',
  [STATUSES.CANCELLED]: 'Cancelled',
  [STATUSES.COMPLETED]: 'Completed',
  [STATUSES.PLANNING]: 'Planning',
  [STATUSES.SUBMITTED]: 'Submitted',
  [STATUSES.OPEN]: 'Open',
  [STATUSES.VALIDATED]: 'Validated',
  [STATUSES.NOT_APPLICABLE]: 'Not Applicable',
});

/**
 * Tailwind class strings per status. Use via `STATUS_STYLES[status]`.
 * Keys: `bg`, `text`, `border`, `dot` (color of accent dot/badge).
 */
const STATUS_STYLES = Object.freeze({
  [STATUSES.DRAFT]:        { bg: 'bg-gray-100',    text: 'text-gray-700',    border: 'border-gray-200',    dot: 'bg-gray-400' },
  [STATUSES.IN_REVIEW]:    { bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500' },
  [STATUSES.SUBMITTED]:    { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500' },
  [STATUSES.APPROVED]:     { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  [STATUSES.PUBLISHED]:    { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500' },
  [STATUSES.ARCHIVED]:     { bg: 'bg-gray-50',     text: 'text-gray-500',    border: 'border-gray-200',    dot: 'bg-gray-300' },
  [STATUSES.IN_EXECUTION]: { bg: 'bg-indigo-50',   text: 'text-indigo-700',  border: 'border-indigo-200',  dot: 'bg-indigo-500' },
  [STATUSES.CLOSED]:       { bg: 'bg-gray-100',    text: 'text-gray-600',    border: 'border-gray-200',    dot: 'bg-gray-400' },
  [STATUSES.LOCKED]:       { bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500' },
  [STATUSES.NOT_STARTED]:  { bg: 'bg-gray-100',    text: 'text-gray-700',    border: 'border-gray-200',    dot: 'bg-gray-400' },
  [STATUSES.IN_PROGRESS]:  { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500' },
  [STATUSES.BLOCKED]:      { bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500' },
  [STATUSES.REJECTED]:     { bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500' },
  [STATUSES.CANCELLED]:    { bg: 'bg-gray-100',    text: 'text-gray-500',    border: 'border-gray-200',    dot: 'bg-gray-400' },
  [STATUSES.COMPLETED]:    { bg: 'bg-green-50',    text: 'text-green-700',   border: 'border-green-200',   dot: 'bg-green-500' },
  [STATUSES.PLANNING]:     { bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500' },
  [STATUSES.OPEN]:         { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500' },
  [STATUSES.VALIDATED]:    { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  [STATUSES.NOT_APPLICABLE]: { bg: 'bg-slate-100',   text: 'text-slate-600',   border: 'border-slate-200',   dot: 'bg-slate-400' },
});

/**
 * State machine — which status transitions are allowed.
 */
const VALID_TRANSITIONS = Object.freeze({
  [STATUSES.DRAFT]:        [STATUSES.IN_REVIEW, STATUSES.SUBMITTED],
  [STATUSES.SUBMITTED]:    [STATUSES.APPROVED, STATUSES.REJECTED, STATUSES.IN_REVIEW],
  [STATUSES.IN_REVIEW]:    [STATUSES.APPROVED, STATUSES.REJECTED, STATUSES.DRAFT],
  [STATUSES.APPROVED]:     [STATUSES.PUBLISHED, STATUSES.ARCHIVED, STATUSES.DRAFT],
  [STATUSES.PUBLISHED]:    [STATUSES.ARCHIVED],
  [STATUSES.ARCHIVED]:     [],
  [STATUSES.IN_EXECUTION]: [STATUSES.CLOSED, STATUSES.ARCHIVED, STATUSES.COMPLETED],
  [STATUSES.CLOSED]:       [STATUSES.ARCHIVED],
  [STATUSES.LOCKED]:       [STATUSES.ARCHIVED],
  [STATUSES.REJECTED]:     [STATUSES.DRAFT],
  [STATUSES.CANCELLED]:    [],
  [STATUSES.COMPLETED]:    [STATUSES.ARCHIVED],
  [STATUSES.NOT_STARTED]:  [STATUSES.IN_PROGRESS, STATUSES.CANCELLED],
  [STATUSES.IN_PROGRESS]:  [STATUSES.BLOCKED, STATUSES.COMPLETED, STATUSES.CANCELLED],
  [STATUSES.BLOCKED]:      [STATUSES.IN_PROGRESS, STATUSES.CANCELLED],
  [STATUSES.PLANNING]:     [STATUSES.NOT_STARTED, STATUSES.IN_PROGRESS],
  [STATUSES.OPEN]:         [STATUSES.CLOSED],
  [STATUSES.VALIDATED]:    [STATUSES.PUBLISHED, STATUSES.ARCHIVED],
});

/**
 * Get the display config for a status. Falls back gracefully on unknown
 * statuses with a humanised label.
 *
 * @param {string} status
 * @returns {{ label: string, bg: string, text: string, border: string, dot: string }}
 */
function getStatusConfig(status) {
  const styles = STATUS_STYLES[status] || { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200', dot: 'bg-gray-400' };
  const label = STATUS_LABELS[status] || (status ? String(status).replace(/_/g, ' ') : 'Unknown');
  return { label, ...styles };
}

/**
 * Project a status to a high-level health bucket. Used by dashboards.
 *
 * @param {string} status
 * @returns {'on_track'|'at_risk'|'delayed'|'completed'|'unknown'}
 */
function statusToProgress(status) {
  if (status === STATUSES.COMPLETED) return 'completed';
  if ([STATUSES.APPROVED, STATUSES.IN_EXECUTION, STATUSES.PUBLISHED, STATUSES.IN_PROGRESS].includes(status)) return 'on_track';
  if ([STATUSES.IN_REVIEW, STATUSES.DRAFT, STATUSES.PLANNING, STATUSES.SUBMITTED].includes(status)) return 'at_risk';
  if ([STATUSES.BLOCKED, STATUSES.REJECTED, STATUSES.CANCELLED].includes(status)) return 'delayed';
  return 'unknown';
}

const DECISIONS = Object.freeze({
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
});

/**
 * Tier reference. Imports the canonical config from `@rbm/lib/theme`. The
 * legacy keys (`label`, `color`) are preserved so existing consumers don't
 * break.
 */
const TIERS = Object.freeze({
  T1: { id: TIER_CONFIG.T1.id, label: TIER_CONFIG.T1.longLabel, color: TIER_CONFIG.T1.color, ...TIER_CONFIG.T1 },
  T2: { id: TIER_CONFIG.T2.id, label: TIER_CONFIG.T2.longLabel, color: TIER_CONFIG.T2.color, ...TIER_CONFIG.T2 },
  T3: { id: TIER_CONFIG.T3.id, label: TIER_CONFIG.T3.longLabel, color: TIER_CONFIG.T3.color, ...TIER_CONFIG.T3 },
  T4: { id: TIER_CONFIG.T4.id, label: TIER_CONFIG.T4.longLabel, color: TIER_CONFIG.T4.color, ...TIER_CONFIG.T4 },
});

/**
 * Plan node types — used by the plan_nodes table for hierarchy.
 */
const NODE_TYPES = Object.freeze({
  IMPACT: 'IMPACT',
  IMPACT_INDICATOR: 'IMPACT_INDICATOR',
  OUTCOME: 'OUTCOME',
  OUTCOME_AREA: 'OUTCOME_AREA',
  OUTCOME_INDICATOR: 'OUTCOME_INDICATOR',
  BROAD_ACTIVITY: 'BROAD_ACTIVITY',
  SPECIFIC_ACTIVITY: 'SPECIFIC_ACTIVITY',
});

const ITEM_TYPES = Object.freeze({
  ACTIVITY: 'ACTIVITY',
  TASK: 'TASK',
});

const RESULT_LEVEL = Object.freeze({
  IMPACT: 'IMPACT',
  OUTCOME: 'OUTCOME',
  OUTPUT: 'OUTPUT',
});

const ORG_LEVEL_TYPES = Object.freeze({
  DIRECTORATE: 'directorate',
  DIVISION: 'division',
  UNIT: 'unit',
  OFFICE: 'office',
});

const RBAC_SCOPES = Object.freeze({
  OWN: 'own',
  DIVISION: 'division',
  DIRECTORATE: 'directorate',
  ALL: 'all',
});

/**
 * Calendar quarters used for reporting periods.
 */
const QUARTERS = Object.freeze({
  Q1: { code: 'Q1', label: 'Quarter 1', months: ['Jan', 'Feb', 'Mar'], number: 1 },
  Q2: { code: 'Q2', label: 'Quarter 2', months: ['Apr', 'May', 'Jun'], number: 2 },
  Q3: { code: 'Q3', label: 'Quarter 3', months: ['Jul', 'Aug', 'Sep'], number: 3 },
  Q4: { code: 'Q4', label: 'Quarter 4', months: ['Oct', 'Nov', 'Dec'], number: 4 },
});

const INDICATOR_TYPES = Object.freeze(['QUANTITATIVE', 'QUALITATIVE', 'COMPOSITE']);
const REPORTING_FREQUENCIES = Object.freeze(['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL']);
const RESULT_LEVELS = Object.freeze(['IMPACT', 'OUTCOME', 'OUTPUT']);

/**
 * Progress status of a Big Ticket for a quarter (D-20261015-02), chosen by
 * the lead business unit. Distinct from the report workflow status (DRAFT,
 * SUBMITTED, APPROVED...), which lives in STATUSES.
 */
const BIG_TICKET_PROGRESS = Object.freeze({
  ON_TRACK: 'ON_TRACK',
  ACHIEVED: 'ACHIEVED',
  AT_RISK: 'AT_RISK',
  OFF_TRACK: 'OFF_TRACK',
  NOT_STARTED: 'NOT_STARTED',
});

/** Label and Tailwind classes per Big Ticket progress status. */
const BIG_TICKET_PROGRESS_CONFIG = Object.freeze({
  [BIG_TICKET_PROGRESS.ON_TRACK]:    { label: 'On track',    bg: 'bg-blue-50',   text: 'text-blue-700',   bar: 'bg-blue-600' },
  [BIG_TICKET_PROGRESS.ACHIEVED]:    { label: 'Achieved',    bg: 'bg-green-50',  text: 'text-green-800',  bar: 'bg-[#1A5632]' },
  [BIG_TICKET_PROGRESS.AT_RISK]:     { label: 'At risk',     bg: 'bg-amber-50',  text: 'text-amber-800',  bar: 'bg-amber-600' },
  [BIG_TICKET_PROGRESS.OFF_TRACK]:   { label: 'Off track',   bg: 'bg-red-50',    text: 'text-red-800',    bar: 'bg-red-700' },
  [BIG_TICKET_PROGRESS.NOT_STARTED]: { label: 'Not started', bg: 'bg-gray-100',  text: 'text-gray-700',   bar: 'bg-gray-400' },
});

/**
 * Activity and mission types of the official Africa CDC Activity Reporting
 * Template (item 4). Since D-20261105-01 they are also the types a specific
 * activity is classified under at planning time (ACTIVITY_TYPES, used by HR /
 * procurement / finance to plan resources): the focal person picks one when
 * creating the activity, and its activity reports show it, read-only.
 */
const MISSION_TYPES = Object.freeze({
  OFFICIAL_ENGAGEMENT: 'OFFICIAL_ENGAGEMENT',
  TRAINING:            'TRAINING',
  EVENT:               'EVENT',
  PROCUREMENT:         'PROCUREMENT',
  IN_OFFICE:           'IN_OFFICE',
  RECRUITMENT_HR:      'RECRUITMENT_HR',
  OTHER:               'OTHER',
});

const MISSION_TYPE_LABELS = Object.freeze({
  [MISSION_TYPES.OFFICIAL_ENGAGEMENT]: 'I. Official engagement',
  [MISSION_TYPES.TRAINING]:            'II. Training',
  [MISSION_TYPES.EVENT]:               'III. Event (workshop, meeting, conference)',
  [MISSION_TYPES.PROCUREMENT]:         'IV. Procurement',
  [MISSION_TYPES.IN_OFFICE]:           'V. In-office',
  [MISSION_TYPES.RECRUITMENT_HR]:      'VI. Recruitment & HR',
  [MISSION_TYPES.OTHER]:               'VII. Others',
});

const MISSION_TYPE_OPTIONS = Object.freeze(
  Object.entries(MISSION_TYPE_LABELS).map(([value, label]) => ({ value, label }))
);

// The planning classification of a specific activity is the same list.
const ACTIVITY_TYPES = MISSION_TYPES;
const ACTIVITY_TYPE_LABELS = MISSION_TYPE_LABELS;
const ACTIVITY_TYPE_OPTIONS = MISSION_TYPE_OPTIONS;

/**
 * Risk level of a specific activity (D-20261105-05): how likely it is to be
 * delayed or not delivered. Optional, set by the focal person; the Specific
 * Activities list shows it, filters on it and puts the riskiest first.
 */
const ACTIVITY_RISK_LEVELS = Object.freeze({
  HIGH:   'HIGH',
  MEDIUM: 'MEDIUM',
  LOW:    'LOW',
});

const ACTIVITY_RISK_CONFIG = Object.freeze({
  [ACTIVITY_RISK_LEVELS.HIGH]:   { label: 'High',   bg: 'bg-red-50',   text: 'text-red-700',   border: 'border-red-200' },
  [ACTIVITY_RISK_LEVELS.MEDIUM]: { label: 'Medium', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  [ACTIVITY_RISK_LEVELS.LOW]:    { label: 'Low',    bg: 'bg-gray-50',  text: 'text-gray-600',  border: 'border-gray-200' },
});

const ACTIVITY_RISK_OPTIONS = Object.freeze(
  Object.values(ACTIVITY_RISK_LEVELS).map((value) => ({ value, label: ACTIVITY_RISK_CONFIG[value].label }))
);

/**
 * Budget variance flag of a broad activity after a SAP import (D-20261105-13):
 * OVER when (committed + spent) / released exceeds `alerts.budget.over_pct`;
 * UNDER from Q3 when it trails the expected pace (completed quarters x 25 %)
 * by more than `alerts.budget.under_gap_pct` points.
 */
const BUDGET_VARIANCE = Object.freeze({
  OVER:  'OVER',
  UNDER: 'UNDER',
});

const BUDGET_VARIANCE_CONFIG = Object.freeze({
  [BUDGET_VARIANCE.OVER]:  { label: 'Over budget',    bg: 'bg-red-50',   text: 'text-red-700',   border: 'border-red-200' },
  [BUDGET_VARIANCE.UNDER]: { label: 'Slow execution', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
});

/**
 * Result groups of the global search (D-20261106-05), in display order.
 */
const SEARCH_GROUPS = Object.freeze({
  SPECIFIC: 'SPECIFIC',
  BROAD:    'BROAD',
  INDICATOR: 'INDICATOR',
  RESULT:   'RESULT',
  UNIT:     'UNIT',
  COUNTRY:  'COUNTRY',
});

const SEARCH_GROUP_LABELS = Object.freeze({
  [SEARCH_GROUPS.SPECIFIC]:  'Specific activities',
  [SEARCH_GROUPS.BROAD]:     'Broad activities',
  [SEARCH_GROUPS.INDICATOR]: 'Indicators',
  [SEARCH_GROUPS.RESULT]:    'Outcomes and impacts',
  [SEARCH_GROUPS.UNIT]:      'Business Units',
  [SEARCH_GROUPS.COUNTRY]:   'Member states',
});

/**
 * How a user left the onboarding tour (users.tour_outcome, D-20261106-03).
 */
const TOUR_OUTCOMES = Object.freeze({
  FINISHED: 'FINISHED',
  SKIPPED:  'SKIPPED',
});

const TOUR_OUTCOME_LABELS = Object.freeze({
  [TOUR_OUTCOMES.FINISHED]: 'Finished',
  [TOUR_OUTCOMES.SKIPPED]:  'Skipped',
});

/**
 * Filters of the adoption page (D-20261106-03): which active users to list.
 */
const ADOPTION_FILTERS = Object.freeze({
  NEVER_SIGNED_IN: 'NEVER_SIGNED_IN',
  NO_TOUR:         'NO_TOUR',
  TOUR_SKIPPED:    'TOUR_SKIPPED',
  NEVER_SUBMITTED: 'NEVER_SUBMITTED',
});

const ADOPTION_FILTER_LABELS = Object.freeze({
  [ADOPTION_FILTERS.NEVER_SIGNED_IN]: 'Never signed in',
  [ADOPTION_FILTERS.NO_TOUR]:         'Tour not taken',
  [ADOPTION_FILTERS.TOUR_SKIPPED]:    'Tour skipped',
  [ADOPTION_FILTERS.NEVER_SUBMITTED]: 'Never submitted',
});

/** Budgeting arrangement of a specific activity (column enum of plan_nodes). */
const BUDGETING_ARRANGEMENTS = Object.freeze({
  EXTRAMURAL: 'Extramural',
  INTRAMURAL: 'Intramural',
});

const BUDGETING_ARRANGEMENT_OPTIONS = Object.freeze(
  Object.values(BUDGETING_ARRANGEMENTS).map((value) => ({ value, label: value }))
);

/** Template item 9: objectives are not prefilled from planning for these. */
const MISSION_TYPES_WITHOUT_PLANNED_OBJECTIVES = Object.freeze([
  MISSION_TYPES.IN_OFFICE, MISSION_TYPES.OTHER,
]);

/**
 * The template's "additional specific information" per mission type. Stored
 * in activity_reports.type_details (JSON); the server keeps only these keys.
 * `kind: 'number'` fields must be non-negative numbers; the rest are text.
 */
const MISSION_TYPE_FIELDS = Object.freeze({
  [MISSION_TYPES.OFFICIAL_ENGAGEMENT]: Object.freeze([
    { key: 'visited_entity', kind: 'line', label: 'Name of the visited entity', hint: 'e.g. a Member State, an institution or a partner' },
    { key: 'visit_purpose', label: 'Purpose of the visit', hint: 'Objective of the visit and the strategic area or continental agenda it contributes to, e.g. Country Engagement Visit' },
    { key: 'key_issues', label: 'Key issues discussed or observed', hint: 'Points discussed, alignment, non-alignment, issues that need management attention' },
    { key: 'outcomes', label: 'Key outputs/outcomes or results of the visit', hint: 'Agreements reached, collaboration areas or partnerships forged' },
    { key: 'follow_up', label: 'Key recommendations and follow-up actions', hint: 'With expected timelines and responsible entities' },
  ]),
  [MISSION_TYPES.EVENT]: Object.freeze([
    { key: 'stakeholders', label: 'Key participating stakeholders', hint: 'By category if many: development partners, Ministries of Health, NPHIs, private sector, health NGOs' },
    { key: 'key_discussions', label: 'Key discussions and deliberation points' },
    { key: 'outcomes', label: 'Key outputs/outcomes or results of the meeting', hint: 'e.g. a validated continental framework, an agreed joint workplan' },
    { key: 'follow_up', label: 'Key follow-up actions', hint: 'With timelines and responsible entities' },
  ]),
  [MISSION_TYPES.TRAINING]: Object.freeze([
    { key: 'trainees_description', label: 'Description of the trainees', hint: 'e.g. community health workers, surveillance officers, laboratory technicians' },
    { key: 'delivery_methodology', label: 'Description of delivery methodology' },
    { key: 'trainees_total', kind: 'number', label: 'Total number of people trained' },
    { key: 'trainees_female', kind: 'number', label: 'Of whom female' },
    { key: 'trainees_male', kind: 'number', label: 'Of whom male' },
    { key: 'trainees_disaggregation', label: 'Other disaggregation', hint: 'By region, Member State, cadre...' },
    { key: 'participant_evaluation', label: "Summary of participants' evaluation and feedback", hint: 'Compare pre- and post-training knowledge gain' },
    { key: 'improvement_areas', label: 'Proposed areas of improvement for the training', hint: 'Including the delivery methodology' },
  ]),
});

/**
 * Single-source-of-truth color + label per STATUS value. Consumers (badges,
 * chips, toasts) read from this map rather than redefining colors inline
 * (master-plan §3 — notification-service duplicated these with wrong keys).
 *
 * Shape: `{ bg, text, border, dot, label }` — same tailwind keys as
 * {@link STATUS_STYLES} plus the label from {@link STATUS_LABELS}.
 */
const STATUS_COLORS = Object.freeze(
  Object.fromEntries(
    Object.values(STATUSES).map((s) => [s, Object.freeze({ ...STATUS_STYLES[s], label: STATUS_LABELS[s] })])
  )
);

/**
 * Canonical notification template identifiers. Every notification-service
 * template registered under this id so callers can request it by symbol
 * rather than by string (D-20260415-XX, CSP-04).
 */
const NOTIFICATION_TYPES = Object.freeze({
  ACCOUNT_INVITATION:        'ACCOUNT_INVITATION',
  APPROVAL_REQUESTED:        'APPROVAL_REQUESTED',
  APPROVAL_DECIDED:          'APPROVAL_DECIDED',
  BUDGET_APPROVED:           'BUDGET_APPROVED',
  REPORT_DUE_REMINDER:       'REPORT_DUE_REMINDER',
  INDICATOR_ACTUAL_SUBMITTED: 'INDICATOR_ACTUAL_SUBMITTED',
  // Added 2026-04-15 (D-05): match live templates shipped by notification-service.
  ACTIVITY_UPDATED:          'ACTIVITY_UPDATED',
  REPORT_SUBMITTED:          'REPORT_SUBMITTED',
  REPORT_REVIEWED:           'REPORT_REVIEWED',
  OWNERSHIP_DISPUTE:         'OWNERSHIP_DISPUTE',
});

/**
 * Legacy kebab-case template keys → canonical {@link NOTIFICATION_TYPES}.
 *
 * `notification-service` callers (api-server's `notifyService.js` in
 * particular) historically used kebab-case strings. The outbox writer
 * accepts either shape and normalizes to the canonical value via this map.
 */
const NOTIFICATION_TYPE_ALIASES = Object.freeze({
  'activity-updated':   'ACTIVITY_UPDATED',
  'budget-approved':    'BUDGET_APPROVED',
  'report-submitted':   'REPORT_SUBMITTED',
  'report-reviewed':    'REPORT_REVIEWED',
  'ownership-dispute':  'OWNERSHIP_DISPUTE',
});

/**
 * Sync-service run statuses. Used by the manual trigger endpoint and the
 * nightly cron logger (master-plan §4.5).
 */
const SYNC_STATUSES = Object.freeze({
  PENDING:   'pending',
  RUNNING:   'running',
  SUCCEEDED: 'succeeded',
  FAILED:    'failed',
  SKIPPED:   'skipped',
});

/**
 * Entities that move through the generic approvals engine
 * (`approval_instances` + `approval_steps`).
 */
const PLAN_NODE_TYPES = Object.freeze({
  IMPACT: 'IMPACT',
  IMPACT_INDICATOR: 'IMPACT_INDICATOR',
  OUTCOME_AREA: 'OUTCOME_AREA',
  OUTCOME_INDICATOR: 'OUTCOME_INDICATOR',
  BROAD_ACTIVITY: 'BROAD_ACTIVITY',
  SPECIFIC_ACTIVITY: 'SPECIFIC_ACTIVITY',
});

const LEVEL_TYPES = Object.freeze({
  DIRECTORATE: 'directorate',
  DIVISION: 'division',
  UNIT: 'unit',
});

const APPROVAL_ENTITIES = Object.freeze({
  INDICATOR_ACTUAL:          'INDICATOR_ACTUAL',
  DIVISION_ACTIVITY_REPORT:  'DIVISION_ACTIVITY_REPORT',
  ACTIVITY_REPORT:           'ACTIVITY_REPORT',
  PLAN_NODE:                 'PLAN_NODE',
  INDICATOR_DIVISION_REPORT: 'INDICATOR_DIVISION_REPORT',
});

/**
 * Decision values written to `approval_steps.decision` by the approval engine.
 *
 * This is the SINGLE source of truth for step-decision values — distinct from
 * STATUSES (an entity's workflow status) because an approval *step* has its own
 * lifecycle: it starts PENDING (or BLOCKED_NO_APPROVER when no approver can be
 * resolved), then becomes APPROVED / REJECTED, or CANCELLED when the parent
 * instance is superseded. APPROVED/REJECTED/CANCELLED intentionally reuse the
 * STATUSES values so a step decision can be compared against an entity status
 * without translation. Cleaning Phase 2.2 — replaces the per-engine inline maps.
 */
// eslint-disable-next-line cdc-rbm/no-inline-status-map -- this IS the canonical map
const APPROVAL_STEP_DECISIONS = Object.freeze({
  PENDING:             'PENDING',
  APPROVED:            STATUSES.APPROVED,
  REJECTED:            STATUSES.REJECTED,
  BLOCKED_NO_APPROVER: 'BLOCKED_NO_APPROVER',
  CANCELLED:           STATUSES.CANCELLED,
});

/**
 * Reference-list types served by GET /api/reference/values?type=…
 * These back the funding-source / grant-name comboboxes (curated seed ∪
 * values already used). Free text is always allowed — the list is suggestions.
 */
const REFERENCE_TYPES = Object.freeze({
  FUNDING_SOURCE: 'FUNDING_SOURCE',
  GRANT:          'GRANT',
});

/**
 * Fields a SPECIFIC_ACTIVITY must carry before it can be created or submitted
 * (backlog H-5). The create form (`SpecificActivityFormPage` canSave) and the
 * API (POST/PATCH `/plan-nodes/specific-activity`) both read this single list
 * so frontend and backend can never drift on what "complete" means.
 */
const REQUIRED_SPECIFIC_ACTIVITY_FIELDS = Object.freeze([
  'activity_type',
  'implementation_at_rcc',
  'budgeting_arrangement',
  'primary_funding_source',
  // 'grant_name' intentionally NOT required (H-5, D-20260621): the canonical
  // list of grants does not exist yet, so we cannot force a value. Re-add once
  // the grant reference list is available.
  'budget_main',
]);

// Per-field rules that go beyond "non-blank". A field not listed here just
// needs to be non-blank (handled in isActivityFieldProvided).
const ACTIVITY_FIELD_RULES = Object.freeze({
  // A cost: a finite number, 0 allowed for an activity with no cost (D-20261105-04).
  budget_main: (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0; },
  // A Yes/No answer (0 or 1); 0 ("No") is a valid answer.
  implementation_at_rcc: (v) => v === 0 || v === 1 || v === '0' || v === '1',
});

/**
 * Is one required activity field satisfied? Centralises the per-field rule so
 * the create form and the API agree value-for-value.
 *
 * @param {string} field - one of {@link REQUIRED_SPECIFIC_ACTIVITY_FIELDS}
 * @param {*} value - the raw form / request-body value
 * @returns {boolean}
 * @example isActivityFieldProvided('budget_main', '') // → false
 */
function isActivityFieldProvided(field, value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  const rule = ACTIVITY_FIELD_RULES[field];
  return rule ? rule(value) : true;
}

module.exports = {
  ENTITY_TYPES,
  ENTITY_TABLES,
  REFERENCE_TYPES,
  REQUIRED_SPECIFIC_ACTIVITY_FIELDS,
  isActivityFieldProvided,
  OWNER_FIELDS,
  STATUSES,
  STATUS_LABELS,
  STATUS_STYLES,
  VALID_TRANSITIONS,
  DECISIONS,
  TIERS,
  TIER_CONFIG,
  TIER_BY_NUMBER,
  NODE_TYPES,
  ITEM_TYPES,
  RESULT_LEVEL,
  ORG_LEVEL_TYPES,
  RBAC_SCOPES,
  QUARTERS,
  INDICATOR_TYPES,
  REPORTING_FREQUENCIES,
  RESULT_LEVELS,
  BIG_TICKET_PROGRESS,
  BIG_TICKET_PROGRESS_CONFIG,
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE_OPTIONS,
  ACTIVITY_RISK_LEVELS,
  ACTIVITY_RISK_CONFIG,
  ACTIVITY_RISK_OPTIONS,
  BUDGET_VARIANCE,
  BUDGET_VARIANCE_CONFIG,
  SEARCH_GROUPS,
  SEARCH_GROUP_LABELS,
  TOUR_OUTCOMES,
  TOUR_OUTCOME_LABELS,
  ADOPTION_FILTERS,
  ADOPTION_FILTER_LABELS,
  BUDGETING_ARRANGEMENTS,
  BUDGETING_ARRANGEMENT_OPTIONS,
  MISSION_TYPES,
  MISSION_TYPE_LABELS,
  MISSION_TYPE_OPTIONS,
  MISSION_TYPES_WITHOUT_PLANNED_OBJECTIVES,
  MISSION_TYPE_FIELDS,
  STATUS_COLORS,
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_ALIASES,
  SYNC_STATUSES,
  PLAN_NODE_TYPES,
  LEVEL_TYPES,
  APPROVAL_ENTITIES,
  APPROVAL_STEP_DECISIONS,
  getStatusConfig,
  statusToProgress,
  getTierByNumber,
  getTierByCode,
};
