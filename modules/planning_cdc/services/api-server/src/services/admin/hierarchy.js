/* eslint-disable max-lines, complexity, no-restricted-syntax --
 * Division hierarchy service extracted from adminService.js as part of
 * the task #28 split (commit 4/N, D-20260418-20). Pre-existing legacy
 * debt carried along verbatim — no logic changes in this move:
 *   · max-lines: 468L (tree + CRUD + focal/responsible + M&E branch-heavy
 *     validation — split follow-up tracked under task #49).
 *   · complexity: updateDivision = 29 (validation + cycle check + alias
 *     check + transactional role-grant fan-out), createDivision = 15,
 *     deleteDivision = 15, getDivisionDetail = 14 — to be decomposed
 *     in the same task #49 follow-up.
 *   · no-restricted-syntax: P-31 false positives for 'directorate' /
 *     'division' / 'unit' which are `division_codes.level_type` column
 *     enum values (NOT ENTITY_TYPES), plus 'directorate' as a SQL column
 *     selector in `d.directorate`. Allowlisted in
 *     scripts/forbidden.allowlist.json + .claude/hooks/forbidden-patterns.allow.
 * Pragma is a ceiling — do NOT grow the file or add new violations.
 */

// ── Admin · Division Hierarchy Service ──
//
// Extracted from `services/api-server/src/services/adminService.js` as the
// fourth service-layer commit of the task #28 split (commit 4/N,
// D-20260418-20). Owns the division_codes CRUD + the organigramme tree
// read path + the focal/responsible/M&E auto-role-grant logic.
//
// Consumed via the adminService facade — existing callers
// `require('../services/adminService')` continue to resolve these names
// through the parent aggregator's module.exports spread.
//
// Scope — 6 exports:
//   · Reads: getDivisionTree, getDivisionByCode, getDivisionDetail
//   · Writes: updateDivision, createDivision, deleteDivision
// Holder writes (responsible / M&E) delegate to
// services/divisionAssignmentService.js, shared with the user edit window.
// Plus one internal constant (`VALID_LEVEL_TYPES`) — the `level_type` column enum on division_codes
// ('directorate'|'division'|'unit'). These are column-enum values, NOT
// ENTITY_TYPES identifiers — the guardrails P-31 regex false-positives on
// them. Documented in scripts/forbidden.allowlist.json + the PreToolUse
// hook's allow file (D-20260418-20).
//
// Alias-service dependency: loaded lazily via `require('../divisionAliasService')`
// inside updateDivision to keep import time free of cross-service coupling.
// Path is one level deeper than the parent's `./divisionAliasService`
// because this file lives under services/admin/.

const db = require('../../config/db');
const { countryByCode } = require('@rbm/lib/countries');
const { ORG_LEVEL_TYPES } = require('@rbm/lib/enums');
const divisionAssignmentService = require('../divisionAssignmentService');
const { DIVISION_ASSIGNMENT_ROLES: { FOCAL_PERSON } } = require('@rbm/lib/user-divisions');

// ── Internal: level_type column-enum whitelist ────────────────────────
//
// The `level_type` column on `division_codes` accepts exactly these three
// values (or NULL). Enforced at the service layer to return a clean 400
// before the INSERT/UPDATE hits MySQL. (D-20260418-20, P-31 allowlisted.)
const VALID_LEVEL_TYPES = new Set(['directorate', 'division', 'unit']);

/**
 * Normalise the country-office pair of a create / update payload in place
 * (D-20261026-05): a country office needs an AU member state code; a unit that
 * is not one carries no country.
 *
 * @param {object} row - payload holding is_country_office and/or country_code
 * @param {object} [current] - stored row, for a partial update
 * @returns {void}
 * @throws {Error} 400 when the country is missing or unknown
 */
function applyCountryOffice(row, current = {}) {
  if (!('is_country_office' in row) && !('country_code' in row)) return;
  const isOffice = 'is_country_office' in row ? Boolean(row.is_country_office) : Boolean(current.is_country_office);
  const country = 'country_code' in row ? row.country_code : current.country_code;
  row.is_country_office = isOffice;
  if (!isOffice) { row.country_code = null; return; }
  if (!country || !countryByCode(String(country).toUpperCase())) {
    const e = new Error('A country office needs a country: pick an African Union member state.'); e.status = 400; throw e;
  }
  row.country_code = String(country).toUpperCase();
}

/**
 * Defaults of a new country office (D-20261028-01): code « <ISO3>-CO », name
 * « <Country> Country Office », level directorate. One office per country.
 *
 * @param {object} row - create payload already checked by applyCountryOffice
 * @returns {Promise<void>}
 * @throws {Error} 409 when the country already has an office
 */
async function fillCountryOffice(row) {
  const existing = await db('division_codes').where({ is_country_office: true, country_code: row.country_code }).first('code');
  if (existing) {
    const e = new Error(`${countryByCode(row.country_code).name} already has a country office (${existing.code}).`);
    e.status = 409; throw e;
  }
  if (!row.code) row.code = `${row.country_code}-CO`;
  if (!row.division_name) row.division_name = `${countryByCode(row.country_code).name} Country Office`;
  if (!row.level_type) row.level_type = ORG_LEVEL_TYPES.DIRECTORATE;
}

// ── Reads ─────────────────────────────────────────────────────────────

/**
 * Return the full division_codes table flat, enriched with `user_count` per row.
 *
 * The frontend builds the hierarchical tree from `parent_code`. By default
 * alias rows are excluded — pass `{ includeAliases: true }` to include them.
 *
 * @param {object} [options]
 * @param {boolean} [options.includeAliases=false] — include rows whose `alias_of` is set
 * @returns {Promise<Array<object>>} division rows with numeric `user_count`
 * @throws {Error} when the DB query fails
 * @example
 * const tree = await getDivisionTree();
 */
const getDivisionTree = async ({ includeAliases = false } = {}) => {
  const q = db('division_codes as d')
    .leftJoin('user_divisions as ud', 'ud.division_code', 'd.code')
    .select(
      'd.code',
      'd.parent_code',
      'd.alias_of',
      'd.level_type',
      'd.division_name',
      'd.directorate',
      'd.office',
      'd.sort_order',
      'd.responsible_user_id',
      'd.m_and_e_user_id',
      'd.is_country_office',
      'd.country_code',
      // Focal persons are a team of user_divisions rows (D-20261106-09).
      db.raw('GROUP_CONCAT(DISTINCT CASE WHEN ud.role = ? THEN ud.user_id END ORDER BY ud.user_id) AS focal_user_ids', [FOCAL_PERSON])
    )
    .countDistinct('ud.user_id as user_count')
    .groupBy(
      'd.code', 'd.parent_code', 'd.alias_of', 'd.level_type',
      'd.division_name', 'd.directorate', 'd.office', 'd.sort_order',
      'd.responsible_user_id', 'd.m_and_e_user_id',
      'd.is_country_office', 'd.country_code'
    )
    .orderByRaw('COALESCE(d.parent_code, ""), d.sort_order, d.code');
  if (!includeAliases) q.whereNull('d.alias_of');
  const rows = await q;
  // user_count comes back as a string from MySQL count() — coerce to number
  return rows.map(r => ({
    ...r,
    user_count: Number(r.user_count || 0),
    focal_user_ids: r.focal_user_ids ? String(r.focal_user_ids).split(',').map(Number) : [],
  }));
};

/**
 * Fetch a single division_codes row by its code.
 *
 * @param {string} code — division code
 * @returns {Promise<object|undefined>} division row or undefined
 * @throws {Error} when the DB query fails
 * @example
 * const d = await getDivisionByCode('DPHI');
 */
const getDivisionByCode = (code) =>
  db('division_codes').where('code', code).first();

/**
 * Detailed view of one division — used by the org-chart detail page.
 * Returns the row itself enriched with:
 *   - parent: { code, division_name } | null
 *   - ancestors: [{code, division_name}] from top → parent (breadcrumb path)
 *   - children: [{code, division_name, user_count}]
 *   - users:    [{id, full_name, email, roles[]}]
 *
 * Mirrors getDivisionTree's user-count enrichment so the UI can show "this
 * division has N people in it" + the user list inline.
 */
const getDivisionDetail = async (code) => {
  const row = await db('division_codes').where('code', code).first();
  if (!row) return null;

  // Walk parents up for the breadcrumb path
  const ancestors = [];
  // Nearest ancestor holding a responsible: the approver a division without
  // its own head inherits (same rule as the workflow engine, D-20261009-03).
  let inheritedFrom = null;
  let cursor = row.parent_code;
  const seen = new Set();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const p = await db('division_codes').where('code', cursor)
      .select('code', 'division_name', 'parent_code', 'level_type', 'responsible_user_id').first();
    if (!p) break;
    ancestors.unshift({ code: p.code, division_name: p.division_name });
    if (!inheritedFrom && p.responsible_user_id) {
      inheritedFrom = { code: p.code, division_name: p.division_name, level_type: p.level_type, user_id: p.responsible_user_id };
    }
    cursor = p.parent_code;
  }

  // Direct children + their user counts (from user_divisions)
  const children = await db('division_codes as d')
    .leftJoin('user_divisions as ud', 'ud.division_code', 'd.code')
    .where('d.parent_code', code)
    .select('d.code', 'd.division_name', 'd.sort_order', 'd.level_type')
    .countDistinct('ud.user_id as user_count')
    .groupBy('d.code', 'd.division_name', 'd.sort_order', 'd.level_type')
    .orderBy(['d.sort_order', 'd.code']);
  children.forEach(c => { c.user_count = Number(c.user_count || 0); });

  // Users assigned to THIS division via user_divisions (single source of truth)
  const udRows = await db('user_divisions').where('division_code', code).select('user_id', 'role');
  const userIds = [...new Set(udRows.map(r => r.user_id))];
  const users = userIds.length > 0
    ? await db('users as u')
        .whereIn('u.id', userIds)
        .select('u.id', 'u.full_name', 'u.title', 'u.first_name', 'u.last_name', 'u.email', 'u.status')
    : [];
  // Attach global roles + division-specific role from user_divisions
  if (users.length) {
    const roleRows = await db('user_roles')
      .join('roles', 'user_roles.role_id', 'roles.id')
      .whereIn('user_roles.user_id', users.map(u => u.id))
      .select('user_roles.user_id', 'roles.code', 'roles.name');
    const byUser = {};
    roleRows.forEach(r => {
      (byUser[r.user_id] = byUser[r.user_id] || []).push({ code: r.code, name: r.name });
    });
    // Division-specific roles from user_divisions
    const udByUser = {};
    udRows.forEach(r => {
      (udByUser[r.user_id] = udByUser[r.user_id] || []).push(r.role);
    });
    users.forEach(u => {
      u.roles = byUser[u.id] || [];
      u.division_roles = udByUser[u.id] || [];
    });
  }

  // Aliases that point at THIS row (this row is the canonical)
  const aliases = await db('division_codes')
    .where('alias_of', code)
    .select('code', 'division_name');

  // If THIS row is itself an alias, fetch the canonical so the UI can link
  let canonical = null;
  if (row.alias_of) {
    canonical = await db('division_codes')
      .where('code', row.alias_of)
      .select('code', 'division_name')
      .first();
  }

  // Resolve responsible_user_id / m_and_e_user_id → user names so the org
  // detail page can show the approver and the M&E officer without a second
  // round-trip. Focal persons come with `users` (division_roles).
  const assigneeIds = [
    row.responsible_user_id,
    row.m_and_e_user_id,
    inheritedFrom && inheritedFrom.user_id,
  ].filter(Boolean);
  let usersById = {};
  if (assigneeIds.length) {
    const userRows = await db('users')
      .whereIn('id', assigneeIds)
      .select('id', 'full_name', 'title', 'first_name', 'last_name', 'email');
    usersById = Object.fromEntries(userRows.map((u) => [u.id, u]));
  }
  const responsible_user = row.responsible_user_id ? usersById[row.responsible_user_id] || null : null;
  const m_and_e_user = row.m_and_e_user_id ? usersById[row.m_and_e_user_id] || null : null;
  // Only meaningful when this row has no responsible of its own.
  const inherited_responsible = !row.responsible_user_id && inheritedFrom
    ? { ...inheritedFrom, user: usersById[inheritedFrom.user_id] || null }
    : null;

  return {
    ...row,
    parent: ancestors.length ? ancestors[ancestors.length - 1] : null,
    ancestors,
    children,
    users,
    aliases,        // list of rows aliasing THIS one
    canonical,      // the row THIS one is an alias of (if any)
    responsible_user, // resolved responsible / HOD record (or null)
    m_and_e_user,   // resolved M&E officer record (or null)
    inherited_responsible, // nearest ancestor approver when this row has no responsible
  };
};

// ── Writes ────────────────────────────────────────────────────────────

/**
 * Update a division's mutable fields. Used by drag/drop reparent +
 * sort_order updates and the "edit name" inline form.
 *
 * Cycle protection: refuses any parent_code that would put a node under one
 * of its own descendants (or itself), which would otherwise create an
 * infinite loop in the tree.
 */
const updateDivision = async (code, patch) => {
  const allowed = [
    'parent_code', 'alias_of', 'level_type', 'sort_order',
    'division_name', 'directorate', 'office',
    // Single holders (FK to users.id, nullable; null detaches). Focal persons
    // are user_divisions rows, set through the assignments endpoints.
    'responsible_user_id', 'm_and_e_user_id',
    'is_country_office', 'country_code',
  ];
  const update = {};
  for (const k of allowed) {
    if (k in patch) update[k] = patch[k];
  }
  if (Object.keys(update).length === 0) return getDivisionByCode(code);
  if ('is_country_office' in update || 'country_code' in update) {
    applyCountryOffice(update, await getDivisionByCode(code));
  }

  // level_type validation — must be one of the 3 allowed values, or null
  if ('level_type' in update && update.level_type !== null) {
    if (!VALID_LEVEL_TYPES.has(update.level_type)) {
      const e = new Error(`level_type must be one of: directorate, division, unit`);
      e.status = 400; throw e;
    }
  }

  // responsible/m&e validation — if set, the user must exist (FK would catch
  // it but we want a clean 400 with a friendly message).
  for (const field of ['responsible_user_id', 'm_and_e_user_id']) {
    if (field in update && update[field] != null) {
      const userId = Number(update[field]);
      if (!Number.isFinite(userId)) {
        const e = new Error(`${field} must be a numeric user id or null`);
        e.status = 400; throw e;
      }
      const u = await db('users').where('id', userId).first();
      if (!u) {
        const e = new Error(`${field} ${userId}: user not found`);
        e.status = 400; throw e;
      }
      update[field] = userId;
    }
  }

  // Cycle check on reparent
  if ('parent_code' in update && update.parent_code) {
    if (update.parent_code === code) {
      const e = new Error('A division cannot be its own parent'); e.status = 400; throw e;
    }
    // Walk up from the proposed parent — if we hit `code`, it's a cycle.
    let cursor = update.parent_code;
    const seen = new Set();
    while (cursor) {
      if (cursor === code) {
        const e = new Error('Cycle detected — cannot place a division under one of its descendants');
        e.status = 400; throw e;
      }
      if (seen.has(cursor)) break; // safety against pre-existing corruption
      seen.add(cursor);
      const row = await db('division_codes').where('code', cursor).select('parent_code').first();
      cursor = row && row.parent_code;
    }
  }

  // Alias validation
  if ('alias_of' in update && update.alias_of) {
    if (update.alias_of === code) {
      const e = new Error('A division cannot be an alias of itself'); e.status = 400; throw e;
    }
    const target = await db('division_codes').where('code', update.alias_of).first();
    if (!target) {
      const e = new Error(`Target division "${update.alias_of}" does not exist`); e.status = 400; throw e;
    }
    if (target.alias_of) {
      const e = new Error(`"${update.alias_of}" is itself an alias — alias chains are not allowed. Point at the canonical instead.`);
      e.status = 400; throw e;
    }
    // Refuse to alias a row that already has dependants aliasing IT
    const inboundAliases = await db('division_codes').where('alias_of', code).first();
    if (inboundAliases) {
      const e = new Error(`"${code}" is the canonical for other aliases — cannot turn it into an alias itself.`);
      e.status = 400; throw e;
    }
  }

  // Holder fields (responsible / M&E) go through the shared
  // divisionAssignmentService so division_codes and user_divisions stay in
  // step with the user edit window. Non-holder fields stay on this row only.
  await db.transaction(async (trx) => {
    const plain = {};
    for (const k of Object.keys(update)) {
      if (!divisionAssignmentService.HOLDER_FIELDS.includes(k)) plain[k] = update[k];
    }
    if (Object.keys(plain).length > 0) {
      await trx('division_codes').where('code', code).update(plain);
    }
    for (const field of divisionAssignmentService.HOLDER_FIELDS) {
      if (field in update) {
        await divisionAssignmentService.applyHolderChange(trx, { code, field, userId: update[field] });
      }
    }
  });
  // Invalidate alias cache if alias_of itself changed
  if ('alias_of' in update) {
    const { invalidateAliasCache } = require('../divisionAliasService');
    invalidateAliasCache();
  }
  return getDivisionByCode(code);
};

/**
 * Insert a new division_codes row after validating code/name/level_type, parent existence and uniqueness.
 *
 * @param {object} data — `code`, `division_name`, `directorate`, `office`, `parent_code`, `sort_order`, `level_type`, `is_country_office`, `country_code` (D-20261026-05)
 * @returns {Promise<object|undefined>} the created division row
 * @throws {Error} 400 for invalid inputs / missing parent, 409 for duplicate codes
 * @example
 * await createDivision({ code: 'NEW', division_name: 'New Division', parent_code: 'DIR' });
 */
const createDivision = async (data) => {
  const allowed = ['code', 'division_name', 'directorate', 'office', 'parent_code', 'sort_order', 'level_type',
    'is_country_office', 'country_code'];
  const row = {};
  for (const k of allowed) if (k in data) row[k] = data[k];
  applyCountryOffice(row);
  if (row.is_country_office) await fillCountryOffice(row);
  if (!row.code || !row.division_name) {
    const e = new Error('code and division_name are required'); e.status = 400; throw e;
  }
  if (row.level_type && !VALID_LEVEL_TYPES.has(row.level_type)) {
    const e = new Error(`level_type must be one of: directorate, division, unit`); e.status = 400; throw e;
  }
  if (typeof row.sort_order !== 'number') row.sort_order = 0;

  // Fail fast on duplicate key (MySQL 1062) with a friendly message so the
  // UI can show "Code already exists" instead of leaking the raw INSERT
  // statement to the user.
  const clash = await db('division_codes').where('code', row.code).first();
  if (clash) {
    const e = new Error(`Code "${row.code}" already exists — pick a different code or edit the existing row.`);
    e.status = 409; throw e;
  }
  // Parent existence check (cheap, avoids a confusing FK error).
  if (row.parent_code) {
    const parent = await db('division_codes').where('code', row.parent_code).first();
    if (!parent) {
      const e = new Error(`Parent "${row.parent_code}" does not exist.`);
      e.status = 400; throw e;
    }
  }

  try {
    await db('division_codes').insert(row);
  } catch (err) {
    if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
      const e = new Error(`Code "${row.code}" already exists.`); e.status = 409; throw e;
    }
    throw err;
  }
  return getDivisionByCode(row.code);
};

/**
 * Delete a division_codes row — refuses if it still has children or assigned users.
 *
 * @param {string} code — division code
 * @returns {Promise<{ok: boolean}>}
 * @throws {Error} 409 when the row still has dependants (children / users)
 * @example
 * await deleteDivision('OBSOLETE');
 */
const deleteDivision = async (code) => {
  // Refuse if any child still references this row
  const hasChildren = await db('division_codes').where('parent_code', code).first();
  if (hasChildren) {
    const e = new Error('Cannot delete: this division has children. Move them first.');
    e.status = 409; throw e;
  }
  // Refuse if any user references this division (FK protection)
  const hasUsers = await db('users').where('division_code', code).first();
  if (hasUsers) {
    const e = new Error('Cannot delete: this division still has users assigned to it.');
    e.status = 409; throw e;
  }
  await db('division_codes').where('code', code).del();
  return { ok: true };
};

module.exports = {
  getDivisionTree,
  getDivisionByCode,
  getDivisionDetail,
  updateDivision,
  createDivision,
  deleteDivision,
};
