/* eslint-disable max-lines, no-restricted-syntax --
 * P-31 false positives: 'SPECIFIC_ACTIVITY' / 'BROAD_ACTIVITY' /
 * 'OUTCOME_INDICATOR' are plan_nodes.node_type column-enum values — NOT
 * ENTITY_TYPES from @rbm/lib/enums. Allowlisted in
 * scripts/forbidden.allowlist.json.
 * Pragma is a ceiling — do NOT grow the file or add new violations.
 */

// ── Plan-Nodes Shared Helpers ──
//
// Extracted from `services/api-server/src/routes/planNodeRoutes.js` as the
// first commit of the task #29 split (commit 1/N). Contains constants,
// enrichment functions, division-centric ownership lookups, field
// whitelisting, auto-code generation, and the canonical error envelope
// helper — consumed by all plan-nodes sub-routers.

const knex = require('../../config/db');
const {
  STATUSES,
  ACTIVITY_TYPES,
  ACTIVITY_RISK_LEVELS,
  REQUIRED_SPECIFIC_ACTIVITY_FIELDS,
  isActivityFieldProvided,
} = require('@rbm/lib/enums');
const { buildError } = require('@rbm/lib/errors');
const { createLogger } = require('@rbm/lib/logger');
const rbacService = require('../../services/rbacService');
const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');
const {
  getUserDivisionCodes,
  DIVISION_ROLE_FOCAL,
} = require('@rbm/lib/user-divisions');

const log = createLogger('api-server').child({ module: 'planNodeRoutes' });

// Fields whose value must come from a list of @rbm/lib/enums (the columns are
// VARCHAR, D-20261105-01 / D-20261105-05).
const CHOICE_FIELDS = Object.freeze({
  activity_type: new Set(Object.values(ACTIVITY_TYPES)),
  risk_level: new Set(Object.values(ACTIVITY_RISK_LEVELS)),
});

/**
 * Check the list-valued fields of a specific activity payload; a blank value
 * becomes null (cleared).
 *
 * @param {object} fields - output of pickEditableFields (mutated: blanks to null)
 * @returns {string|null} the error message of the first invalid field, else null
 * @example invalidChoice({ risk_level: 'EXTREME' }) // 'risk_level must be one of HIGH, MEDIUM, LOW'
 */
function invalidChoice(fields) {
  for (const [key, allowed] of Object.entries(CHOICE_FIELDS)) {
    if (fields[key] === undefined) continue;
    if (!fields[key]) { fields[key] = null; continue; }
    if (!allowed.has(fields[key])) return `${key} must be one of ${[...allowed].join(', ')}`;
  }
  return null;
}

const PUBLIC_STATUSES = [
  STATUSES.APPROVED,
  STATUSES.IN_EXECUTION,
  STATUSES.CLOSED,
  STATUSES.ARCHIVED,
];

const EDITABLE_FIELDS = [
  'title',
  'parent_id',
  'responsible_division_code',
  'linked_indicator_id',
  'indicator_code',
  'activity_type',
  'risk_level',
  'implementation_at_rcc',
  // Secondary responsible divisions: JSON array of codes (D-20261026-02).
  'secondary_division_codes',
  'description',
  'budgeting_arrangement',
  'primary_funding_source',
  'other_funding_source',
  'grant_name',
  'location',
  'is_operational',
  'start_date',
  'end_date',
  'budget_main',
  'budget_pass_through',
  'budget_tech_assistance',
  'budget_special_projects',
  'budget_total_2026',
  'budget_2027',
  'budget_2028',
  'q1_budget',
  'q2_budget',
  'q3_budget',
  'q4_budget',
  'fiscal_year',
  'sort_order',
  // Divisions contributing to a SPECIFIC_ACTIVITY (stored as a JSON array of
  // codes). Whitelisted so PATCH /plan-nodes/specific-activity/:id can manage
  // the contributors that gate contributor activity-reporting (D-20260708-01).
  'contributing_divisions',
  // Per-activity focal person (FK users.id) — validated against the main
  // division's STAFF in specificActivities.js before persisting.
  'focal_user_id',
];

// ── Enrichment ──────────────────────────────────────────────

const NUMERIC_FIELDS = ['budget_main','budget_pass_through','budget_tech_assistance','budget_special_projects','budget_total_2026','budget_2027','budget_2028','baseline_numeric','target_y1_numeric','target_y2_numeric','target_y3_numeric','target_y4_numeric','target_y5_numeric'];

async function attachUom(node) {
  if (!node.unit_of_measure_id) return;
  const uom = await knex('units_of_measure').where('id', node.unit_of_measure_id).first();
  if (uom) node.uom = { code: uom.code, label: uom.label, display_format: uom.display_format, calc_type: uom.calc_type };
}

async function attachDivision(node) {
  if (!node.responsible_division_code) return;
  const div = await knex('division_codes').where('code', node.responsible_division_code).first();
  if (div) node.division = { code: div.code, name: div.division_name, directorate: div.directorate };
}

// Per-activity focal person — resolved to {id, name} so detail pages and
// lists can display the focal without a second round-trip.
async function attachFocalUser(node) {
  if (!node.focal_user_id) return;
  const u = await knex('users').where('id', node.focal_user_id)
    .first('id', 'first_name', 'last_name', 'full_name');
  if (u) {
    const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.full_name || '';
    node.focal_user = { id: u.id, name };
  }
}

// AHSS pillar (D-20260714-02) — resolved to {id, name} so the API exposes
// the pillar without a second round-trip.
async function attachPillar(node) {
  if (!node.pillar_id) return;
  const p = await knex('pillars').where('id', node.pillar_id).first();
  if (p) node.pillar = { id: p.id, name: p.name };
}

async function attachActivePeriods(node) {
  if (node.node_type !== 'OUTCOME_INDICATOR') return;
  const periods = await knex('plan_node_active_periods')
    .where('plan_node_id', node.id)
    .select('fiscal_year_num as fy', 'quarter as q')
    .orderBy(['fiscal_year_num', 'quarter']);
  node.active_periods = periods.map((p) => ({ fy: Number(p.fy), q: Number(p.q) }));
}

// Outcome ↔ Strategic Plan link (P1, P2, EA, EB, …) — surfaced as a
// {sp_code, sp_type, short_name} chip on the OUTCOME_AREA row so the
// frontend can show the badge without an extra round-trip.
async function attachStrategicPlan(node) {
  if (node.node_type !== 'OUTCOME_AREA' || !node.strategic_plan_id) return;
  const sp = await knex('strategic_plan').where('id', node.strategic_plan_id).first('id', 'sp_code', 'sp_type', 'short_name');
  if (sp) node.strategic_plan = { id: sp.id, sp_code: sp.sp_code, sp_type: sp.sp_type, short_name: sp.short_name };
}

function coerceNumerics(node) {
  for (const k of NUMERIC_FIELDS) {
    if (node[k] !== null && node[k] !== undefined) node[k] = parseFloat(node[k]);
  }
}

async function enrichNode(node) {
  if (!node) return node;
  await attachUom(node);
  await attachDivision(node);
  await attachPillar(node);
  await attachFocalUser(node);
  coerceNumerics(node);
  await attachActivePeriods(node);
  await attachStrategicPlan(node);
  return node;
}

async function enrichNodes(nodes) {
  return Promise.all(nodes.map(enrichNode));
}

// ── Auth helpers (RBAC-based — reads from rbac_permissions table) ───

async function isAdmin(user) {
  const { allowed } = await rbacService.checkPermission(
    user.id, RBAC_MODULES.PIRS, RBAC_ACTIONS.DELETE,
  );
  return allowed;
}

async function canEditIndicators(user) {
  const { allowed } = await rbacService.checkPermission(
    user.id, RBAC_MODULES.PIRS, RBAC_ACTIONS.UPDATE,
  );
  return allowed;
}

// ── Division-centric ownership lookups ──────────────────────

async function getFocalDivisions(userId) {
  return getUserDivisionCodes(knex, userId, {
    roles: [DIVISION_ROLE_FOCAL],
  });
}

// Own units plus those of the users who delegated to the caller (D-20261105-09).
const { getResponsibleDivisions } = require('../../services/approvals/approverIdentity');

async function isFocalFor(userId, divisionCode) {
  if (!divisionCode || !userId) return false;
  const codes = await getFocalDivisions(userId);
  const { sameDivision } = require('../../services/divisionAliasService');
  for (const c of codes) {
    if (await sameDivision(c, divisionCode)) return true;
  }
  return false;
}

async function isHodFor(userId, divisionCode) {
  if (!divisionCode || !userId) return false;
  const codes = await getResponsibleDivisions(userId);
  const { sameDivision } = require('../../services/divisionAliasService');
  for (const c of codes) {
    if (await sameDivision(c, divisionCode)) return true;
  }
  return false;
}

// ── Field helpers ───────────────────────────────────────────

const JSON_LIST_FIELDS = ['contributing_divisions', 'secondary_division_codes'];

// Array of division codes → JSON text (deduplicated, blanks dropped), or null.
function toJsonList(value) {
  if (!Array.isArray(value)) return null;
  return JSON.stringify([...new Set(value.filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim()))]);
}

function pickEditableFields(body) {
  const out = {};
  for (const key of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  // contributing_divisions and secondary_division_codes are TEXT columns
  // holding a JSON array — accept an array from the client and store its JSON
  // form; anything else clears it.
  // (Mirrors the explicit handling in broadActivities.js / indicators.js.)
  for (const key of JSON_LIST_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(out, key)) out[key] = toJsonList(out[key]);
  }
  return out;
}

// ── Required-field validation (H-5) ─────────────────────────
// A specific activity must carry type, RCC, budgeting arrangement, funding
// source, grant name and a real cost. The list + per-field rule are the single
// source in @rbm/lib/enums so the create form and the API agree exactly.

/**
 * Required fields entirely absent / blank on CREATE — all must be present.
 *
 * @param {Record<string, *>} fields - whitelisted body (from pickEditableFields)
 * @returns {string[]} field names that are missing or blank (empty = OK)
 */
function missingRequiredActivityFields(fields) {
  return REQUIRED_SPECIFIC_ACTIVITY_FIELDS.filter(
    (f) => !isActivityFieldProvided(f, fields[f]),
  );
}

/**
 * Required fields that were SENT on an UPDATE but blanked / invalidated.
 * PATCH is partial: a field not in the body is left untouched, but a caller
 * may not null-out a required field on an existing activity.
 *
 * @param {Record<string, *>} fields - whitelisted body (from pickEditableFields)
 * @returns {string[]} sent-but-invalid required field names (empty = OK)
 */
function invalidProvidedActivityFields(fields) {
  return REQUIRED_SPECIFIC_ACTIVITY_FIELDS.filter(
    (f) => Object.prototype.hasOwnProperty.call(fields, f) && !isActivityFieldProvided(f, fields[f]),
  );
}

async function nextSpecificActivityCode(parentBroad) {
  const prefix = parentBroad.code || `BR${parentBroad.id}`;
  const siblings = await knex('plan_nodes')
    .where('parent_id', parentBroad.id)
    .where('node_type', 'SPECIFIC_ACTIVITY')
    .whereNotNull('code')
    .pluck('code');
  let max = 0;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}\\.(\\d+)$`);
  for (const code of siblings) {
    const m = re.exec(code);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  const next = String(max + 1).padStart(2, '0');
  return `${prefix}.${next}`;
}

// ── Error envelope ──────────────────────────────────────────

const STATUS_TO_CODE = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'DUPLICATE_ENTRY',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

// A 5xx message is a raw error (Knex puts the whole SQL in it): the callers
// log it, the client gets a generic sentence (D-20261108-02).
const SERVER_ERROR_MESSAGE = 'Something went wrong. Please try again or contact support.';

function envelopeError(res, status, message) {
  const code = STATUS_TO_CODE[status] || 'INTERNAL_ERROR';
  return res.status(status).json(buildError(code, status >= 500 ? SERVER_ERROR_MESSAGE : message));
}

module.exports = {
  knex,
  log,
  STATUSES,
  ACTIVITY_TYPES,
  ACTIVITY_RISK_LEVELS,
  invalidChoice,
  PUBLIC_STATUSES,
  EDITABLE_FIELDS,
  enrichNode,
  enrichNodes,
  isAdmin,
  canEditIndicators,
  getFocalDivisions,
  getResponsibleDivisions,
  isFocalFor,
  isHodFor,
  pickEditableFields,
  missingRequiredActivityFields,
  invalidProvidedActivityFields,
  nextSpecificActivityCode,
  envelopeError,
};
