/**
 * Sync CBP staff → users table.
 *
 * Fetches all staff from cbp.africacdc.org via cbpService, filters out
 * expired contracts, and creates a `users` row for each active staff who
 * isn't already in the DB. New users get the STAFF role and are linked to
 * their CBP division (best-effort name match against division_codes).
 *
 * Focal persons and heads of division are derived from focal_points +
 * division_codes and promoted to the appropriate role.
 *
 * Run:
 *   cd services/api-server
 *   node src/scripts/sync_cbp_staff_users.js          # dry-run
 *   node src/scripts/sync_cbp_staff_users.js --apply  # actually insert
 */

require('dotenv').config({ path: '../../.env' });
require('dotenv').config();

const knex = require('knex')(require('../../knexfile')[process.env.NODE_ENV || 'development']);
const { fetchAllStaff } = require('../services/cbpService');

const APPLY = process.argv.includes('--apply');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Contract statuses we keep (drop Expired) */
const KEEP_STATUSES = new Set(['Active', 'Due', 'Under Renewal']);

/**
 * Manual CBP division name → our division_code mapping for cases the
 * fuzzy matcher can't handle (abbreviations, reorgs, etc.).
 */
const MANUAL_DIV_MAP = {
  'Western RCC': 'WARCC',
  'Eastern RCC': 'EARCC',
  'Central RCC': 'CARCC',
  'Southern RCC': 'SARCC',
  'Northern RCC': 'NARCC',
  'Laboratory Networks and Systems': 'LABNET',
  'Supply Chain Division': 'SCM',
  'Public Health Institutes and Research': 'CPHI',
  'Surveillance and Disease Intelligence': 'SDI',
  'Surveillance and Disease Intelligence ': 'SDI',
  'Youth Division': 'YOUTH',
  'Directorate of Communication and Public Information': 'CPI',
  'PIU': 'PIU',
  'Planning Reporting and Accountability': 'PRA',
  'Office of the Deputy Director General': 'DDG',
  'Directorate of External Relations and Strategic Engagements': 'ERSE',
  'Directorate of Science and Innovation': 'SCI',
  'Emergency Preparedness and Response': 'EPR',
  'Community Health Systems & Health Promotion': 'CHSISD',
  'Digital Health and Information Systems': 'Digital',
  'Directorate of Administration': 'ADMIN',
  'Directorate of Administration ': 'ADMIN',
  'Executive Office': 'DG',
  'Directorate of Finance': 'FMG',
  'Centre for Primary Healthcare': 'PHC',
  'National Public Health Institutes': 'NPHI',
  'Sexual Reproductive Maternal Newborn Child and Adolescent Health': 'SRH',
  'Division of Immunization': 'IMZ',
  'Division of Nutrition': 'NUTRI',
  'NCDs, Injuries & Mental Health': 'NCD',
  'AMR & One Health': 'OneH',
  'Pathogen Genomics Institute': 'PGI',
  'Legal Affairs': 'Legal',
  'Human Resource Management': 'HR',
  'Division of MIS': 'MIS',
  'Division of Accounting and Reporting': 'ACC',
  'Division of Programme and Budgeting': 'BGT',
  'Health Economics and Financing': 'HEP',
  'Office of Internal Oversight': 'DIO',
  'Office of the Director General': 'DG',
  'IMST - External': 'PIU',
};

/** Normalize a name for fuzzy matching: lowercase, strip punctuation, titles, collapse whitespace */
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(dr|mr|mrs|ms|prof|prof\.?|hon|hon\.?)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build division_name → code lookup (+ a fuzzy lookup by normalized name) */
async function loadDivisionLookup() {
  const divs = await knex('division_codes').select('code', 'division_name');
  const byExact = new Map();
  const byFuzzy = new Map();
  for (const d of divs) {
    if (d.division_name) {
      byExact.set(d.division_name.trim(), d.code);
      byFuzzy.set(norm(d.division_name), d.code);
    }
  }
  return { byExact, byFuzzy };
}

/** Resolve a CBP division name → our division_code (best effort) */
function resolveDivisionCode(cbpName, lookup) {
  if (!cbpName) return null;
  const trimmed = cbpName.trim();
  // Manual map first (highest precedence)
  if (MANUAL_DIV_MAP[cbpName]) return MANUAL_DIV_MAP[cbpName];
  if (MANUAL_DIV_MAP[trimmed]) return MANUAL_DIV_MAP[trimmed];
  if (lookup.byExact.has(trimmed)) return lookup.byExact.get(trimmed);
  const fuzzy = norm(trimmed);
  if (lookup.byFuzzy.has(fuzzy)) return lookup.byFuzzy.get(fuzzy);
  // Try partial: CBP "Directorate of Administration " vs our "Directorate of Administration"
  for (const [k, v] of lookup.byFuzzy) {
    if (k.startsWith(fuzzy) || fuzzy.startsWith(k)) return v;
  }
  return null;
}

/** Load focal_points (name + division_code for focal, name for HOD via responsible_user_id) */
async function loadFocalsAndHods() {
  const focals = await knex('focal_points').where('is_active', 1).select('focal_person_name', 'division_code');
  const divHods = await knex('division_codes as dc')
    .leftJoin('users as u', 'dc.responsible_user_id', 'u.id')
    .whereNotNull('dc.responsible_user_id')
    .select('dc.code as division_code', 'u.first_name', 'u.last_name', 'u.email');

  const focalByName = new Map();
  for (const f of focals) {
    if (f.focal_person_name) focalByName.set(norm(f.focal_person_name), f.division_code);
  }
  const hodByEmail = new Map();
  for (const h of divHods) {
    if (h.email) hodByEmail.set(h.email.toLowerCase(), h.division_code);
  }
  return { focalByName, hodByEmail };
}

/** Load existing users by email (lowercased) */
async function loadExistingUsersByEmail() {
  const users = await knex('users').select('id', 'email');
  const map = new Map();
  for (const u of users) {
    if (u.email) map.set(u.email.toLowerCase(), u.id);
  }
  return map;
}

/** Load role ids keyed by code */
async function loadRoleIds() {
  const roles = await knex('roles').select('id', 'code');
  const map = new Map();
  for (const r of roles) map.set(r.code, r.id);
  return map;
}

/**
 * Decide which CBP staff become new users, and with which role and division.
 * HEAD_OF_DIVISION wins over FOCAL_PERSON, which wins over STAFF.
 */
function planUsers(keep, { divLookup, existingUsers, focalByName, hodByEmail, roleIds }) {
  const plan = {
    toCreate: 0, toSkip: 0, divMatched: 0, divUnmatched: 0, willBeFocal: 0, willBeHod: 0,
    unmatchedDivSamples: new Set(), createdRows: [],
  };
  for (const s of keep) {
    const email = (s.workEmail || '').trim().toLowerCase();
    if (!email.includes('@') || existingUsers.has(email)) {
      plan.toSkip++;
      continue;
    }

    const divCode = resolveDivisionCode(s.divisionName, divLookup);
    if (divCode) plan.divMatched++;
    else {
      plan.divUnmatched++;
      if (s.divisionName) plan.unmatchedDivSamples.add(s.divisionName);
    }

    // Focal persons are matched by name; focal_points.division_code is the
    // source of truth for their division.
    const focalDivFromFP = focalByName.get(norm(`${s.firstName} ${s.lastName}`));
    let roleCode = 'STAFF';
    if (hodByEmail.has(email)) { roleCode = 'HEAD_OF_DIVISION'; plan.willBeHod++; }
    else if (focalDivFromFP) { roleCode = 'FOCAL_PERSON'; plan.willBeFocal++; }

    plan.toCreate++;
    plan.createdRows.push({
      staff: s,
      email,
      divCode: roleCode === 'FOCAL_PERSON' ? focalDivFromFP : divCode,
      roleId: roleIds[roleCode],
      roleCode,
    });
  }
  return plan;
}

/** Insert the planned users, one transaction each. No password: sign-in is Microsoft only. */
async function insertUsers(createdRows) {
  let inserted = 0;
  let errors = 0;
  for (const { staff: s, email, divCode, roleId } of createdRows) {
    try {
      await knex.transaction(async (trx) => {
        const [userId] = await trx('users').insert({
          email,
          full_name: `${s.firstName} ${s.lastName}`.trim(),
          first_name: s.firstName || null,
          middle_name: s.otherName || null,
          last_name: s.lastName || null,
          title: s.title || null,
          status: 'ACTIVE',
          user_type: 'STAFF',
          division_code: divCode,
        });
        await trx('user_roles').insert({ user_id: userId, role_id: roleId });
      });
      inserted++;
    } catch (err) {
      console.error(`  ✗ Failed for ${email}: ${err.message}`);
      errors++;
    }
  }
  return { inserted, errors };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  CBP Staff Sync — ${APPLY ? 'APPLY MODE' : 'DRY RUN'}`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);

  console.log('→ Fetching all staff from CBP...');
  const staff = await fetchAllStaff();
  console.log(`  Got ${staff.length} staff records from CBP.`);

  // Filter by contract status
  const keep = staff.filter(s => KEEP_STATUSES.has(s.status));
  const dropped = staff.length - keep.length;
  console.log(`  Keeping ${keep.length} (Active/Due/Under Renewal), dropping ${dropped} (Expired/unknown).`);

  // Load reference data
  const divLookup = await loadDivisionLookup();
  const existingUsers = await loadExistingUsersByEmail();
  const { focalByName, hodByEmail } = await loadFocalsAndHods();
  const roleIds = await loadRoleIds();

  const STAFF_ROLE_ID = roleIds.get('STAFF');
  const FOCAL_ROLE_ID = roleIds.get('FOCAL_PERSON');
  const HOD_ROLE_ID = roleIds.get('HEAD_OF_DIVISION');

  if (!STAFF_ROLE_ID) {
    console.error('  ✗ STAFF role not found in DB. Run seed 01_reference_data first.');
    process.exit(1);
  }

  const { toCreate, toSkip, divMatched, divUnmatched, willBeFocal, willBeHod, unmatchedDivSamples, createdRows } = planUsers(keep, {
    divLookup, existingUsers, focalByName, hodByEmail,
    roleIds: { STAFF: STAFF_ROLE_ID, FOCAL_PERSON: FOCAL_ROLE_ID, HEAD_OF_DIVISION: HOD_ROLE_ID },
  });

  console.log(`\n═══ Summary ═══`);
  console.log(`  Would create:      ${toCreate} users`);
  console.log(`    - as STAFF:           ${toCreate - willBeFocal - willBeHod}`);
  console.log(`    - as FOCAL_PERSON:    ${willBeFocal}`);
  console.log(`    - as HEAD_OF_DIVISION:${willBeHod}`);
  console.log(`  Would skip:        ${toSkip} (already exist or no email)`);
  console.log(`  Division matched:  ${divMatched}`);
  console.log(`  Division unmatched:${divUnmatched}`);
  if (unmatchedDivSamples.size > 0) {
    console.log(`    Sample unmatched divisions (need manual mapping):`);
    for (const d of Array.from(unmatchedDivSamples).slice(0, 15)) {
      console.log(`      - "${d}"`);
    }
  }

  if (!APPLY) {
    console.log(`\n(Dry run — no changes written. Re-run with --apply to persist.)\n`);
    await knex.destroy();
    return;
  }

  console.log(`\n→ Applying changes...`);
  const { inserted, errors } = await insertUsers(createdRows);

  console.log(`\n═══ Applied ═══`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Errors:   ${errors}`);
  console.log('  Users sign in with their Microsoft account (no password, D-20261107-03).');

  await knex.destroy();
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
