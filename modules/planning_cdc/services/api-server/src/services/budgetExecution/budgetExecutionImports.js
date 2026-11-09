// ── Budget execution — imports of the MIS export (D-20261015-04) ──
//
// Each upload is kept as a dated snapshot: the latest of the year feeds the
// pages and the dashboard, older ones stay for history.

'use strict';

const db = require('../../config/db');
const { NotFoundError } = require('@rbm/lib/errors');
const { parseWorkbook } = require('./misParser');
const { totals } = require('./budgetExecutionQuery');

const CHUNK = 500;

/**
 * Parse an MIS export and store it as a snapshot.
 *
 * @param {{ buffer: Buffer, fileName: string, fiscalYear: string, asOfDate: string, userId: number }} p
 * @returns {Promise<{ id: number, fund_center_count: number, line_count: number }>}
 * @throws {ValidationError} when the file is not a valid MIS export
 * @example await importExport({ buffer, fileName: 'EXPORT.xlsx', fiscalYear: '2026', asOfDate: '2026-10-13', userId: 1 });
 */
async function importExport({ buffer, fileName, fiscalYear, asOfDate, userId }) {
  const parsed = await parseWorkbook(buffer);
  return db.transaction(async (trx) => {
    const [id] = await trx('budget_execution_imports').insert({
      fiscal_year: fiscalYear,
      as_of_date: asOfDate,
      file_name: String(fileName || '').slice(0, 255) || null,
      fund_center_count: parsed.fundCenterCount,
      line_count: parsed.lines.length,
      imported_by: userId,
    });
    for (let i = 0; i < parsed.lines.length; i += CHUNK) {
      await trx('budget_execution_lines').insert(parsed.lines.slice(i, i + CHUNK).map((l) => ({ ...l, import_id: id })));
    }
    return { id, fund_center_count: parsed.fundCenterCount, line_count: parsed.lines.length };
  });
}

/**
 * Imports of a year, newest first, with their totals and the importer's name.
 *
 * @param {string} fiscalYear
 * @returns {Promise<object[]>}
 * @throws {Error} on DB failure
 * @example await listImports('2026');
 */
async function listImports(fiscalYear) {
  const rows = await db('budget_execution_imports as i').leftJoin('users as u', 'u.id', 'i.imported_by')
    .where('i.fiscal_year', fiscalYear)
    .select('i.*', db.raw("TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) as imported_by_name"))
    .orderBy([{ column: 'i.as_of_date', order: 'desc' }, { column: 'i.id', order: 'desc' }]);
  if (!rows.length) return [];
  const sums = await db('budget_execution_lines').whereIn('import_id', rows.map((r) => r.id)).groupBy('import_id')
    .select('import_id', ...['original_budget', 'released_budget', 'committed', 'spent', 'bbf_budget', 'bbf_spent']
      .map((k) => db.raw('SUM(??) as ??', [k, k])));
  return rows.map((r) => ({ ...r, ...totals(sums.filter((s) => s.import_id === r.id)) }));
}

/**
 * Delete an import and its lines.
 *
 * @param {number} id
 * @returns {Promise<object>} the deleted import row
 * @throws {NotFoundError} unknown import
 * @example await deleteImport(4);
 */
async function deleteImport(id) {
  const row = await db('budget_execution_imports').where('id', id).first();
  if (!row) throw new NotFoundError('Import not found');
  await db('budget_execution_imports').where('id', id).del();
  return row;
}

module.exports = { importExport, listImports, deleteImport };
