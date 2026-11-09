/**
 * User ↔ Division resolution with automatic alias propagation.
 *
 * Model reminder (see migrations 20260408120000 and 20260414100000):
 *   - division_codes has two nullable 1:1 pointers: responsible_user_id,
 *     m_and_e_user_id. Focal persons are a team: FOCAL_PERSON rows of
 *     user_divisions only (D-20261106-09).
 *   - division_codes.alias_of is a self-FK: when non-null, that row is a
 *     historical duplicate of its canonical twin. Aliases inherit all
 *     assignments from their canonical — we never duplicate rows into the
 *     alias entry itself, propagation happens here at read time.
 *
 * Consumers of this helper should treat the returned `code` set as the
 * authoritative scope for "divisions this user can act on". Anything
 * asking "is user X focal/responsible/M&E for division Y?" must go
 * through here so alias propagation is consistent everywhere.
 */

'use strict';

const ROLE_FOCAL = 'FOCAL';
const ROLE_RESPONSIBLE = 'RESPONSIBLE';
const ROLE_M_AND_E = 'M_AND_E';

const ALL_ROLES = Object.freeze([ROLE_FOCAL, ROLE_RESPONSIBLE, ROLE_M_AND_E]);

const DIVISION_ASSIGNMENT_ROLES = Object.freeze({
  FOCAL_PERSON: 'FOCAL_PERSON',
  HEAD_OF_DIVISION: 'HEAD_OF_DIVISION',
  DIRECTOR: 'DIRECTOR',
  ME_OFFICER: 'ME_OFFICER',
  MEMBER: 'MEMBER',
});

const DIVISION_ASSIGNMENT_ROLE_LIST = Object.freeze(
  Object.values(DIVISION_ASSIGNMENT_ROLES),
);

const DIVISION_ASSIGNMENT_ROLE_LABELS = Object.freeze({
  [DIVISION_ASSIGNMENT_ROLES.MEMBER]: 'Member',
  [DIVISION_ASSIGNMENT_ROLES.FOCAL_PERSON]: 'Focal Person',
  // One concept for users: the Responsible person (single holder) of a
  // division or directorate. The stored role (HEAD_OF_DIVISION / DIRECTOR)
  // follows level_type and is chosen by divisionAssignmentService.
  [DIVISION_ASSIGNMENT_ROLES.HEAD_OF_DIVISION]: 'Responsible person',
  [DIVISION_ASSIGNMENT_ROLES.DIRECTOR]: 'Responsible person',
  [DIVISION_ASSIGNMENT_ROLES.ME_OFFICER]: 'M&E Officer',
});

/**
 * Resolve the full set of divisions a user is assigned to, including
 * aliases propagated from each canonical assignment.
 *
 * @param {import('knex').Knex} knex
 * @param {number} userId
 * @param {object} [opts]
 * @param {string[]} [opts.roles] — subset of ALL_ROLES to consider. Defaults to all three.
 * @param {boolean} [opts.includeAliases=true] — set false to skip alias
 *   expansion (rarely needed; useful when editing the canonical row itself).
 * @returns {Promise<Array<{code: string, role: string, via_alias_of: string|null}>>}
 *   One row per (code, role). If a user is both focal and responsible for
 *   the same division, two rows are returned with different `role` values.
 *   `via_alias_of` is null for direct assignments and set to the canonical
 *   code when the assignment was inherited via alias propagation.
 */
// Map user_divisions.role enum → internal ROLE_* constants
const UD_ROLE_MAP = {
  FOCAL_PERSON: ROLE_FOCAL,
  HEAD_OF_DIVISION: ROLE_RESPONSIBLE,
  DIRECTOR: ROLE_RESPONSIBLE,
  ME_OFFICER: ROLE_M_AND_E,
  MEMBER: ROLE_FOCAL, // MEMBER maps loosely; included only when ALL_ROLES requested
};
const INTERNAL_TO_UD = {
  [ROLE_FOCAL]: ['FOCAL_PERSON'],
  [ROLE_RESPONSIBLE]: ['HEAD_OF_DIVISION', 'DIRECTOR'],
  [ROLE_M_AND_E]: ['ME_OFFICER'],
};

/** Requested internal roles (unknown ones dropped), all of them by default. */
function requestedRoles(opts) {
  return Array.isArray(opts.roles) && opts.roles.length
    ? opts.roles.filter((r) => ALL_ROLES.includes(r))
    : ALL_ROLES.slice();
}

/** user_divisions.role values to query; MEMBER only when every role is asked. */
function udRolesFor(roles) {
  const udRoles = [];
  for (const r of roles) {
    if (INTERNAL_TO_UD[r]) udRoles.push(...INTERNAL_TO_UD[r]);
  }
  if (roles.length === ALL_ROLES.length) udRoles.push('MEMBER');
  return udRoles;
}

/** Add one row per alias of a direct code (division_codes.alias_of). */
async function withAliases(knex, result) {
  const directCodes = [...new Set(result.map((r) => r.code))];
  const aliasRows = await knex('division_codes')
    .whereIn('alias_of', directCodes)
    .select('code', 'alias_of');

  for (const a of aliasRows) {
    for (const r of result) {
      if (r.code === a.alias_of && r.via_alias_of === null) {
        result.push({ code: a.code, role: r.role, via_alias_of: a.alias_of });
      }
    }
  }
  return result;
}

async function getUserDivisions(knex, userId, opts = {}) {
  if (!userId) return [];
  const roles = requestedRoles(opts);
  const includeAliases = opts.includeAliases !== false;

  // 1. Read from user_divisions (single source of truth)
  const direct = await knex('user_divisions')
    .where('user_id', userId)
    .whereIn('role', udRolesFor(roles))
    .select('division_code', 'role');

  const result = [];
  for (const d of direct) {
    const internalRole = UD_ROLE_MAP[d.role] || ROLE_FOCAL;
    if (roles.includes(internalRole) || d.role === 'MEMBER') {
      result.push({ code: d.division_code, role: internalRole, via_alias_of: null });
    }
  }

  if (!includeAliases || result.length === 0) return result;

  // 2. Alias expansion — any division whose alias_of ∈ our codes
  return withAliases(knex, result);
}

/**
 * Convenience: return just the set of division codes the user scopes into,
 * for any of the requested roles. Deduplicated, sorted.
 *
 * @param {import('knex').Knex} knex
 * @param {number} userId
 * @param {object} [opts] — same shape as getUserDivisions
 * @returns {Promise<string[]>}
 */
async function getUserDivisionCodes(knex, userId, opts = {}) {
  const rows = await getUserDivisions(knex, userId, opts);
  const codes = new Set();
  for (const r of rows) codes.add(r.code);
  return Array.from(codes).sort();
}

/**
 * Convenience: return the canonical codes the user holds a given role on,
 * stripping alias-propagated rows. Use when you need to UPDATE the
 * assignment itself (you only want the row the user was directly attached
 * to, not the inherited aliases).
 *
 * @param {import('knex').Knex} knex
 * @param {number} userId
 * @param {string} role — one of ROLE_FOCAL | ROLE_RESPONSIBLE | ROLE_M_AND_E
 * @returns {Promise<string[]>}
 */
async function getDirectCanonicalCodes(knex, userId, role) {
  const rows = await getUserDivisions(knex, userId, { roles: [role], includeAliases: false });
  return rows.map((r) => r.code);
}

module.exports = {
  getUserDivisions,
  getUserDivisionCodes,
  getDirectCanonicalCodes,
  ROLE_FOCAL,
  ROLE_RESPONSIBLE,
  ROLE_M_AND_E,
  ALL_ROLES,
  DIVISION_ASSIGNMENT_ROLES,
  DIVISION_ASSIGNMENT_ROLE_LIST,
  DIVISION_ASSIGNMENT_ROLE_LABELS,
  DIVISION_ROLE_FOCAL: ROLE_FOCAL,
  DIVISION_ROLE_RESPONSIBLE: ROLE_RESPONSIBLE,
};
