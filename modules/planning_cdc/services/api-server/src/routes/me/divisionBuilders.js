/**
 * Division scope helpers for GET /api/me/divisions: every division code the
 * caller can act on, each with its focal persons, responsible and M&E officer,
 * inherited from the parent when the local row has none.
 */

const knex = require('../../config/db');
const { NODE_TYPES } = require('@rbm/lib/enums');
const { DIVISION_ASSIGNMENT_ROLES } = require('@rbm/lib/user-divisions');

// Focal persons: the team of user_divisions rows on the canonical code, names joined, first email (D-20261106-09).
const FOCAL_TEAM = 'FROM user_divisions ud JOIN users fu ON fu.id = ud.user_id WHERE ud.division_code = COALESCE(d.alias_of, d.code) AND ud.role = ?';
const FOCAL_NAME = "GROUP_CONCAT(COALESCE(NULLIF(TRIM(fu.full_name),''), TRIM(CONCAT(COALESCE(fu.first_name,''),' ',COALESCE(fu.last_name,'')))) ORDER BY ud.id SEPARATOR ', ')";
const focalSelects = () => [knex.raw(`(SELECT ${FOCAL_NAME} ${FOCAL_TEAM}) as focal_name`, [DIVISION_ASSIGNMENT_ROLES.FOCAL_PERSON]),
  knex.raw(`(SELECT fu.email ${FOCAL_TEAM} ORDER BY ud.id LIMIT 1) as focal_email`, [DIVISION_ASSIGNMENT_ROLES.FOCAL_PERSON])];

// `level_type` is a `division_codes` column value, not an ENTITY_TYPES
// key — the guardrail P-31 flags it as a magic string, so alias it.
// eslint-disable-next-line no-restricted-syntax -- DB column value ≠ ENTITY_TYPES
const LEVEL_DIRECTORATE = 'directorate';

function addReasonTo(reasons, code, reason) {
  if (!code) return;
  const k = code.toUpperCase();
  if (!reasons.has(k)) reasons.set(k, new Set());
  reasons.get(k).add(reason);
}

async function collectDirectorateChildReasons(reasons, userId) {
  const { getDirectoratesForUser, getDirectorateChildren } = require('../../services/divisionAliasService');
  const directorates = await getDirectoratesForUser(userId);
  for (const d of directorates) {
    const children = await getDirectorateChildren(d);
    children.forEach((c) => addReasonTo(reasons, c, 'directorate_child'));
  }
}

function parseContribDivisions(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []);
  } catch {
    return [];
  }
}

async function collectContributingReasons(reasons, myDiv) {
  if (!myDiv) return;
  const contribInds = await knex('plan_nodes')
    .where('node_type', NODE_TYPES.OUTCOME_INDICATOR)
    .andWhere('contributing_divisions', 'like', `%${myDiv}%`)
    .select('responsible_division_code', 'contributing_divisions');
  const up = myDiv.toUpperCase();
  for (const ind of contribInds) {
    const arr = parseContribDivisions(ind.contributing_divisions);
    const contributes = arr.some((c) => String(c).toUpperCase() === up);
    if (contributes && ind.responsible_division_code) {
      addReasonTo(reasons, ind.responsible_division_code, 'indicator_main_for_my_contribution');
    }
  }
}

// Map user_divisions.role → reason string for the frontend
const UD_ROLE_TO_REASON = {
  FOCAL_PERSON: 'focal',
  HEAD_OF_DIVISION: 'responsible',
  DIRECTOR: 'director',
  ME_OFFICER: 'm_and_e',
  MEMBER: 'attached',
};

async function buildReasonMap(reqUser) {
  const userId = reqUser.id;
  const reasons = new Map();

  // Single source of truth: user_divisions table
  const junctionData = new Map();
  const udRows = await knex('user_divisions')
    .where('user_id', userId)
    .select('division_code', 'role', 'is_primary');
  for (const r of udRows) {
    const reason = UD_ROLE_TO_REASON[r.role] || 'attached';
    addReasonTo(reasons, r.division_code, reason);
    const key = r.division_code.toUpperCase();
    if (!junctionData.has(key)) junctionData.set(key, []);
    junctionData.get(key).push({ role: r.role, is_primary: !!r.is_primary });
  }

  // Fallback: if no user_divisions rows, use legacy users.division_code
  if (udRows.length === 0 && reqUser.division_code) {
    addReasonTo(reasons, reqUser.division_code, 'attached');
  }

  await collectDirectorateChildReasons(reasons, userId);
  await collectContributingReasons(reasons, reqUser.division_code);
  return { reasons, junctionData };
}

async function fetchDivisionRows(codesUpper) {
  return knex('division_codes as d')
    .leftJoin('users as ru', 'd.responsible_user_id', 'ru.id')
    .leftJoin('users as mu', 'd.m_and_e_user_id', 'mu.id')
    .whereIn(knex.raw('UPPER(d.code)'), codesUpper)
    .select(
      'd.code', 'd.division_name', 'd.level_type', 'd.parent_code', 'd.alias_of',
      'd.is_country_office', 'd.country_code',
      ...focalSelects(),
      knex.raw("TRIM(CONCAT(COALESCE(ru.first_name,''),' ',COALESCE(ru.last_name,''))) as responsible_name"),
      'ru.email as responsible_email',
      knex.raw("TRIM(CONCAT(COALESCE(mu.first_name,''),' ',COALESCE(mu.last_name,''))) as m_and_e_name"),
      'mu.email as m_and_e_email',
    );
}

async function lookupParentAssignment(cursor, spec) {
  const { field, nameField, emailField } = spec;
  if (!field) return knex('division_codes as d').where('d.code', cursor).select('d.parent_code', ...focalSelects()).first();
  return knex('division_codes as d')
    .leftJoin('users as u', `d.${field}`, 'u.id')
    .where('d.code', cursor)
    .select(
      'd.parent_code',
      knex.raw(`TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) as ${nameField}`),
      knex.raw(`u.email as ${emailField}`),
    )
    .first();
}

async function resolveInherited(row, byCode, spec) {
  const { nameField, emailField } = spec;
  if (row[nameField]) return { name: row[nameField], email: row[emailField] };
  let cursor = row.parent_code;
  const seen = new Set();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const parent = byCode.get(cursor.toUpperCase()) || await lookupParentAssignment(cursor, spec);
    if (!parent) break;
    if (parent[nameField]) {
      return { name: parent[nameField], email: parent[emailField], inherited_from: cursor };
    }
    cursor = parent.parent_code;
  }
  return { name: null, email: null };
}

const FOCAL_SPEC = { field: null, nameField: 'focal_name', emailField: 'focal_email' };
const RESP_SPEC = { field: 'responsible_user_id', nameField: 'responsible_name', emailField: 'responsible_email' };
const ME_SPEC = { field: 'm_and_e_user_id', nameField: 'm_and_e_name', emailField: 'm_and_e_email' };

async function hydrateDivisionRow(r, ctx) {
  const { byCode, reasons, primaryCode, junctionData } = ctx;
  const focalRes = await resolveInherited(r, byCode, FOCAL_SPEC);
  const respRes = await resolveInherited(r, byCode, RESP_SPEC);
  const meRes = await resolveInherited(r, byCode, ME_SPEC);

  const codeUp = r.code.toUpperCase();
  const jRows = junctionData ? junctionData.get(codeUp) : null;
  const junctionPrimary = jRows ? jRows.some((j) => j.is_primary) : false;
  const junctionRoles = jRows ? jRows.map((j) => j.role) : [];

  return {
    code: r.code,
    division_name: r.division_name,
    level_type: r.level_type,
    parent_code: r.parent_code,
    alias_of: r.alias_of,
    // A country office plans activities under any broad, in its country (D-20261105-07).
    is_country_office: !!r.is_country_office,
    country_code: r.country_code || null,
    focal_name: focalRes.name,
    focal_email: focalRes.email,
    focal_inherited_from: focalRes.inherited_from || null,
    responsible_name: respRes.name,
    responsible_email: respRes.email,
    responsible_inherited_from: respRes.inherited_from || null,
    m_and_e_name: meRes.name,
    m_and_e_email: meRes.email,
    m_and_e_inherited_from: meRes.inherited_from || null,
    reasons: Array.from(reasons.get(codeUp) || []),
    is_primary: junctionPrimary || codeUp === primaryCode,
    junction_roles: junctionRoles,
  };
}

function sortDivisions(divisions) {
  divisions.sort((a, b) => {
    const aIsDir = a.level_type === LEVEL_DIRECTORATE;
    const bIsDir = b.level_type === LEVEL_DIRECTORATE;
    if (aIsDir && !bIsDir) return -1;
    if (!aIsDir && bIsDir) return 1;
    return (a.division_name || '').localeCompare(b.division_name || '');
  });
}

module.exports = {
  buildReasonMap,
  fetchDivisionRows,
  hydrateDivisionRow,
  sortDivisions,
};
