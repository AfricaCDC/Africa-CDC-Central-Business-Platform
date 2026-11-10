// ── Admin Users Service ──
//
// Extracted from `services/api-server/src/services/adminService.js` as the
// first service-layer commit of the task #28 split (commit 1/N). Admin-side
// user CRUD, with the internal helpers used only by this module
// (composeFullName, sanitizeUserPayload) and READONLY_USER_FIELDS. Users
// have no password: they sign in with Microsoft (D-20261107-03).
//
// Consumed via the adminService facade — existing callers
// `require('../services/adminService')` continue to resolve these names
// through the parent aggregator's spread export.

const db = require('../../config/db');
const {
  DIVISION_ASSIGNMENT_ROLES,
  DIVISION_ASSIGNMENT_ROLE_LIST,
  DIVISION_ASSIGNMENT_ROLE_LABELS,
} = require('@rbm/lib/user-divisions');
const divisionAssignmentService = require('../divisionAssignmentService');

// Fields a client must NEVER be allowed to set directly. `password` is
// dropped too: there is no password login (D-20261107-03).
const READONLY_USER_FIELDS = new Set([
  'id', 'password', 'password_hash', 'last_login_at', 'created_at', 'updated_at',
]);

/**
 * Compose a display "full_name" from the structured fields.
 * Used by sanitizeUserPayload so the denormalised full_name column stays
 * in sync whenever a client writes title/first/middle/last.
 */
function composeFullName({ title, first_name, middle_name, last_name }) {
  return [title, first_name, middle_name, last_name]
    .map(s => (s || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

/**
 * Sanitize an incoming user payload before INSERT/UPDATE. Strips read-only
 * fields entirely, including any `password` a client still sends.
 *
 * If structured name fields (title/first_name/middle_name/last_name) are
 * present, recompute full_name from them so the denormalised cache stays
 * consistent. Conversely, if only `full_name` is sent (legacy callers),
 * leave it as-is.
 */
async function sanitizeUserPayload(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input)) {
    if (READONLY_USER_FIELDS.has(k)) continue;
    out[k] = v;
  }
  // If any structured name field was provided, recompute full_name
  const hasStructuredName = ['title', 'first_name', 'middle_name', 'last_name']
    .some(k => k in input);
  if (hasStructuredName) {
    out.full_name = composeFullName(out);
  }
  return out;
}

/**
 * Group a user's `user_divisions` rows per division for the staff list, with
 * every role held there. `user_divisions` is the only source: the legacy
 * `users.division_code` follows it (divisionAssignmentService) and is never
 * read here, so no ghost membership can appear. Labels come from packages/lib.
 *
 * @param {Array<{division_code: string, division_name?: string|null, role: string, is_primary?: boolean|number}>} rows — user_divisions rows for this user
 * @returns {Array<{code: string, division_name: string|null, is_primary: boolean, roles: Array<{code: string, label: string}>}>} primary division first, then by code
 * @example
 * buildUserDivisions([{ division_code: 'DPHI', role: 'HEAD_OF_DIVISION' }]);
 */
function buildUserDivisions(rows) {
  const byCode = new Map();
  const entryFor = (code, name) => {
    if (!byCode.has(code)) byCode.set(code, { code, division_name: null, is_primary: false, roles: new Set() });
    const e = byCode.get(code);
    if (name && !e.division_name) e.division_name = name;
    return e;
  };
  for (const r of rows) {
    const e = entryFor(r.division_code, r.division_name);
    e.roles.add(r.role);
    if (r.is_primary) e.is_primary = true;
  }
  return [...byCode.values()]
    .map((e) => ({
      code: e.code,
      division_name: e.division_name,
      is_primary: e.is_primary,
      roles: DIVISION_ASSIGNMENT_ROLE_LIST
        .filter((r) => e.roles.has(r))
        .map((r) => ({ code: r, label: DIVISION_ASSIGNMENT_ROLE_LABELS[r] })),
    }))
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.code.localeCompare(b.code));
}

/**
 * List users joined with business unit + division, filtered, with roles and
 * division memberships attached per user.
 *
 * @param {object} [filters] — `status`, `bu_id`, `division_code`
 * @returns {Promise<Array<object>>} user rows with `roles` and `divisions` arrays attached
 * @throws {Error} when any underlying query fails
 * @example
 * const users = await getUsers({ status: 'ACTIVE' });
 */
const getUsers = async (filters = {}) => {
  const q = db('users')
    .leftJoin('business_units', 'users.business_unit_id', 'business_units.id')
    .leftJoin('division_codes', 'users.division_code', 'division_codes.code')
    .select('users.id', 'users.full_name', 'users.title', 'users.first_name',
      'users.middle_name', 'users.last_name', 'users.email', 'users.status',
      'users.user_type', 'users.business_unit_id', 'users.division_code',
      'users.last_login_at', 'users.created_at',
      'business_units.name as business_unit', 'business_units.code as bu_code',
      'division_codes.division_name', 'division_codes.directorate');
  if (filters.status) q.where('users.status', filters.status);
  if (filters.bu_id) q.where('users.business_unit_id', filters.bu_id);
  if (filters.division_code) q.where('users.division_code', filters.division_code);
  // Safety ceiling — the users table is small today but an unbounded list
  // query is still a latent footgun. 1000 is well above any realistic tenant.
  const users = await q.orderBy('users.full_name').limit(1000);

  // Attach roles to each user
  if (users.length > 0) {
    const userIds = users.map(u => u.id);
    const allUserRoles = await db('user_roles')
      .join('roles', 'user_roles.role_id', 'roles.id')
      .whereIn('user_roles.user_id', userIds)
      .select('user_roles.user_id', 'roles.id as role_id', 'roles.code', 'roles.name', 'roles.permissions');
    const rolesByUser = {};
    allUserRoles.forEach(ur => {
      if (!rolesByUser[ur.user_id]) rolesByUser[ur.user_id] = [];
      rolesByUser[ur.user_id].push({ id: ur.role_id, code: ur.code, name: ur.name });
    });
    users.forEach(u => { u.roles = rolesByUser[u.id] || []; });

    // Division memberships: user_divisions is the source of truth for
    // focal / responsible / M&E / member. Missing this join hid every
    // division a user held as responsible (HEAD_OF_DIVISION / DIRECTOR).
    const membershipRows = await db('user_divisions as ud')
      .leftJoin('division_codes as dc', 'ud.division_code', 'dc.code')
      .whereIn('ud.user_id', userIds)
      .select('ud.user_id', 'ud.division_code', 'ud.role', 'ud.is_primary', 'dc.division_name');
    const membershipByUser = {};
    membershipRows.forEach(r => {
      if (!membershipByUser[r.user_id]) membershipByUser[r.user_id] = [];
      membershipByUser[r.user_id].push(r);
    });
    users.forEach(u => { u.divisions = buildUserDivisions(membershipByUser[u.id] || []); });
  }

  return users;
};

/**
 * Fetch a user row by id (no joins).
 *
 * @param {number|string} id — user id
 * @returns {Promise<object|undefined>} user row or undefined
 * @throws {Error} when the DB query fails
 * @example
 * const u = await getUserById(7);
 */
const getUserById = (id) => db('users').where('users.id', id).first();

/**
 * Insert a new user (payload sanitized + password hashed) and return the fresh row.
 * A `division_code` becomes the user's primary MEMBER row in user_divisions.
 *
 * @param {object} data — column values (may include plaintext `password`)
 * @returns {Promise<object|undefined>} the created user row
 * @throws {Error} when the insert fails
 * @example
 * await createUser({ email: 'jane@africacdc.org', first_name: 'Jane' });
 */
const createUser = async (data) => {
  const sanitized = await sanitizeUserPayload(data);
  const [id] = await db('users').insert(sanitized);
  // The initial division is a real membership, not just the legacy column:
  // the staff list and division scoping read user_divisions.
  if (sanitized.division_code) {
    await db.transaction((trx) => divisionAssignmentService.addDivisionRole(trx, {
      userId: id, code: sanitized.division_code, role: DIVISION_ASSIGNMENT_ROLES.MEMBER, isPrimary: true,
    }));
  }
  return getUserById(id);
};

/**
 * Update a user (payload sanitized + password hashed if present) and return the fresh row.
 * `division_code` is ignored: memberships are managed through the division endpoints.
 *
 * @param {number|string} id — user id
 * @param {object} data — partial column values
 * @returns {Promise<object|undefined>} the updated user row
 * @throws {Error} when the update fails
 * @example
 * await updateUser(7, { title: 'Dr' });
 */
const updateUser = async (id, data) => {
  const sanitized = await sanitizeUserPayload(data);
  // users.division_code follows user_divisions (divisionAssignmentService);
  // memberships change through /admin/users/:id/divisions, never by this PUT.
  delete sanitized.division_code;
  if (Object.keys(sanitized).length) {
    await db('users').where({ id }).update(sanitized);
  }
  return getUserById(id);
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
};
