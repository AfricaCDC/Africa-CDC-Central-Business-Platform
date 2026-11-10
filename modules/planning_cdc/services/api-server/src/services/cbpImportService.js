// ── CBP Staff Import Service ──
//
// One-click import of CBP staff into `users` (D-20260713-01). Reuses
// cbpService (basic-auth against the real CBP share endpoints) — NOT the
// never-wired sync-service/X-API-Key design.
//
// Scope rule (Lenny): only staff whose work email is on the given domain
// (default africacdc.org — those accounts can sign in via Microsoft SSO
// immediately). Existing users are never overwritten: we only backfill an
// empty cbp_id / full_name.
//
// Division (D-20261009-03, Lenny: "mets les gens dans leur division based on
// CBP — ceux qui n'ont pas de division, les autres touche pas"): a user with
// NO user_divisions row and an empty users.division_code is placed as a
// primary MEMBER of the division whose `division_cbp_id` equals the CBP
// record's division id. Exact id only (never a name match), alias rows
// skipped, anyone who already has a division is left alone.

'use strict';

const db = require('../config/db');
const cbpService = require('./cbpService');
const divisionAssignmentService = require('./divisionAssignmentService');
const { DIVISION_ASSIGNMENT_ROLES } = require('@rbm/lib/user-divisions');
const { createLogger } = require('@rbm/lib/logger');

const log = createLogger('api-server').child({ module: 'cbpImportService' });

/**
 * Structured name fields from a CBP staff record.
 *
 * @param {{firstName?:string, otherName?:string, lastName?:string}} s — CBP staff record
 * @returns {{first_name:?string, middle_name:?string, last_name:?string}}
 * @example nameFieldsOf({ firstName: 'Ada', lastName: 'K' }) // { first_name: 'Ada', middle_name: null, last_name: 'K' }
 */
function nameFieldsOf(s) {
  return {
    first_name: s.firstName || null,
    middle_name: s.otherName || null,
    last_name: s.lastName || null,
  };
}

/** De-duped {email, cbp_id, full_name} records for the given domain suffix. */
function buildEligible(staff, suffix) {
  const eligible = [];
  const seen = new Set();
  for (const s of staff) {
    const email = String(s.workEmail || '').trim().toLowerCase();
    if (!email.endsWith(suffix) || seen.has(email)) continue;
    seen.add(email);
    eligible.push({
      email,
      cbp_id: s.staffId || null,
      division_cbp_id: s.divisionId || null,
      full_name: `${s.firstName || ''} ${s.lastName || ''}`.trim() || email,
      ...nameFieldsOf(s),
    });
  }
  return eligible;
}

/** Insert a missing user, or backfill an existing one — never overwrite. */
/**
 * Structured name fields to fill on an existing account. Each field is backfilled
 * independently: rows created before the name split (or by an older import) carry
 * full_name only, and populated values are never overwritten.
 *
 * @param {object} existing — the platform user row
 * @param {object} rec — the CBP record (see nameFieldsOf)
 * @returns {object} patch with only the empty fields that CBP can fill
 * @example backfillNameFields({ first_name: null, last_name: 'M' }, { first_name: 'Ben', last_name: 'X' }) // { first_name: 'Ben' }
 */
function backfillNameFields(existing, rec) {
  const patch = {};
  for (const key of ['first_name', 'middle_name', 'last_name']) {
    if (!existing[key] && rec[key]) patch[key] = rec[key];
  }
  return patch;
}

/**
 * Fields to write on an account that already exists.
 *
 * Backfill-only by design — admin edits are never clobbered — with ONE
 * exception: when the row was matched on `cbp_id` instead of email, the address
 * changed upstream and the corrected email is authoritative.
 *
 * @param {object} existing — the platform user row
 * @param {{email:string, cbp_id:?string, full_name:string, first_name:?string, middle_name:?string, last_name:?string}} rec — the CBP record
 * @param {boolean} matchedByEmail — false when reconciled via cbp_id
 * @returns {object} patch, empty when the account is already up to date
 * @example buildPatch({ email: 'old@x.org' }, { email: 'new@x.org' }, false)
 */
function buildPatch(existing, rec, matchedByEmail, cbpIdToWrite) {
  const patch = {};
  if (!matchedByEmail && existing.email !== rec.email) patch.email = rec.email;
  if (cbpIdToWrite) patch.cbp_id = cbpIdToWrite;
  if (!existing.full_name && rec.full_name) patch.full_name = rec.full_name;
  return { ...patch, ...backfillNameFields(existing, rec) };
}

/**
 * Decide whether `rec.cbp_id` can be backfilled onto `existing`.
 *
 * `cbp_id` carries a UNIQUE index. When the id already belongs to a DIFFERENT
 * row, the two rows are the same human with two accounts — which one keeps the
 * roles and reports is a human decision, so we refuse the write and describe the
 * conflict instead of letting MySQL raise an opaque ER_DUP_ENTRY.
 *
 * @param {object} existing — the platform user row being updated
 * @param {{cbp_id:?string}} rec — the CBP record
 * @returns {Promise<?string>} the id to write, or null when there is nothing to do
 * @throws {Error} when another account already holds this cbp_id
 * @example await resolveCbpId({ id: 1, cbp_id: null }, { cbp_id: '624' })
 */
async function resolveCbpId(existing, rec) {
  if (existing.cbp_id || !rec.cbp_id) return null;
  const holder = await db('users').where('cbp_id', rec.cbp_id).first();
  if (holder && holder.id !== existing.id) {
    throw new Error(
      `duplicate account: CBP id ${rec.cbp_id} already belongs to ${holder.email} (id ${holder.id}); `
      + 'merge the two accounts, then re-run the import',
    );
  }
  return rec.cbp_id;
}

/**
 * Place a user with no division at all into the division bound to the CBP
 * record's division id (`division_codes.division_cbp_id`). Users who already
 * have any user_divisions row or a users.division_code are never touched.
 *
 * @param {{id:number, division_code:?string}} user — platform user (id + legacy column)
 * @param {{division_cbp_id:?string}} rec — the CBP record
 * @param {boolean} dryRun — count without writing
 * @param {{divisions_filled:number}} summary — mutated
 * @returns {Promise<void>}
 * @example await fillDivision({ id: 7, division_code: null }, { division_cbp_id: '12' }, false, summary)
 */
async function fillDivision(user, rec, dryRun, summary) {
  if (!rec.division_cbp_id || !user || user.division_code) return;
  if (user.id) {
    const hasDivision = await db('user_divisions').where('user_id', user.id).first('id');
    if (hasDivision) return;
  }
  const division = await db('division_codes')
    .where('division_cbp_id', rec.division_cbp_id)
    .whereNull('alias_of')
    .first('code');
  if (!division) return;
  if (!dryRun) {
    await db.transaction(async (trx) => {
      await divisionAssignmentService.addDivisionRole(trx, {
        userId: user.id, code: division.code, role: DIVISION_ASSIGNMENT_ROLES.MEMBER, isPrimary: true,
      });
      await trx('users').where('id', user.id).update({ division_code: division.code });
    });
  }
  summary.divisions_filled += 1;
}

async function upsertOne(rec, dryRun, summary) {
  const byEmail = await db('users').whereRaw('LOWER(email) = ?', [rec.email]).first();
  // A miss on email does NOT prove the person is new: CBP occasionally corrects
  // a work address (typo fix, name change). `cbp_id` is the stable identity and
  // carries the UNIQUE index uq_users_cbp_id, so inserting on a stale email miss
  // aborts the entire run with ER_DUP_ENTRY (D-20260902-01: staffId 725 was
  // "clmpumpu@" in the platform after CBP fixed it to "cimpumpu@"). Reconcile on
  // cbp_id before concluding the account is missing.
  const existing = byEmail || (rec.cbp_id
    ? await db('users').where('cbp_id', rec.cbp_id).first()
    : null);
  if (!existing) {
    let newId = null;
    if (!dryRun) {
      [newId] = await db('users').insert({
        email: rec.email,
        cbp_id: rec.cbp_id,
        full_name: rec.full_name,
        first_name: rec.first_name,
        middle_name: rec.middle_name,
        last_name: rec.last_name,
        status: 'ACTIVE',
        user_type: 'STAFF',
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
    summary.inserted += 1;
    if (summary.sample.length < 10) summary.sample.push(rec.email);
    // A brand-new account has no division: dry runs count it, real runs place it.
    await fillDivision({ id: newId, division_code: null }, rec, dryRun, summary);
    return;
  }
  const cbpIdToWrite = await resolveCbpId(existing, rec);
  const patch = buildPatch(existing, rec, Boolean(byEmail), cbpIdToWrite);
  if (Object.keys(patch).length) {
    if (!dryRun) {
      await db('users').where('id', existing.id).update({ ...patch, updated_at: new Date() });
    }
    summary.updated += 1;
  } else {
    summary.skipped += 1;
  }
  await fillDivision(existing, rec, dryRun, summary);
}

// ponytail: single-process lock, valid because api-server runs as one replica.
// Move to a DB lock (GET_LOCK) if the service is ever scaled out.
let importInFlight = false;

/**
 * Import CBP staff as platform users.
 *
 * Only one import runs per process; a concurrent call is rejected immediately
 * (IMPORT_IN_PROGRESS) instead of racing the first run's inserts.
 *
 * @param {object} [opts]
 * @param {string} [opts.domain='africacdc.org'] — only import work emails on this domain
 * @param {boolean} [opts.dryRun=false] — compute the summary without writing
 * @returns {Promise<{fetched:number, eligible:number, inserted:number, updated:number, skipped:number, divisions_filled:number, failed:number, dryRun:boolean, sample:string[], failures:Array<{email:string, reason:string}>}>}
 * @throws {Error} code IMPORT_IN_PROGRESS when another import is running (409 by the route)
 * @throws {Error} when the CBP fetch fails (502 by the route)
 * @example const summary = await importCbpUsers({ dryRun: true });
 */
async function importCbpUsers({ domain = 'africacdc.org', dryRun = false } = {}) {
  if (importInFlight) {
    throw Object.assign(new Error('CBP import already running'), { code: 'IMPORT_IN_PROGRESS' });
  }
  importInFlight = true;
  try {
    return await runImport(domain, dryRun);
  } finally {
    importInFlight = false;
  }
}

/**
 * Fetch the CBP directory and upsert every eligible record (see importCbpUsers).
 *
 * @param {string} domain
 * @param {boolean} dryRun
 * @returns {Promise<object>} run summary
 * @throws {Error} when the CBP fetch fails
 */
async function runImport(domain, dryRun) {
  const suffix = `@${String(domain).toLowerCase().replace(/^@/, '')}`;
  const staff = await cbpService.fetchAllStaff(true);
  const eligible = buildEligible(staff, suffix);

  const summary = {
    fetched: staff.length, eligible: eligible.length,
    inserted: 0, updated: 0, skipped: 0, divisions_filled: 0, failed: 0, dryRun, sample: [], failures: [],
  };
  // Per-record isolation: one unwritable row must not sink the other 470.
  for (const rec of eligible) {
    try {
      await upsertOne(rec, dryRun, summary);
    } catch (err) {
      summary.failed += 1;
      summary.failures.push({ email: rec.email, reason: err.code || err.message });
      log.error({ email: rec.email, error: err.message }, 'CBP import: record skipped');
    }
  }

  log.info(summary, 'CBP user import run');
  return summary;
}

module.exports = { importCbpUsers };
