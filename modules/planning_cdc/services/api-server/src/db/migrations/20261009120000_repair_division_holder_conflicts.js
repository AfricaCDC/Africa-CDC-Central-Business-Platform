/**
 * Data repair: one holder per single-holder slot on every canonical division.
 *
 * The division page (division_codes.responsible_user_id / m_and_e_user_id) and
 * the user edit window (user_divisions) drifted apart on production: some
 * divisions had no holder on the page while a user held the role, and some
 * had two holders. services/divisionAssignmentService.js keeps them in step
 * from now on; this migration resolves the rows already in conflict.
 *
 * Rule, applied per canonical division (alias rows mirror their canonical and
 * are skipped) and per slot:
 *   · RESPONSIBLE slot: expected role is DIRECTOR on a directorate, else
 *     HEAD_OF_DIVISION. Candidates are the expected-role rows; when there are
 *     none, the other responsible role is used and the winner is converted.
 *   · M&E slot: candidates are ME_OFFICER rows.
 *   · Winner: most recent user_divisions.assigned_at, then the current
 *     division_codes holder, then the lowest user id.
 *   · Winner's column is written to the division and its alias siblings.
 *   · Every other responsible/M&E row on the division is demoted: updated to
 *     MEMBER when its user has no other row there, otherwise deleted. FOCAL_PERSON
 *     rows are never touched. No user is deleted.
 *
 * Idempotent: a second run finds one holder per slot and changes nothing.
 * Runs inside one transaction. Down is a documented no-op.
 */

const { createLogger } = require('@rbm/lib/logger');
const { DIVISION_ASSIGNMENT_ROLES: R } = require('@rbm/lib/user-divisions');
const { ORG_LEVEL_TYPES } = require('@rbm/lib/enums');

const log = createLogger('api-server').child({ module: 'migration.repairDivisionHolders' });

const SLOTS = [
  {
    field: 'responsible_user_id',
    roles: [R.HEAD_OF_DIVISION, R.DIRECTOR],
    expectedRole: (levelType) => (levelType === ORG_LEVEL_TYPES.DIRECTORATE ? R.DIRECTOR : R.HEAD_OF_DIVISION),
  },
  {
    field: 'm_and_e_user_id',
    roles: [R.ME_OFFICER],
    expectedRole: () => R.ME_OFFICER,
  },
];

/**
 * Comparator for winner selection: newest assigned_at first (missing dates
 * last), then the current holder, then the lowest user id.
 *
 * @param {number|null} currentHolder — division_codes holder for the slot
 * @returns {(a: object, b: object) => number}
 * @example
 * rows.sort(winnerOrder(5));
 */
function winnerOrder(currentHolder) {
  return (a, b) => {
    const ta = a.assigned_at ? new Date(a.assigned_at).getTime() : -Infinity;
    const tb = b.assigned_at ? new Date(b.assigned_at).getTime() : -Infinity;
    if (ta !== tb) return ta < tb ? 1 : -1;
    const ha = Number(a.user_id) === Number(currentHolder) ? 0 : 1;
    const hb = Number(b.user_id) === Number(currentHolder) ? 0 : 1;
    if (ha !== hb) return ha - hb;
    return Number(a.user_id) - Number(b.user_id);
  };
}

/**
 * Demote a losing or superseded slot row. MEMBER when the user has no other
 * row on the division, otherwise delete (never leave a duplicate).
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {{id: number, user_id: number}} row
 * @param {string} divisionCode
 * @returns {Promise<'member'|'deleted'>}
 * @example
 * await demoteRow(trx, { id: 9, user_id: 2 }, 'DPHI');
 */
async function demoteRow(trx, row, divisionCode) {
  const other = await trx('user_divisions')
    .where({ user_id: row.user_id, division_code: divisionCode })
    .whereNot('id', row.id)
    .first('id');
  if (other) {
    await trx('user_divisions').where('id', row.id).del();
    return 'deleted';
  }
  await trx('user_divisions').where('id', row.id).update({ role: R.MEMBER });
  return 'member';
}

/**
 * Resolve one slot of one division. Returns nothing when there are no candidates.
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {{code: string, level_type: string|null}} div
 * @param {{field: string, roles: string[], expectedRole: Function}} slot
 * @param {string[]} siblingCodes — alias rows that mirror this division
 * @param {object} totals — running counters, mutated
 * @returns {Promise<void>}
 * @example
 * await resolveSlot(trx, { code: 'DPHI', level_type: 'division' }, SLOTS[0], [], totals);
 */
async function resolveSlot(trx, div, slot, siblingCodes, totals) {
  const rows = await trx('user_divisions')
    .where('division_code', div.code)
    .whereIn('role', slot.roles)
    .select('id', 'user_id', 'role', 'assigned_at');
  if (rows.length === 0) return;

  const expected = slot.expectedRole(div.level_type);
  const expectedRows = rows.filter((r) => r.role === expected);
  const pool = expectedRows.length ? expectedRows : rows;
  pool.sort(winnerOrder(div[slot.field]));
  const winner = pool[0];

  let converted = false;
  if (winner.role !== expected) {
    await trx('user_divisions').where('id', winner.id).update({ role: expected });
    converted = true;
    totals.rows_converted += 1;
  }

  const losers = rows.filter((r) => r.id !== winner.id);
  const outcomes = { member: [], deleted: [] };
  for (const row of losers) {
    const outcome = await demoteRow(trx, row, div.code);
    outcomes[outcome].push(row.user_id);
    totals[outcome === 'member' ? 'rows_demoted_to_member' : 'rows_deleted'] += 1;
  }

  const columnChanged = Number(div[slot.field]) !== Number(winner.user_id);
  if (columnChanged) {
    await trx('division_codes')
      .whereIn('code', [div.code, ...siblingCodes])
      .update({ [slot.field]: winner.user_id });
    totals.columns_set += 1;
  }
  totals.slots_resolved += 1;

  log.info('division_holder.slot_resolved', {
    division: div.code,
    slot: slot.field,
    winner: winner.user_id,
    converted,
    demoted_to_member: outcomes.member,
    deleted: outcomes.deleted,
    column_changed: columnChanged,
  });
}

/**
 * Apply the holder rule to every canonical division.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 * @example
 * await exports.up(knex);
 */
exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('user_divisions'))) return;

  const totals = {
    divisions: 0, slots_resolved: 0, rows_converted: 0,
    rows_demoted_to_member: 0, rows_deleted: 0, columns_set: 0,
  };

  await knex.transaction(async (trx) => {
    const aliasRows = await trx('division_codes').whereNotNull('alias_of').select('code', 'alias_of');
    const siblingsByCanonical = new Map();
    for (const a of aliasRows) {
      if (!siblingsByCanonical.has(a.alias_of)) siblingsByCanonical.set(a.alias_of, []);
      siblingsByCanonical.get(a.alias_of).push(a.code);
    }

    const divisions = await trx('division_codes')
      .whereNull('alias_of')
      .select('code', 'level_type', 'responsible_user_id', 'm_and_e_user_id');

    for (const div of divisions) {
      totals.divisions += 1;
      for (const slot of SLOTS) {
        await resolveSlot(trx, div, slot, siblingsByCanonical.get(div.code) || [], totals);
      }
    }
  });

  log.info('division_holder.repair_complete', totals);
};

/**
 * Documented no-op. Resolved holders are the correct state; reverting would
 * reintroduce the conflicts.
 *
 * @returns {Promise<void>}
 * @example
 * await exports.down(knex);
 */
exports.down = async function () {
  // No-op by design.
};
