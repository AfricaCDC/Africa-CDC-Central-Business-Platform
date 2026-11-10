// ── Activity Reporting Template: form model ──
//
// Pure helpers behind ActivityReportFormPage. The page follows the official
// Africa CDC Activity Reporting Template (D-20261001-01); the numbers in the
// field definitions below are the template's item numbers, so a reader can
// hold the form and the template side by side.

import { STATUSES, MISSION_TYPES_WITHOUT_PLANNED_OBJECTIVES } from '@rbm/lib/enums';

/**
 * Days covered by the activity, both bounds included: the template counts a
 * one-day workshop as 1 day. Mirrors resolveDurationDays on the server.
 * @param {string} start — ISO date
 * @param {string} end — ISO date
 * @returns {number|null} null when a bound is missing or the range is inverted
 * @example calcDuration('2026-03-01', '2026-03-01') // 1
 */
export function calcDuration(start, end) {
  if (!start || !end) return null;
  const days = Math.round((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24));
  return Number.isNaN(days) || days < 0 ? null : days + 1;
}

// Mirrors the server-side gate in activityReportsRoutes.js — same fields,
// same labels, so the disabled-button hint and the 400 message agree.
const SUBMIT_REQUIRED_FIELDS = [
  ['start_date', 'start date'],
  ['end_date', 'end date'],
  ['location', 'location'],
  ['lead_organiser', 'lead organiser'],
  ['narrative', 'narrative'],
  // actual_spend: 0 is a valid answer, but the input must not be left empty.
  ['actual_spend', 'actual spend'],
];

/**
 * List what still blocks submission, in the same wording as the API.
 * @param {object} form — the form state
 * @param {number} evidenceCount — verification files attached to the report
 * @returns {string[]} labels, empty when the report may be submitted
 * @example listMissingForSubmit({ narrative: '' }, 0) // ['start date', …, 'verification file']
 */
export function listMissingForSubmit(form, evidenceCount) {
  if (form.not_started) return form.expected_start ? [] : ['expected start quarter'];
  const missing = SUBMIT_REQUIRED_FIELDS
    .filter(([key]) => String(form[key] ?? '').trim() === '')
    .map(([, label]) => label);
  if (!evidenceCount) missing.push('verification file');
  return missing;
}

const quarterIndex = (q, year) => Number(year) * 4 + Number(String(q).slice(1));

/**
 * Quarters an activity that has not started may start in: every quarter after
 * the reported one, up to the end of the next fiscal year (D-20261013-08).
 * @param {string} quarter — reported quarter, e.g. 'Q3'
 * @param {string} fiscalYear — e.g. '2026'
 * @returns {Array<{ value: string, label: string }>} value 'Q4-2026'
 * @example upcomingQuarters('Q3', '2026')[0] // { value: 'Q4-2026', label: 'Q4 2026' }
 */
export function upcomingQuarters(quarter, fiscalYear) {
  const from = quarterIndex(quarter, fiscalYear);
  const year = Number(fiscalYear);
  const out = [];
  for (const y of [year, year + 1]) {
    for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
      if (quarterIndex(q, y) > from) out.push({ value: `${q}-${y}`, label: `${q} ${y}` });
    }
  }
  return out;
}

/** Template item 10: activity summary, after the participants (10a). */
export const SUMMARY_FIELDS = [
  { key: 'strategic_needs', n: '10b', label: 'Key strategic needs addressed', placeholder: 'If applicable, linked to the Africa CDC strategic areas (AHSS)' },
  { key: 'narrative', n: '10c', label: 'Narrative of key achievements *', placeholder: 'Key results achieved and impact on beneficiaries, as per the result in the RBM framework', rows: 4, highlight: true },
  { key: 'challenges', n: '10d', label: 'Key challenges', placeholder: 'Challenges faced and how they were handled, if applicable' },
  { key: 'findings_recommendations', n: '10d', label: 'Recommendations for the management', placeholder: 'Actionable recommendations, if applicable' },
  { key: 'means_of_verification', n: '10e', label: 'Means of verification', placeholder: 'Attendance list, photos, report, certificate...', rows: 2 },
];

/** Kept from the earlier form: not in the template, but reports already hold them. */
export const OPTIONAL_FIELDS = [
  { key: 'methodology', n: '+', label: 'Summary of key methodology', placeholder: 'Approach, tools and participant engagement' },
  { key: 'indicator_achievement', n: '+', label: 'Achievement in target for the indicator', placeholder: 'Target for this period, actual value achieved, % reached' },
  { key: 'lessons_learned', n: '+', label: 'Lessons learned', placeholder: 'What worked well, what to improve' },
  { key: 'next_steps', n: '+', label: 'Next steps', placeholder: 'Follow-up actions with timeline and responsible person' },
];

const TEXT_KEYS = [
  'lead_organiser', 'other_staff', 'venue', 'objectives',
  ...SUMMARY_FIELDS.map((f) => f.key), ...OPTIONAL_FIELDS.map((f) => f.key),
];

export const EMPTY_FORM = Object.freeze({
  ...Object.fromEntries(TEXT_KEYS.map((k) => [k, ''])),
  start_date: '',
  end_date: '',
  location: '',
  mission_type: '',
  participants_count: '',
  member_states: [],
  type_details: {},
  actual_spend: '',
  not_started: false,
  expected_start: '', // 'Q4-2026'
  status: STATUSES.DRAFT,
});

const day = (v) => (v ? String(v).slice(0, 10) : '');

/** First value that is set; 0 counts as set, '' does not. */
const firstOf = (...values) => values.find((v) => v !== undefined && v !== null && v !== '') ?? '';

function parseJson(raw, fallback) {
  if (raw && typeof raw === 'object') return raw;
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

/**
 * Objectives planned for the activity (template item 9). The template wants
 * them from the CBP approval; the closest record the platform holds is the
 * description entered when the activity was planned. In-office and Others
 * are not prefilled, as the template says.
 */
function plannedObjectives(activity, missionType) {
  if (MISSION_TYPES_WITHOUT_PLANNED_OBJECTIVES.includes(missionType)) return '';
  return activity.description || '';
}

/**
 * Build the form state from the loaded activity and, in edit mode, the report.
 * The activity supplies defaults; the report always wins where it has a value.
 * @param {object|null} activity — plan node detail
 * @param {object|null} report — activity_reports row, null in create mode
 * @returns {object} form state
 * Item 4 (activity and mission type) is the activity's type, never typed in
 * the report (D-20261105-01); a legacy activity without one shows the report's.
 * @example formFromData({ activity_type: 'EVENT' }, { mission_type: 'TRAINING' }).mission_type // 'EVENT'
 */
export function formFromData(activity, report) {
  const r = report || {};
  const a = activity || {};
  const missionType = firstOf(a.activity_type, r.mission_type);
  return {
    ...EMPTY_FORM,
    ...Object.fromEntries(TEXT_KEYS.map((k) => [k, firstOf(r[k])])),
    start_date: firstOf(day(r.start_date), day(a.start_date)),
    end_date: firstOf(day(r.end_date), day(a.end_date)),
    location: firstOf(r.location, a.location),
    mission_type: missionType,
    objectives: firstOf(r.objectives, plannedObjectives(a, missionType)),
    participants_count: firstOf(r.participants_count),
    member_states: parseJson(r.member_states, []),
    type_details: parseJson(r.type_details, {}),
    actual_spend: firstOf(r.actual_spend),
    not_started: Boolean(r.not_started),
    expected_start: r.expected_start_quarter && r.expected_start_year ? `${r.expected_start_quarter}-${r.expected_start_year}` : '',
    status: firstOf(r.status, STATUSES.DRAFT),
  };
}

/**
 * Budget codes of the activity (template item 11): its own, or those of the
 * broad activity it belongs to.
 * @param {object|null} activity
 * @returns {string[]}
 * @example budgetCodesOf({ parent_broad: { budget_codes: [{ fund_code: 'MS-1' }] } }) // ['MS-1']
 */
export function budgetCodesOf(activity) {
  const own = activity?.budget_codes || [];
  const rows = own.length ? own : (activity?.parent_broad?.budget_codes || []);
  return rows.map((b) => b.fund_code).filter(Boolean);
}

const orNull = (v) => (v === '' || v == null ? null : v);

/**
 * Request body for POST/PUT /reporting/activity-reports.
 * @param {object} form
 * @param {{ activityId: string, quarter: string, fiscalYear: string, activity: object }} ctx
 * @returns {object}
 * @example buildPayload(form, { activityId: '5', quarter: 'Q3', fiscalYear: '2026', activity })
 */
export function buildPayload(form, { activityId, quarter, fiscalYear, activity }) {
  return {
    ...Object.fromEntries(TEXT_KEYS.map((k) => [k, orNull(form[k])])),
    plan_node_id: parseInt(activityId, 10),
    quarter,
    fiscal_year: fiscalYear,
    mission_type: orNull(form.mission_type),
    start_date: orNull(form.start_date),
    end_date: orNull(form.end_date),
    duration_days: calcDuration(form.start_date, form.end_date),
    location: orNull(form.location),
    participants_count: form.participants_count === '' ? null : parseInt(form.participants_count, 10),
    member_states: JSON.stringify(form.member_states),
    type_details: form.type_details,
    total_budget: activity?.budget_main ?? 0,
    // The column holds one code; the template shows one. The first is the
    // primary funding line of the broad activity.
    budget_code: budgetCodesOf(activity)[0] || null,
    actual_spend: form.actual_spend === '' ? null : parseFloat(form.actual_spend),
    not_started: form.not_started,
    expected_start_quarter: form.not_started ? orNull(form.expected_start.split('-')[0]) : null,
    expected_start_year: form.not_started ? orNull(form.expected_start.split('-')[1]) : null,
  };
}
