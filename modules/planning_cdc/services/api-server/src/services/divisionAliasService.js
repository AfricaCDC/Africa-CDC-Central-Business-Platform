/* eslint-disable complexity, max-depth --
 * Pre-existing graph walks carried verbatim: buildAliasMap transitive
 * closure (complexity 11, depth 5) and getDirectorateChildren BFS
 * (complexity 14). Decomposing them obscures the closure/BFS shape for
 * zero clarity gain; ceiling pragma, do NOT add new violations. */
/**
 * Division alias resolver.
 *
 * Resolves a division_code to its "scope" — the set of codes that should
 * be treated as equivalent (the code itself + any aliased/canonical
 * siblings).
 *
 * Rule of thumb (confirmed by Lenny 2026-04-14):
 *   "L'alias EST la division."
 *   If X is focal/responsible/member of a division, they are also
 *   focal/responsible/member of every alias of that division.
 *
 * Cached for 60 seconds to avoid hammering the DB on every request.
 */

const db = require('../config/db');

let cacheAt = 0;
let cacheMap = null; // Map<codeUpper, Set<codeUpper>>
const TTL_MS = 60 * 1000;

async function buildAliasMap() {
  const rows = await db('division_codes').select('code', 'alias_of');
  const map = new Map();
  const touch = (a, b) => {
    const A = a.toUpperCase();
    const B = b.toUpperCase();
    if (!map.has(A)) map.set(A, new Set([A]));
    if (!map.has(B)) map.set(B, new Set([B]));
    map.get(A).add(B);
    map.get(B).add(A);
  };
  for (const r of rows) {
    if (!r.code) continue;
    const K = r.code.toUpperCase();
    if (!map.has(K)) map.set(K, new Set([K]));
    if (r.alias_of) touch(r.code, r.alias_of);
  }
  // Transitive closure — if A↔B and B↔C, then A↔C.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [, set] of map) {
      for (const v of set) {
        const peers = map.get(v);
        if (!peers) continue;
        for (const p of peers) {
          if (!set.has(p)) { set.add(p); changed = true; }
        }
      }
    }
  }
  return map;
}

async function getMap() {
  const now = Date.now();
  if (cacheMap && now - cacheAt < TTL_MS) return cacheMap;
  cacheMap = await buildAliasMap();
  cacheAt = now;
  return cacheMap;
}

/**
 * Invalidate the in-memory cache. Call after any division_codes mutation
 * (create/update alias_of/delete) so the next request sees fresh data.
 */
function invalidateAliasCache() {
  cacheMap = null;
  cacheAt = 0;
}

/**
 * Return the array of division codes equivalent to `code` (including
 * itself). Case-preserved: returns codes as stored in the DB (upper-cased
 * for matching, but consumers should compare case-insensitively).
 *
 * @param {string|null|undefined} code
 * @returns {Promise<string[]>}
 */
async function resolveAliases(code) {
  if (!code) return [];
  const map = await getMap();
  const K = String(code).toUpperCase();
  const set = map.get(K);
  if (!set) return [code];
  return Array.from(set);
}

/**
 * True if `a` and `b` are the same division (direct match OR alias
 * relation, in either direction).
 */
async function sameDivision(a, b) {
  if (!a || !b) return false;
  if (String(a).toUpperCase() === String(b).toUpperCase()) return true;
  const aliases = await resolveAliases(a);
  return aliases.some((c) => c.toUpperCase() === String(b).toUpperCase());
}

/**
 * Return all division codes that sit under `directorateCode` in the
 * org hierarchy — i.e. every row where `parent_code` transitively
 * resolves up to the directorate. Includes the directorate itself so a
 * user attached directly to it also "sees" his own home row.
 *
 * Alias-aware: if DDS is alias_of Legal and Legal's parent is FMG, then
 * DDS is returned too.
 *
 * @param {string} directorateCode
 * @returns {Promise<string[]>}
 */
async function getDirectorateChildren(directorateCode) {
  if (!directorateCode) return [];
  const rows = await db('division_codes').select('code', 'parent_code', 'alias_of');
  const parentOf = new Map();  // code → parent_code
  const aliases = new Map();   // alias code → canonical
  for (const r of rows) {
    if (!r.code) continue;
    parentOf.set(r.code.toUpperCase(), r.parent_code ? r.parent_code.toUpperCase() : null);
    if (r.alias_of) aliases.set(r.code.toUpperCase(), r.alias_of.toUpperCase());
  }
  const target = directorateCode.toUpperCase();
  const out = new Set([target]);
  // BFS down from the directorate
  for (const r of rows) {
    if (!r.code) continue;
    let cur = r.code.toUpperCase();
    // Walk up (parent + alias redirection) until we hit target or null
    const seen = new Set();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      if (cur === target) { out.add(r.code.toUpperCase()); break; }
      const aliasTarget = aliases.get(cur);
      if (aliasTarget && !seen.has(aliasTarget)) { cur = aliasTarget; continue; }
      cur = parentOf.get(cur);
    }
  }
  // Expand each member through alias equivalence so scope covers aliases too
  const expanded = new Set();
  for (const c of out) {
    const eq = await resolveAliases(c);
    eq.forEach((x) => expanded.add(x.toUpperCase()));
  }
  return Array.from(expanded);
}

/**
 * Return every directorate code the user is attached to, either via:
 *   1. users.division_code pointing directly at a directorate
 *   2. division_codes.responsible_user_id (assigned as Director)
 *   3. user_divisions junction table (focal persons included)
 *
 * @param {number} userId
 * @returns {Promise<string[]>} directorate codes (upper-cased, unique)
 */
async function getDirectoratesForUser(userId) {
  if (!userId) return [];
  const out = new Set();

  // (1) Direct attachment via users.division_code
  const me = await db('users').where('id', userId).first();
  if (me && me.division_code) {
    const row = await db('division_codes').where('code', me.division_code).first();
    // eslint-disable-next-line no-restricted-syntax -- level_type/scope column-enum value, not ENTITY_TYPES (P-31)
    if (row && row.level_type === 'directorate') out.add(row.code.toUpperCase());
  }

  // (2) Responsible on a directorate row
  const assigned = await db('division_codes')
    .where('responsible_user_id', userId)
    // eslint-disable-next-line no-restricted-syntax -- level_type/scope column-enum value, not ENTITY_TYPES (P-31)
    .andWhere('level_type', 'directorate')
    .select('code');
  for (const r of assigned) out.add(r.code.toUpperCase());

  // (3) user_divisions junction
  const hasUD = await db.schema.hasTable('user_divisions');
  if (hasUD) {
    const udRows = await db('user_divisions as ud')
      .join('division_codes as d', 'd.code', 'ud.division_code')
      .where('ud.user_id', userId)
      // eslint-disable-next-line no-restricted-syntax -- level_type/scope column-enum value, not ENTITY_TYPES (P-31)
      .andWhere('d.level_type', 'directorate')
      .select('d.code');
    for (const r of udRows) out.add(r.code.toUpperCase());
  }

  return Array.from(out);
}

/**
 * Resolve a division code to its top-level directorate code (the ancestor
 * with level_type='directorate'), following alias redirection. Returns null
 * when the code is unknown or no directorate ancestor exists.
 *
 * @param {string} code
 * @returns {Promise<string|null>} upper-cased directorate code or null
 * @example await getDirectorateOf('CLDS'); // 'CLSN'
 */
async function getDirectorateOf(code) {
  if (!code) return null;
  const rows = await db('division_codes').select('code', 'parent_code', 'alias_of', 'level_type');
  const byCode = new Map(rows.map((r) => [r.code.toUpperCase(), r]));
  let cur = byCode.get(String(code).toUpperCase());
  const seen = new Set();
  while (cur && !seen.has(cur.code.toUpperCase())) {
    seen.add(cur.code.toUpperCase());
    // eslint-disable-next-line no-restricted-syntax -- level_type column-enum value, not ENTITY_TYPES (P-31)
    if (cur.level_type === 'directorate') return cur.code.toUpperCase();
    const next = cur.alias_of || cur.parent_code;
    cur = next ? byCode.get(String(next).toUpperCase()) : null;
  }
  return null;
}

/**
 * Find the nearest holder of a division_codes pointer at or above `code`:
 * the row itself (after one alias hop), then its parent chain. This is the
 * approver rule shared by the workflow engines and the notification
 * resolvers (D-20261009-03): a unit without a head is approved by its
 * division head, a division without a head by its directorate's director.
 * With `minLevel`, rows below that level_type are skipped (DIRECTOR steps:
 * start at the directorate ancestor).
 *
 * @param {import('knex').Knex} knex — connection or transaction to read with
 * @param {string|null} code — division code (alias allowed)
 * @param {string} field — 'responsible_user_id' | 'm_and_e_user_id'
 * @param {{minLevel?: string}} [opts] — ORG_LEVEL_TYPES value to climb to first
 * @returns {Promise<number|null>} user id, or null when nobody holds the pointer up the chain
 * @example
 * await resolveHolderUpChain(db, 'CLDS', 'responsible_user_id'); // CLDS head, else CLSN director
 */
async function resolveHolderUpChain(knex, code, field, { minLevel = null } = {}) {
  let cur = code;
  let reached = !minLevel;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const row = await knex('division_codes')
      .where('code', cur)
      .select('code', 'alias_of', 'parent_code', 'level_type', field)
      .first();
    if (!row) return null;
    if (row.alias_of) { cur = row.alias_of; continue; }
    if (!reached && row.level_type === minLevel) reached = true;
    if (reached && row[field]) return Number(row[field]);
    cur = row.parent_code;
  }
  return null;
}

// DG groups heterogeneous independent entities (RCCs, PIU, Legal, HR…) —
// NOT a thematic reporting family (D-20260710-01, Lenny's call).
const NON_FAMILY_DIRECTORATES = new Set(['DG']);

/**
 * True when two divisions belong to the SAME thematic directorate — the
 * "reporting family" rule (D-20260710-01): a contributor reporting inside
 * its own directorate counts as the main division having reported.
 *
 * @param {string} codeA
 * @param {string} codeB
 * @returns {Promise<boolean>} false for DG-grouped divisions
 * @example await sameDirectorate('CLDS', 'PGI'); // true (both CLSN)
 */
async function sameDirectorate(codeA, codeB) {
  if (!codeA || !codeB) return false;
  const [dA, dB] = await Promise.all([getDirectorateOf(codeA), getDirectorateOf(codeB)]);
  return Boolean(dA) && dA === dB && !NON_FAMILY_DIRECTORATES.has(dA);
}

/**
 * Return every division code the user can act on under the 'division'
 * scope. Includes user.division_code (alias-expanded) + every division
 * they're focal/responsible/M&E for (via division_codes + user_divisions).
 *
 * @param {number} userId
 * @returns {Promise<Set<string>>}
 */
async function getUserDivisionScope(userId) {
  const codes = new Set();
  // Single source of truth: user_divisions table
  const udRows = await db('user_divisions')
    .where('user_id', userId)
    .select('division_code');
  for (const r of udRows) {
    const aliases = await resolveAliases(r.division_code);
    aliases.forEach((c) => codes.add(c.toUpperCase()));
  }
  return codes;
}

/**
 * Given a user and a target division code, decide if the user's RBAC
 * scope actually covers that division. Single source of truth for scope
 * resolution across all route handlers.
 *
 * @param {object} user - req.user (needs id, division_code)
 * @param {string|null} scope - 'all' | 'directorate' | 'division' | 'own' | null
 * @param {string|null} targetDivisionCode
 * @returns {Promise<boolean>}
 */
async function scopeCoversDivision(user, scope, targetDivisionCode) {
  if (!scope) return false;
  if (scope === 'all') return true;
  if (!targetDivisionCode) return false;
  const target = String(targetDivisionCode).toUpperCase();

  // eslint-disable-next-line no-restricted-syntax -- level_type/scope column-enum value, not ENTITY_TYPES (P-31)
  if (scope === 'division') {
    const myDivs = await getUserDivisionScope(user.id);
    return myDivs.has(target);
  }
  // eslint-disable-next-line no-restricted-syntax -- level_type/scope column-enum value, not ENTITY_TYPES (P-31)
  if (scope === 'directorate') {
    const directorates = await getDirectoratesForUser(user.id);
    for (const d of directorates) {
      const children = await getDirectorateChildren(d);
      if (children.some((c) => c.toUpperCase() === target)) return true;
    }
    return false;
  }
  // 'own' is handled by caller (needs owner column)
  return false;
}

module.exports = {
  resolveAliases,
  sameDivision,
  invalidateAliasCache,
  getDirectorateChildren,
  getDirectoratesForUser,
  getDirectorateOf,
  resolveHolderUpChain,
  sameDirectorate,
  getUserDivisionScope,
  scopeCoversDivision,
};
