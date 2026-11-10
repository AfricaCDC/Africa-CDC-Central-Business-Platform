/**
 * Activity reports write/read service — the SINGLE write path
 * (D-20260818-01). POST always creates; PUT updates by primary key.
 * The old (plan_node_id, quarter, fiscal_year) upserts are gone: a
 * report is an independent submission with its own approval lifecycle.
 */

const db = require('../../config/db');
const { STATUSES, MISSION_TYPES, MISSION_TYPE_FIELDS } = require('@rbm/lib/enums');
const { NotFoundError, ForbiddenError, ValidationError } = require('@rbm/lib/errors');

/**
 * Columns copied straight through from the request body, defaulting to
 * NULL when absent. Kept as a table so the per-field `|| null` fallbacks
 * stay declarative instead of inflating cyclomatic complexity.
 */
const PASSTHROUGH_FIELDS = Object.freeze([
  'quarter', 'start_date', 'end_date', 'location', 'lead_organiser',
  'other_staff', 'beneficiary_type', 'member_states', 'methodology',
  'indicator_achievement', 'narrative', 'achievements',
  'means_of_verification', 'findings_recommendations', 'challenges',
  'lessons_learned', 'next_steps', 'budget_code',
  'venue', 'objectives', 'strategic_needs',
]);

/**
 * Map request data onto real activity_reports columns (no status here —
 * status transitions belong to /submit and the review endpoints).
 *
 * @param {object} data — request body
 * @param {number} userId — author
 * @returns {object} insert/update payload
 * @example buildReportRow({ plan_node_id: 5, quarter: 'Q3' }, 7)
 */
/**
 * Duration in days of the activity, both bounds included (the template
 * counts a one-day workshop as 1 day), or the caller-supplied value when
 * either bound is missing. An end date before the start date yields null.
 *
 * @param {object} data — request body carrying start_date/end_date
 * @returns {number|string|null|undefined} raw duration, before coercion
 * @example resolveDurationDays({ start_date: '2026-03-01', end_date: '2026-03-05' }) // 5
 */
function resolveDurationDays(data) {
  if (!data.start_date || !data.end_date) return data.duration_days;
  const days = Math.round((new Date(data.end_date) - new Date(data.start_date)) / (1000 * 60 * 60 * 24));
  return days >= 0 ? days + 1 : null;
}

/**
 * Validate the template's mission type (item 4). Empty means "not chosen".
 *
 * @param {string|null|undefined} value
 * @returns {string|null}
 * @throws {ValidationError} on a value outside MISSION_TYPES
 * @example resolveMissionType('EVENT') // 'EVENT'
 */
function resolveMissionType(value) {
  if (!value) return null;
  if (!Object.values(MISSION_TYPES).includes(value)) {
    throw new ValidationError('Unknown activity and mission type');
  }
  return value;
}

/**
 * Keep only the template fields of the chosen mission type and serialise
 * them for activity_reports.type_details. Unknown keys are dropped, so a
 * client cannot park arbitrary data in the report.
 *
 * @param {string|null} missionType — already validated
 * @param {object|undefined} details — raw request value
 * @returns {string|null} JSON text, or null when nothing applies
 * @throws {ValidationError} on a negative or non-numeric count
 * @example serialiseTypeDetails('TRAINING', { trainees_total: '12', x: 1 }) // '{"trainees_total":12}'
 */
function serialiseTypeDetails(missionType, details) {
  const fields = MISSION_TYPE_FIELDS[missionType];
  if (!fields || !details || typeof details !== 'object') return null;
  const out = {};
  for (const field of fields) {
    const value = cleanDetail(field, details[field.key]);
    if (value !== undefined) out[field.key] = value;
  }
  assertTraineeSplit(out);
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

/** Women and men trained cannot outnumber the people trained. */
function assertTraineeSplit({ trainees_total: total, trainees_female: female = 0, trainees_male: male = 0 }) {
  if (total !== undefined && female + male > total) {
    throw new ValidationError('Women and men trained add up to more than the total trained');
  }
}

/** One type-detail value: trimmed text, a count, or undefined when blank. */
function cleanDetail({ kind, label }, raw) {
  if (raw == null || String(raw).trim() === '') return undefined;
  if (kind !== 'number') return String(raw).trim();
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new ValidationError(`${label} must be a whole number of 0 or more`);
  return n;
}

/** "Not started yet" (D-20261013-08): the expected start only counts then. */
function notStartedColumns(data) {
  if (!data.not_started) return { not_started: false, expected_start_quarter: null, expected_start_year: null };
  return {
    not_started: true,
    expected_start_quarter: data.expected_start_quarter || null,
    expected_start_year: data.expected_start_year ? String(data.expected_start_year) : null,
  };
}

/**
 * Numeric columns and how each coerces. `fallback` applies whenever the
 * parsed value is falsy/absent (actual_spend defaults to 0 per the
 * "numeric fields default to 0" rule; the rest stay nullable).
 */
const NUMERIC_FIELDS = Object.freeze([
  { column: 'duration_days', parse: parseInt, fallback: null },
  { column: 'participants_count', parse: parseInt, fallback: null },
  { column: 'actual_spend', parse: parseFloat, fallback: 0 },
  { column: 'total_budget', parse: parseFloat, fallback: null },
]);

/** Counts and amounts are never negative (D-20261013-11). */
function assertNoNegative(data) {
  for (const [column, label] of [['participants_count', 'Number of participants'], ['actual_spend', 'Total cost used']]) {
    const n = Number(data[column]);
    if (data[column] !== '' && data[column] != null && Number.isFinite(n) && n < 0) {
      throw new ValidationError(`${label} cannot be negative`);
    }
  }
}

function buildReportRow(data, userId) {
  assertNoNegative(data);
  const values = { ...data, duration_days: resolveDurationDays(data) };
  const row = {
    plan_node_id: data.plan_node_id || data.workplan_item_id,
    user_id: userId,
    fiscal_year: data.fiscal_year || String(new Date().getFullYear()),
    contribution_value: data.contribution_value != null ? parseFloat(data.contribution_value) : null,
    updated_at: db.fn.now(),
  };
  for (const { column, parse, fallback } of NUMERIC_FIELDS) {
    row[column] = parse(values[column], 10) || fallback;
  }
  for (const field of PASSTHROUGH_FIELDS) row[field] = data[field] || null;
  row.mission_type = resolveMissionType(data.mission_type);
  row.type_details = serialiseTypeDetails(row.mission_type, data.type_details);
  return { ...row, ...notStartedColumns(data) };
}

/**
 * Item 4 (activity and mission type) is the type chosen when the activity was
 * created, never typed in the report (D-20261105-01). A legacy activity
 * without a type keeps what its report already holds.
 *
 * @param {object} data - the report payload
 * @param {number|null} planNodeId
 * @returns {Promise<object>} the payload with `mission_type` from the activity
 * @throws {Error} on DB failure
 * @example await withActivityType({ narrative: 'x' }, 5) // { narrative: 'x', mission_type: 'EVENT' }
 */
async function withActivityType(data, planNodeId) {
  const node = planNodeId ? await db('plan_nodes').where('id', planNodeId).first('activity_type') : null;
  return node && node.activity_type ? { ...data, mission_type: node.activity_type } : data;
}

/**
 * Insert a new report (always — never an upsert).
 *
 * @param {{ data: object, userId: number }} p
 * @returns {Promise<object>} the inserted row
 * @throws {ValidationError} when plan_node_id is missing
 * @example await createReport({ data: { plan_node_id: 5, quarter: 'Q3' }, userId: 7 })
 */
async function createReport({ data, userId }) {
  const row = buildReportRow(await withActivityType(data, data.plan_node_id || data.workplan_item_id), userId);
  if (!row.plan_node_id) throw new ValidationError('plan_node_id is required');
  row.status = STATUSES.DRAFT;
  const [id] = await db('activity_reports').insert(row);
  return db('activity_reports').where('id', id).first();
}

/**
 * Update a report by primary key. Author-only (admins bypass), and only
 * while DRAFT or REJECTED (admins bypass). Never touches status.
 *
 * @param {{ id: number, data: object, userId: number, isAdmin?: boolean }} p
 * @returns {Promise<object>} the updated row
 * @throws {NotFoundError|ForbiddenError|ValidationError}
 * @example await updateReport({ id: 11, data: { narrative: 'x' }, userId: 7 })
 */
/**
 * Who may submit a report: its author, or an administrator; and only a draft
 * or a rejected report, so an approved one is never sent back to review
 * (D-20261108-02).
 *
 * @param {{ user_id: number, status: string }} report
 * @param {number} userId
 * @param {boolean} [isAdmin]
 * @returns {void}
 * @throws {ForbiddenError} 403 when the caller is neither the author nor an admin
 * @throws {ValidationError} 400 when the report is not a draft or rejected
 * @example assertCanSubmit(report, req.user.id, isAdmin);
 */
function assertCanSubmit(report, userId, isAdmin = false) {
  if (!isAdmin && Number(report.user_id) !== Number(userId)) {
    throw new ForbiddenError('Only the author can submit this report');
  }
  if (![STATUSES.DRAFT, STATUSES.REJECTED].includes(report.status)) {
    throw new ValidationError('Only draft or rejected reports can be submitted');
  }
}

async function updateReport({ id, data, userId, isAdmin = false }) {
  const existing = await db('activity_reports').where('id', id).first();
  if (!existing) throw new NotFoundError('Activity report not found');
  if (!isAdmin && existing.user_id !== userId) {
    throw new ForbiddenError('Only the author can edit this report');
  }
  const editable = [STATUSES.DRAFT, STATUSES.REJECTED];
  if (!isAdmin && !editable.includes(existing.status)) {
    throw new ValidationError('Only draft or rejected reports can be edited');
  }
  const row = buildReportRow(await withActivityType(data, existing.plan_node_id), existing.user_id);
  delete row.plan_node_id; // the report never moves to another activity
  delete row.user_id;      // authorship never changes on edit
  await db('activity_reports').where('id', id).update(row);
  return db('activity_reports').where('id', id).first();
}

/**
 * Delete a draft activity report. Only the author, or an administrator, and
 * only while it is a DRAFT: a submitted report is part of the approval trail.
 * Its evidence rows go with it; the files stay in storage.
 *
 * @param {{ id: number, userId: number, isAdmin?: boolean }} p
 * @returns {Promise<{ id: number, plan_node_id: number, user_id: number, quarter: string, fiscal_year: string, evidence: number }>}
 * @throws {NotFoundError} 404 when the report does not exist
 * @throws {ForbiddenError} 403 when the caller is neither the author nor an admin
 * @throws {ValidationError} 400 when the report is not a draft
 * @example await deleteDraft({ id: 12, userId: 7 });
 */
async function deleteDraft({ id, userId, isAdmin = false }) {
  const existing = await db('activity_reports').where('id', id).first();
  if (!existing) throw new NotFoundError('Activity report not found');
  if (!isAdmin && existing.user_id !== userId) {
    throw new ForbiddenError('Only the author can delete this draft');
  }
  if (existing.status !== STATUSES.DRAFT) {
    throw new ValidationError('Only a draft can be deleted');
  }
  return db.transaction(async (trx) => {
    const evidence = await trx('evidence_files').where({ parent_type: 'activity_report', parent_id: id }).del();
    await trx('activity_reports').where('id', id).del();
    return {
      id, plan_node_id: existing.plan_node_id, user_id: existing.user_id,
      quarter: existing.quarter, fiscal_year: existing.fiscal_year, evidence,
    };
  });
}

/**
 * List reports for one activity, newest first.
 *
 * @param {{ planNodeId: number, quarter?: string, fiscalYear?: string,
 *   mine?: boolean, userId?: number }} p
 * @returns {Promise<object[]>}
 * @example await listByActivity({ planNodeId: 5, quarter: 'Q3', fiscalYear: '2026' })
 */
async function listByActivity({ planNodeId, quarter, fiscalYear, mine = false, userId = null }) {
  const q = db('activity_reports').where({ plan_node_id: planNodeId });
  if (quarter) q.where({ quarter });
  if (fiscalYear) q.where({ fiscal_year: fiscalYear });
  if (mine && userId) q.where({ user_id: userId });
  return q.orderBy('created_at', 'desc');
}

/**
 * Resolve a reporting_periods id into { quarter, fiscal_year } filters.
 *
 * @param {number|string} periodId
 * @returns {Promise<{quarter: string, fiscal_year: string}|null>}
 * @example await resolvePeriodFilters(3) // { quarter: 'Q2', fiscal_year: '2026' }
 */
async function resolvePeriodFilters(periodId) {
  const period = await db('reporting_periods').where('id', parseInt(periodId, 10)).first();
  if (!period) return null;
  return { quarter: period.quarter, fiscal_year: String(period.fiscal_year) };
}

/**
 * Attach the template's sign-off names (prepared by, approved by) to a report.
 * One query for both people; a deleted user leaves the name null.
 *
 * @param {object} report — an activity_reports row
 * @returns {Promise<object>} the row plus prepared_by_name / approved_by_name
 * @example await withSignOffNames({ id: 1, user_id: 7, approved_by: 9 })
 */
async function withSignOffNames(report) {
  const ids = [report.user_id, report.approved_by].filter(Boolean);
  const people = ids.length ? await db('users').whereIn('id', ids).select('id', 'full_name', 'email') : [];
  const nameOf = (id) => {
    const p = people.find((u) => u.id === id);
    return p ? (p.full_name || p.email) : null;
  };
  return { ...report, prepared_by_name: nameOf(report.user_id), approved_by_name: nameOf(report.approved_by) };
}

module.exports = {
  buildReportRow, createReport, updateReport, deleteDraft, listByActivity, resolvePeriodFilters, withSignOffNames,
  assertCanSubmit,
};
