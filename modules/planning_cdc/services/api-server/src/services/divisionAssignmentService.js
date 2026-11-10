// ── Division assignment service ──
//
// Single write path for "who holds which role on a division", so
// division_codes and user_divisions cannot drift:
//   · Division page  → hierarchy.updateDivision → applyHolderChange()
//   · User window, team slot, admin create, CBP import → addDivisionRole() / removeDivisionRole()
//
// Model (D-20261009-03, D-20261106-09):
//   · responsible_user_id / m_and_e_user_id hold exactly one user; the column
//     is what approvals read, the user_divisions role row mirrors it.
//   · Focal persons are a team: FOCAL_PERSON rows of user_divisions only, no
//     division_codes column (the « main focal » pointer was dropped).
//   · Setting a holder demotes the previous holder's row to MEMBER.
//   · Global roles FOCAL_PERSON / HEAD_OF_DIVISION / DIRECTOR / ME_OFFICER are
//     recomputed from user_divisions after every write (user_roles.granted_via
//     = 'division'); admin grants (NULL) are never touched. Any division row
//     implies the global STAFF role, which is never revoked here.
//
// Every function takes a knex transaction (`trx`) and never commits.

const { DIVISION_ASSIGNMENT_ROLES: ROLE, DIVISION_ASSIGNMENT_ROLE_LIST } = require('@rbm/lib/user-divisions');
const { ORG_LEVEL_TYPES } = require('@rbm/lib/enums');
const { ROLES } = require('@rbm/lib/roles');
const { NotFoundError, ValidationError } = require('@rbm/lib/errors');
const { resolveAliases } = require('./divisionAliasService');

// division_codes column names (DB columns, not enum values).
const RESPONSIBLE_FIELD = 'responsible_user_id';
const M_AND_E_FIELD = 'm_and_e_user_id';
const HOLDER_FIELDS = Object.freeze([RESPONSIBLE_FIELD, M_AND_E_FIELD]);

// user_roles.granted_via marker for rows this service owns.
// eslint-disable-next-line no-restricted-syntax -- user_roles.granted_via column value, not an ENTITY_TYPES identifier (P-31)
const GRANTED_VIA_DIVISION = 'division';
// Global roles that mirror a user_divisions role (same code on both sides).
const DERIVED_GLOBAL_ROLES = Object.freeze(
  DIVISION_ASSIGNMENT_ROLE_LIST.filter((r) => r !== ROLE.MEMBER),
);

/**
 * Role a single holder of `field` carries on a division of `levelType`.
 * Responsible is DIRECTOR on a directorate row and HEAD_OF_DIVISION otherwise.
 *
 * @param {string} field — one of HOLDER_FIELDS
 * @param {string|null} levelType — division_codes.level_type
 * @returns {string} user_divisions role code
 * @example
 * holderRoleFor(RESPONSIBLE_FIELD, 'directorate'); // 'DIRECTOR'
 */
function holderRoleFor(field, levelType) {
  if (field === M_AND_E_FIELD) return ROLE.ME_OFFICER;
  return levelType === ORG_LEVEL_TYPES.DIRECTORATE ? ROLE.DIRECTOR : ROLE.HEAD_OF_DIVISION;
}

/**
 * Division_codes column a user_divisions role maps to. Null for MEMBER and
 * FOCAL_PERSON (team roles, no column).
 *
 * @param {string} role — user_divisions role code
 * @returns {string|null} one of HOLDER_FIELDS, or null
 * @example
 * fieldForRole('DIRECTOR'); // 'responsible_user_id'
 */
function fieldForRole(role) {
  if (role === ROLE.ME_OFFICER) return M_AND_E_FIELD;
  if (role === ROLE.HEAD_OF_DIVISION || role === ROLE.DIRECTOR) return RESPONSIBLE_FIELD;
  return null;
}

/**
 * Decide what syncGlobalRoles does with one global role.
 *
 * @param {string} code — role code
 * @param {{granted_via: string|null}|undefined} row — the user's current user_roles row, if any
 * @param {Set<string>} wanted — roles the user should hold given their division rows
 * @returns {'grant'|'revoke'|null}
 * @example
 * globalRoleAction(ROLES.HEAD_OF_DIVISION, undefined, new Set([ROLES.HEAD_OF_DIVISION])); // 'grant'
 */
function globalRoleAction(code, row, wanted) {
  if (wanted.has(code)) return row ? null : 'grant';
  const revocable = row && row.granted_via === GRANTED_VIA_DIVISION && code !== ROLES.STAFF;
  return revocable ? 'revoke' : null;
}

/**
 * Recompute a user's division-derived global roles from their user_divisions
 * rows. Grants missing roles with granted_via = 'division'; revokes rows this
 * service granted when no division row backs them any more. Admin-granted
 * rows (granted_via NULL) are left alone. A user with any division row is
 * granted STAFF, which is never revoked. Invalidates the RBAC cache when
 * anything changed. A missing roles row is skipped (admin-config issue).
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {number} userId
 * @returns {Promise<void>}
 * @example
 * await syncGlobalRoles(trx, 5);
 */
async function syncGlobalRoles(trx, userId) {
  if (!userId) return;
  const held = new Set(
    (await trx('user_divisions').where('user_id', userId).select('role')).map((r) => r.role),
  );
  const roleRows = await trx('roles').whereIn('code', [...DERIVED_GLOBAL_ROLES, ROLES.STAFF]).select('id', 'code');
  const existing = await trx('user_roles')
    .where('user_id', userId)
    .whereIn('role_id', roleRows.map((r) => r.id))
    .select('id', 'role_id', 'granted_via');
  // Any division row makes the user at least STAFF; STAFF is never revoked.
  const wanted = new Set(DERIVED_GLOBAL_ROLES.filter((r) => held.has(r)));
  if (held.size > 0) wanted.add(ROLES.STAFF);
  let changed = false;
  for (const role of roleRows) {
    const row = existing.find((ur) => ur.role_id === role.id);
    const action = globalRoleAction(role.code, row, wanted);
    if (action === 'grant') {
      await trx('user_roles').insert({ user_id: userId, role_id: role.id, granted_via: GRANTED_VIA_DIVISION });
    } else if (action === 'revoke') {
      await trx('user_roles').where('id', row.id).del();
    }
    changed = changed || action !== null;
  }
  if (changed) {
    // Lazy: rbacService is only needed to drop the permission cache.
    require('./rbacService').invalidateUserPermissions(userId);
  }
}

/**
 * Ensure a user_divisions row exists for (user, division, role). Idempotent.
 * A non-MEMBER role also removes the redundant MEMBER row on that division;
 * MEMBER is implied by any other row there, so it is not added on top of one.
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {number} userId
 * @param {string} divisionCode
 * @param {string} role
 * @returns {Promise<void>}
 * @example
 * await ensureDivisionRow(trx, 5, 'DPHI', 'HEAD_OF_DIVISION');
 */
async function ensureDivisionRow(trx, userId, divisionCode, role) {
  const key = { user_id: userId, division_code: divisionCode, role };
  const existing = await trx('user_divisions').where(key).first();
  if (!existing) {
    if (role === ROLE.MEMBER) {
      const any = await trx('user_divisions').where({ user_id: userId, division_code: divisionCode }).first();
      if (any) return;
    }
    await trx('user_divisions').insert({ ...key, is_primary: false });
  }
  if (role !== ROLE.MEMBER) {
    await trx('user_divisions').where({ user_id: userId, division_code: divisionCode, role: ROLE.MEMBER }).del();
  }
}

/**
 * Demote a previous holder's role row on a division. If the user has no other
 * row on that division, the role row becomes MEMBER. If they already have any
 * other row there (MEMBER, FOCAL_PERSON, ...), the role row is deleted instead.
 * Global roles are never touched.
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {number} userId — previous holder
 * @param {string} divisionCode
 * @param {string} role — the holder role being vacated
 * @returns {Promise<void>}
 * @example
 * await demoteHolder(trx, 2, 'DPHI', 'HEAD_OF_DIVISION');
 */
async function demoteHolder(trx, userId, divisionCode, role) {
  const roleRow = await trx('user_divisions')
    .where({ user_id: userId, division_code: divisionCode, role }).first();
  if (!roleRow) return;
  const otherRow = await trx('user_divisions')
    .where({ user_id: userId, division_code: divisionCode })
    .whereNot('role', role).first();
  if (otherRow) {
    await trx('user_divisions').where('id', roleRow.id).del();
  } else {
    await trx('user_divisions').where('id', roleRow.id).update({ role: ROLE.MEMBER });
  }
}

/**
 * Codes that share the division's assignments (the row plus its alias group).
 * @param {string} code
 * @returns {Promise<string[]>}
 * @example await aliasGroup('DPHI'); // ['DPHI']
 */
async function aliasGroup(code) {
  const codes = await resolveAliases(code);
  return codes && codes.length ? codes : [code];
}

/**
 * Read the division row or throw a 404.
 * @param {import('knex').Knex.Transaction} trx
 * @param {string} code
 * @returns {Promise<object>} division_codes row
 * @throws {NotFoundError} when the division does not exist
 * @example const div = await requireDivision(trx, 'DPHI');
 */
async function requireDivision(trx, code) {
  const div = await trx('division_codes').where('code', code).first();
  if (!div) throw new NotFoundError('Division not found');
  return div;
}

/**
 * Write a holder column on the division and every alias sibling.
 * @param {import('knex').Knex.Transaction} trx
 * @param {string[]} codes
 * @param {string} field
 * @param {number|null} userId
 * @returns {Promise<void>}
 * @example await setHolderColumn(trx, ['DPHI'], 'responsible_user_id', 5);
 */
async function setHolderColumn(trx, codes, field, userId) {
  await trx('division_codes').whereIn('code', codes).update({ [field]: userId });
}

/**
 * Make `userId` the holder of a single-holder field (responsible or M&E). The
 * previous holder is demoted to MEMBER.
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {{code: string, field: string, userId: number, div?: object}} args — `div` is the division row when the caller already read it
 * @returns {Promise<void>}
 * @throws {NotFoundError} when the division does not exist
 * @example
 * await assignHolder(trx, { code: 'DPHI', field: 'responsible_user_id', userId: 5 });
 */
async function assignHolder(trx, { code, field, userId, div: knownDiv }) {
  const div = knownDiv || await requireDivision(trx, code);
  const role = holderRoleFor(field, div.level_type);
  const previous = div[field] ? Number(div[field]) : null;
  if (previous && previous !== userId) {
    await demoteHolder(trx, previous, code, role);
    await syncGlobalRoles(trx, previous);
  }
  await setHolderColumn(trx, await aliasGroup(code), field, userId);
  await ensureDivisionRow(trx, userId, code, role);
  await syncGlobalRoles(trx, userId);
}

/**
 * Clear a holder field (responsible or M&E): the holder's role row is demoted
 * to MEMBER.
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {{code: string, field: string}} args
 * @returns {Promise<void>}
 * @throws {NotFoundError} when the division does not exist
 * @example
 * await clearHolder(trx, { code: 'DPHI', field: 'm_and_e_user_id' });
 */
async function clearHolder(trx, { code, field }) {
  const div = await requireDivision(trx, code);
  const previous = div[field] ? Number(div[field]) : null;
  if (previous) {
    await demoteHolder(trx, previous, code, holderRoleFor(field, div.level_type));
    await syncGlobalRoles(trx, previous);
  }
  await setHolderColumn(trx, await aliasGroup(code), field, null);
}

/**
 * Division page entry point: apply a PATCH of one holder field. `userId` null
 * unsets the holder. Both division_codes and user_divisions are written.
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {{code: string, field: string, userId: number|null}} args
 * @returns {Promise<void>}
 * @throws {NotFoundError} when the division does not exist
 * @example
 * await applyHolderChange(trx, { code: 'DPHI', field: 'responsible_user_id', userId: 5 });
 */
async function applyHolderChange(trx, { code, field, userId }) {
  if (!HOLDER_FIELDS.includes(field)) throw new ValidationError(`${field} is not a holder field`);
  if (userId == null) {
    await clearHolder(trx, { code, field });
    return;
  }
  await assignHolder(trx, { code, field, userId: Number(userId) });
}

/**
 * User window entry point: give a user a division role. Responsible / M&E
 * replace the current holder (previous demoted). FOCAL_PERSON and MEMBER just
 * add the row (focal persons are a team).
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {{userId: number, code: string, role: string, isPrimary?: boolean}} args
 * @returns {Promise<void>}
 * @throws {NotFoundError} when the division does not exist
 * @throws {ValidationError} when the role is unknown
 * @example
 * await addDivisionRole(trx, { userId: 5, code: 'DPHI', role: 'HEAD_OF_DIVISION' });
 */
async function addDivisionRole(trx, { userId, code, role, isPrimary = false }) {
  if (!DIVISION_ASSIGNMENT_ROLE_LIST.includes(role)) throw new ValidationError(`Unknown role ${role}`);
  if (isPrimary) {
    await trx('user_divisions').where('user_id', userId).update({ is_primary: false });
  }
  const field = fieldForRole(role);
  let storedRole = role;
  if (field) {
    const div = await requireDivision(trx, code);
    // One "Responsible person" for users: the stored role follows level_type
    // (DIRECTOR on a directorate, HEAD_OF_DIVISION elsewhere), whatever was sent.
    storedRole = holderRoleFor(field, div.level_type);
    await assignHolder(trx, { code, field, userId, div });
  } else {
    if (role === ROLE.FOCAL_PERSON) await requireDivision(trx, code);
    await ensureDivisionRow(trx, userId, code, role); // FOCAL_PERSON or MEMBER
    await syncGlobalRoles(trx, userId); // at least STAFF
  }
  if (isPrimary) {
    await trx('user_divisions').where({ user_id: userId, division_code: code, role: storedRole }).update({ is_primary: true });
  }
}

/**
 * Keep users.division_code (legacy home division, still read by the staff list
 * and division scoping) off a division the user no longer belongs to. When the
 * last row on `code` is removed, it moves to the user's primary remaining
 * division, else any remaining one, else null.
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {number} userId
 * @param {string} code — division the user just lost a row on
 * @returns {Promise<void>}
 * @example
 * await syncLegacyDivision(trx, 246, 'DG');
 */
async function syncLegacyDivision(trx, userId, code) {
  const user = await trx('users').where('id', userId).first('division_code');
  if (!user || user.division_code !== code) return;
  const rows = await trx('user_divisions').where('user_id', userId).select('division_code', 'is_primary');
  if (rows.some((r) => r.division_code === code)) return;
  const next = rows.find((r) => r.is_primary) || rows[0];
  await trx('users').where('id', userId).update({ division_code: next ? next.division_code : null });
}

/**
 * User window entry point: remove a user's role row on a division. If that row
 * was the division's holder pointer (responsible or M&E), the pointer is
 * cleared. Nothing is auto-picked; derived global roles are recomputed.
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {{userId: number, code: string, role: string}} args
 * @returns {Promise<void>}
 * @example
 * await removeDivisionRole(trx, { userId: 5, code: 'DPHI', role: 'HEAD_OF_DIVISION' });
 */
async function removeDivisionRole(trx, { userId, code, role }) {
  await trx('user_divisions').where({ user_id: userId, division_code: code, role }).del();
  await syncLegacyDivision(trx, userId, code);
  await syncGlobalRoles(trx, userId);
  const field = fieldForRole(role);
  if (!field) return;
  const div = await trx('division_codes').where('code', code).first();
  if (div && Number(div[field]) === Number(userId)) {
    await setHolderColumn(trx, await aliasGroup(code), field, null);
  }
}

module.exports = {
  HOLDER_FIELDS,
  RESPONSIBLE_FIELD,
  M_AND_E_FIELD,
  GRANTED_VIA_DIVISION,
  DERIVED_GLOBAL_ROLES,
  holderRoleFor,
  fieldForRole,
  syncGlobalRoles,
  ensureDivisionRow,
  applyHolderChange,
  addDivisionRole,
  removeDivisionRole,
};
