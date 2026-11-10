// ── Division merge / rename ──
//
// Moves every reference from one division code to another, then deletes the
// old division_codes row.
//   · Rename: the target code does not exist yet. It is created as a copy of
//     the source row (PHAHM → APPM).
//   · Merge:  the target exists. Its empty fields are filled from the source
//     (PHC-ID → ID).
//
// Generalises migration 20260710000000_merge_division_aliases.js. Columns with
// a foreign key to division_codes are read from information_schema, so a new
// table that references division_codes is covered without editing this file.
// Columns that hold a code without a foreign key are listed in SOFT_COLUMNS.
//
// Holder conflicts (two HEAD_OF_DIVISION rows after a merge) are not resolved
// here: assign the responsible again from the division page afterwards.
//
// Every function takes a knex transaction and never commits.

const { APPROVAL_ENTITIES, STATUSES: S } = require('@rbm/lib/enums');

// Code-holding columns without a foreign key to division_codes.
const SOFT_COLUMNS = Object.freeze([
  ['approval_instances', 'division_code'],
  ['approval_instances', 'contrib_org_code'],
  ['approval_instances', 'main_org_code'],
]);

// Columns holding JSON arrays of division codes.
const JSON_CODE_COLUMNS = Object.freeze([
  ['plan_nodes', 'contributing_divisions'],
  ['plan_nodes', 'secondary_division_codes'],
]);

// Tables where a row left behind by UPDATE IGNORE duplicates a row the target
// already has (same user + role, same item). Dropping it loses nothing. Any
// other table with leftovers aborts the whole merge.
const DEDUPE_SAFE_TABLES = Object.freeze(['user_divisions', 'focal_points']);

// division_codes fields the target inherits from the source when empty.
const FILLABLE_FIELDS = Object.freeze([
  // eslint-disable-next-line no-restricted-syntax -- 'directorate' here is the division_codes column name, not an ENTITY_TYPES value (P-31)
  'division_name', 'level_type', 'parent_code', 'directorate', 'office', 'division_cbp_id',
  'responsible_user_id', 'm_and_e_user_id', 'sort_order',
]);

// indicator_division_reports collision: the better status survives. Same
// ranking as the alias merge migration.
const STATUS_RANK = new Map([
  [S.VALIDATED, 6], [S.APPROVED, 6], [S.SUBMITTED, 4], [S.IN_REVIEW, 4], [S.DRAFT, 3], [S.NOT_APPLICABLE, 2], [S.REJECTED, 1],
]);
const rank = (status) => STATUS_RANK.get(status) || 0;

/**
 * Fields of the target row to fill from the source row: only fields that are
 * empty on the target and set on the source. A parent pointing at the target
 * itself is skipped.
 *
 * @param {object} from — source division_codes row
 * @param {object} to — target division_codes row
 * @returns {object} patch for the target row
 * @example
 * buildFillPatch({ level_type: 'division' }, { level_type: null }); // { level_type: 'division' }
 */
function buildFillPatch(from, to) {
  const patch = {};
  for (const field of FILLABLE_FIELDS) {
    if (to[field] != null || from[field] == null) continue;
    if (field === 'parent_code' && from[field] === to.code) continue;
    patch[field] = from[field];
  }
  return patch;
}

/**
 * Which of two colliding report rows to keep.
 *
 * @param {{status: string}} moving — the source row
 * @param {{status: string}} existing — the target row on the same slot
 * @returns {'moving'|'existing'} the row to keep; ties keep the target
 * @example
 * pickReportWinner({ status: STATUSES.APPROVED }, { status: STATUSES.REJECTED }); // 'moving'
 */
function pickReportWinner(moving, existing) {
  return rank(moving.status) > rank(existing.status) ? 'moving' : 'existing';
}

/**
 * Replace a code inside a JSON array column (`contributing_divisions`,
 * `secondary_division_codes`).
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {[string, string]} target — [table, column]
 * @param {string} from
 * @param {string} to
 * @returns {Promise<number>} rows rewritten
 * @example
 * await rewriteContribJson(trx, ['plan_nodes', 'contributing_divisions'], 'PHAHM', 'APPM');
 */
async function rewriteContribJson(trx, [table, column], from, to) {
  if (!(await trx.schema.hasColumn(table, column))) return 0;
  const rows = await trx(table).where(column, 'like', `%${from}%`).select('id', column);
  let changed = 0;
  for (const row of rows) {
    let list;
    try { list = JSON.parse(row[column]); } catch { continue; }
    if (!Array.isArray(list) || !list.includes(from)) continue;
    const mapped = Array.from(new Set(list.map((c) => (c === from ? to : c))));
    await trx(table).where('id', row.id).update({ [column]: JSON.stringify(mapped) });
    changed += 1;
  }
  return changed;
}

/**
 * Delete a division report row and its approval chain.
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {number} reportId
 * @returns {Promise<void>}
 * @example
 * await deleteReportWithApprovals(trx, 12);
 */
async function deleteReportWithApprovals(trx, reportId) {
  const instances = await trx('approval_instances')
    .where({ entity_type: APPROVAL_ENTITIES.INDICATOR_DIVISION_REPORT, entity_id: reportId })
    .pluck('id');
  if (instances.length) {
    await trx('approval_steps').whereIn('approval_instance_id', instances).del();
    await trx('approval_instances').whereIn('id', instances).del();
  }
  await trx('indicator_division_reports').where('id', reportId).del();
}

/**
 * Move indicator_division_reports rows; on a slot collision the better status
 * wins and the loser is deleted with its approvals.
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {string} from
 * @param {string} to
 * @returns {Promise<{moved: number, dropped: number}>}
 * @example
 * await moveDivisionReports(trx, 'PHC-ID', 'ID');
 */
async function moveDivisionReports(trx, from, to) {
  const out = { moved: 0, dropped: 0 };
  const rows = await trx('indicator_division_reports').where('division_code', from)
    .select('id', 'plan_node_id', 'quarter', 'fiscal_year', 'role', 'status');
  for (const r of rows) {
    const dup = await trx('indicator_division_reports').where({
      division_code: to, plan_node_id: r.plan_node_id, quarter: r.quarter, fiscal_year: r.fiscal_year, role: r.role,
    }).first();
    if (dup && pickReportWinner(r, dup) === 'existing') {
      await deleteReportWithApprovals(trx, r.id);
      out.dropped += 1;
      continue;
    }
    if (dup) {
      await deleteReportWithApprovals(trx, dup.id);
      out.dropped += 1;
    }
    await trx('indicator_division_reports').where('id', r.id).update({ division_code: to });
    out.moved += 1;
  }
  return out;
}

/**
 * Columns with a foreign key to division_codes.code, from information_schema.
 *
 * @param {import('knex').Knex.Transaction} trx
 * @returns {Promise<Array<[string, string]>>} [table, column] pairs
 * @example
 * await foreignKeyColumns(trx); // [['users', 'division_code'], ...]
 */
async function foreignKeyColumns(trx) {
  const rows = await trx('information_schema.key_column_usage')
    .where({ table_schema: trx.client.database(), referenced_table_name: 'division_codes', referenced_column_name: 'code' })
    .select('table_name as t', 'column_name as c');
  return rows.map((r) => [r.t, r.c]);
}

/**
 * Point one column from `from` to `to`. Rows that would break a unique key
 * are left behind by UPDATE IGNORE: they are dropped on dedupe-safe tables,
 * otherwise the merge aborts.
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {{table: string, column: string, from: string, to: string}} args
 * @returns {Promise<{moved: number, deduped: number}>}
 * @throws {Error} when rows stay behind on a table that is not dedupe-safe
 * @example
 * await moveColumn(trx, { table: 'user_divisions', column: 'division_code', from: 'PHC-ID', to: 'ID' });
 */
async function moveColumn(trx, { table, column, from, to }) {
  const [res] = await trx.raw('UPDATE IGNORE ?? SET ?? = ? WHERE ?? = ?', [table, column, to, column, from]);
  const moved = res.affectedRows || 0;
  const left = await trx(table).where(column, from).count({ n: '*' }).first();
  const leftover = Number(left.n);
  if (!leftover) return { moved, deduped: 0 };
  if (!DEDUPE_SAFE_TABLES.includes(table)) {
    throw new Error(`${table}.${column}: ${leftover} row(s) collide with ${to}; merge aborted`);
  }
  await trx(table).where(column, from).del();
  return { moved, deduped: leftover };
}

/**
 * Prepare the target row: create it as a copy of the source (rename) or fill
 * its empty fields from the source (merge). The source's CBP id is released
 * first because division_cbp_id is unique.
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {object} fromRow
 * @param {string} to
 * @returns {Promise<'rename'|'merge'>}
 * @example
 * await prepareTarget(trx, phahmRow, 'APPM'); // 'rename'
 */
async function prepareTarget(trx, fromRow, to) {
  const toRow = await trx('division_codes').where('code', to).first();
  if (fromRow.division_cbp_id != null) {
    await trx('division_codes').where('code', fromRow.code).update({ division_cbp_id: null });
  }
  if (!toRow) {
    await trx('division_codes').insert({ ...fromRow, code: to });
    return 'rename';
  }
  const patch = buildFillPatch(fromRow, toRow);
  if (Object.keys(patch).length) await trx('division_codes').where('code', to).update(patch);
  return 'merge';
}

/**
 * Merge division `from` into `to`, or rename it when `to` does not exist.
 * Every reference moves to `to`, then the `from` row is deleted.
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {{from: string, to: string}} args
 * @returns {Promise<{mode: string, columns: object, reports: object, contribJson: number}>}
 * @throws {Error} when `from` is missing, equals `to`, or a move would lose data
 * @example
 * await mergeDivisionCode(trx, { from: 'PHAHM', to: 'APPM' });
 */
async function mergeDivisionCode(trx, { from, to }) {
  if (!from || !to || from === to) throw new Error('from and to must be two different codes');
  const fromRow = await trx('division_codes').where('code', from).first();
  if (!fromRow) throw new Error(`Division ${from} not found`);

  const mode = await prepareTarget(trx, fromRow, to);
  const reports = await moveDivisionReports(trx, from, to);
  let contribJson = 0;
  for (const target of JSON_CODE_COLUMNS) contribJson += await rewriteContribJson(trx, target, from, to);

  const columns = {};
  const targets = [...(await foreignKeyColumns(trx)), ...SOFT_COLUMNS];
  for (const [table, column] of targets) {
    if (!(await trx.schema.hasColumn(table, column))) continue;
    columns[`${table}.${column}`] = await moveColumn(trx, { table, column, from, to });
  }
  // A target that was a child or alias of the source would now point at itself.
  await trx('division_codes').where({ code: to, parent_code: to }).update({ parent_code: null });
  await trx('division_codes').where({ code: to, alias_of: to }).update({ alias_of: null });

  await trx('division_codes').where('code', from).del();
  return { mode, columns, reports, contribJson };
}

module.exports = { mergeDivisionCode, buildFillPatch, pickReportWinner, SOFT_COLUMNS, DEDUPE_SAFE_TABLES };
