// ── Budget execution — MIS export parser (D-20261015-04) ──
//
// The MIS "budget execution" export is a list of blocks, one per
// (fund center, fund):
//   · a budget row (no GL account): fund center text, original budget,
//     released budget, budget brought forward from the previous year;
//   · one row per GL account: commitment, actual expenditure, expenditure
//     on the brought-forward budget;
//   · a "Total" row: the sum of the block.
// Each block is checked against its Total row: an export that does not add
// up is refused rather than imported wrong. Parsed with exceljs (not xlsx:
// the uploaded file is untrusted).

'use strict';

const ExcelJS = require('exceljs');
const { ValidationError } = require('@rbm/lib/errors');

const COLUMNS = {
  cost_center: ['cost center'],
  fund_center: ['fund center'],
  fund: ['fund'],
  fund_center_text: ['fund center text'],
  gl_account: ['gl account'],
  gl_description: ['gl description'],
  original_budget: ['original budget'],
  released_budget: ['total released budget'],
  committed: ['commitment'],
  spent: ['actual expenditure'],
  bbf_budget: ['brough forward budget from py', 'brought forward budget from py'],
  bbf_spent: ['expenditure on budget brought forward'],
};
const MONEY = ['original_budget', 'released_budget', 'committed', 'spent', 'bbf_budget', 'bbf_spent'];
const REQUIRED = ['fund_center', 'fund', 'gl_account', 'released_budget', 'committed', 'spent'];
const TOTAL = 'total';
const MAX_ROWS = 50000;
const TOLERANCE = 0.01;

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Plain value of an exceljs cell: formula result, rich text, number or text. */
function cellValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((p) => p.text).join('');
    if ('text' in v) return String(v.text);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return '';
  }
  return v;
}

const amount = (v) => {
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const text = (v, max) => String(v ?? '').trim().slice(0, max) || null;

/** Column index of each field from the header row; throws when a required column is missing. */
function mapHeader(values) {
  const index = {};
  values.forEach((v, i) => {
    const name = norm(cellValue(v));
    for (const [field, names] of Object.entries(COLUMNS)) if (index[field] === undefined && names.includes(name)) index[field] = i;
  });
  const missing = REQUIRED.filter((f) => index[f] === undefined);
  if (missing.length) throw new ValidationError(`This is not a budget execution export: missing column(s) ${missing.map((f) => COLUMNS[f][0]).join(', ')}`);
  return index;
}

const emptySums = () => Object.fromEntries(MONEY.map((f) => [f, 0]));

/** Fields of one export row, read through the header map. */
function readRow(row, col) {
  const get = (field) => (col[field] === undefined ? '' : cellValue(row[col[field]]));
  return {
    fundCenter: text(get('fund_center'), 30),
    fund: text(get('fund'), 30),
    fundCenterText: text(get('fund_center_text'), 255),
    costCenter: text(get('cost_center'), 20),
    gl: text(get('gl_account'), 20),
    glDescription: text(get('gl_description'), 255),
    money: Object.fromEntries(MONEY.map((f) => [f, amount(get(f))])),
  };
}

/** Amount columns where a block's sum differs from its Total row (all of them when no block is open). */
function totalMismatch(block, r) {
  if (!block || block.fundCenter !== r.fundCenter) return MONEY;
  return MONEY.filter((f) => Math.abs(block.sum[f] - r.money[f]) > TOLERANCE);
}

/** Import line of a budget or GL row; text and fund fall back on the block's budget row. */
function toLine(r, block) {
  return {
    fund_center: r.fundCenter,
    fund: r.fund || block.fund,
    fund_center_text: r.fundCenterText || block.text,
    cost_center: r.costCenter,
    gl_account: r.gl,
    gl_description: r.gl ? r.glDescription : null,
    ...r.money,
  };
}

/**
 * Turn the rows of the export (arrays of cell values, header first) into
 * import lines, checking every block against its Total row.
 *
 * @param {Array<Array<*>>} rows
 * @returns {{ lines: object[], fundCenterCount: number, blockCount: number }}
 * @throws {ValidationError} missing columns, too many rows, or a block that does not match its Total
 * @example parseRows([['Fund center', 'Fund', ...], [...]]);
 */
function parseRows(rows) {
  if (!rows.length) throw new ValidationError('The file is empty');
  if (rows.length > MAX_ROWS) throw new ValidationError(`The file has more than ${MAX_ROWS} rows`);
  const col = mapHeader(rows[0]);
  const { lines, errors, blockCount } = collectBlocks(rows.slice(1).map((row) => readRow(row, col)).filter((r) => r.fundCenter));
  if (errors.length) throw new ValidationError(`The export does not add up: ${errors.join('; ')}`);
  if (!lines.length) throw new ValidationError('No budget line found in the file');
  return { lines, fundCenterCount: new Set(lines.map((l) => l.fund_center)).size, blockCount };
}

/** Walk the rows block by block: lines to import and the blocks that miss their Total. */
function collectBlocks(records) {
  const lines = [];
  const errors = [];
  let block = null;
  let blockCount = 0;
  for (const r of records) {
    if (r.gl && norm(r.gl) === TOTAL) {
      const off = totalMismatch(block, r);
      if (off.length && errors.length < 5) errors.push(`${r.fundCenter}: ${off.join(', ')} do not match the Total row`);
      block = null;
      continue;
    }
    // A row without GL account opens a block; a GL row of another fund center does too.
    if (!r.gl || !block || block.fundCenter !== r.fundCenter) {
      block = { fundCenter: r.fundCenter, fund: r.fund, text: r.fundCenterText, sum: emptySums() };
      blockCount += 1;
    }
    MONEY.forEach((f) => { block.sum[f] += r.money[f]; });
    lines.push(toLine(r, block));
  }
  return { lines, errors, blockCount };
}

/**
 * Read the first worksheet of an .xlsx buffer and parse it.
 *
 * @param {Buffer} buffer
 * @returns {Promise<{ lines: object[], fundCenterCount: number, blockCount: number }>}
 * @throws {ValidationError} unreadable file or invalid export
 * @example const parsed = await parseWorkbook(req.file.buffer);
 */
async function parseWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new ValidationError('The file could not be read: upload the budget execution export as .xlsx');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new ValidationError('The file has no worksheet');
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row) => { rows.push(row.values.slice(1)); });
  return parseRows(rows);
}

module.exports = { parseWorkbook, parseRows, MONEY };
