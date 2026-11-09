/**
 * Extract the Big Tickets Q3 2026 update ("…consolidated_Oct_2026_v2.xlsx")
 * into a committed JSON snapshot (D-20261015-09).
 *
 * Same sheet as the mid-year file, with one more column ("Q3 Achieved") and
 * revised values: the 2026 targets, the mid-year milestones and the Q1-Q2
 * achieved values replace the imported ones, and the Q3 values, progress
 * status, narration, challenges and next steps become the Q3 2026 report.
 * Read by the migration 20261015200000_big_tickets_2026_q3.js.
 *
 * Text cells are read as displayed (a percent cell gives "90%", not 0.9).
 *
 * READ-ONLY: never touches the database, never writes a file. Prints the
 * JSON to stdout; on a validation failure prints the reasons to stderr and
 * exits non-zero.
 *
 * Usage:
 *   node src/scripts/extract_big_tickets_2026_q3.js --file=/path/to/v2.xlsx > src/db/data/big_tickets_2026_q3.json
 */

'use strict';

const path = require('path');
const xlsx = require('xlsx');
const { _internals: { toNumber } } = require('./extract_big_tickets_2026');

const SHEET = 'Mid-Year Big Tickets Reporting';
const EXPECTED = { tickets: 42, lines: 46 };
const HEADERS = [
  'Ticket #', 'AHSS Pillar', 'Big Ticket', 'Result(s)', 'PIRS Indicator & Code', 'Tier',
  '2026 Target', 'Mid-Year 2026 Milestone', 'Delivery Model', 'Success Factors',
  'Q1-Q2 Achieved (mid-year)', 'Q3 Achieved', 'Performance (%)', 'Progress Status',
  "Progress Milestones (BU's narration)", 'Challenges', 'Next Steps', 'Lead BU', 'Contributing BU',
];
const COL = { code: 0, target: 6, milestone: 7, q2: 10, q3: 11, performance: 12, status: 13, narrative: 14, challenges: 15, next: 16 };
const STATUS = { 'on track': 'ON_TRACK', achieved: 'ACHIEVED', 'at risk': 'AT_RISK', 'off track': 'OFF_TRACK', 'off-track': 'OFF_TRACK' };
const NOT_AVAILABLE = /^(n\/?a|-)$/i;

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
/** Displayed value, empty for "NA". */
const value = (v) => (NOT_AVAILABLE.test(clean(v)) ? '' : clean(v));
const ratio = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function argFile() {
  const arg = process.argv.find((a) => a.startsWith('--file='));
  if (!arg) throw new Error('Usage: --file=/path/to/Big_Ticket_2026_..._v2.xlsx');
  return path.resolve(arg.slice('--file='.length));
}

function lineOf(shown, raw) {
  const q2 = value(shown[COL.q2]);
  const q3 = value(shown[COL.q3]);
  return {
    target_2026: clean(shown[COL.target]),
    target_2026_numeric: toNumber(shown[COL.target]),
    q2_milestone: clean(shown[COL.milestone]),
    q2_milestone_numeric: toNumber(shown[COL.milestone]),
    q2_achieved: q2,
    q2_achieved_numeric: q2 ? toNumber(q2) : null,
    q3_achieved: q3,
    q3_achieved_numeric: q3 ? toNumber(q3) : null,
    q3_performance: ratio(raw[COL.performance]),
    q3_narrative: clean(shown[COL.narrative]),
  };
}

/**
 * Parse the workbook into tickets with their lines, in sheet order.
 *
 * @param {string} file - path to the workbook
 * @returns {{ tickets: object[], errors: string[] }}
 * @throws {Error} when the sheet is missing
 * @example extract('/tmp/v2.xlsx');
 */
function extract(file) {
  const ws = xlsx.readFile(file).Sheets[SHEET];
  if (!ws) throw new Error(`Sheet "${SHEET}" not found`);
  const shown = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  const raw = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const errors = [];
  const header = shown[0].map(clean);
  HEADERS.forEach((h, i) => { if (header[i] !== h) errors.push(`Column ${i + 1}: expected "${h}", found "${header[i]}"`); });

  const byCode = new Map();
  for (let i = 1; i < shown.length; i++) {
    const code = clean(shown[i][COL.code]);
    if (!code) continue;
    if (!/^BT\d{2}$/.test(code)) { errors.push(`Bad ticket number "${code}"`); continue; }
    const status = STATUS[clean(shown[i][COL.status]).toLowerCase()];
    if (!status) errors.push(`${code}: unknown progress status "${clean(shown[i][COL.status])}"`);
    if (!byCode.has(code)) {
      byCode.set(code, {
        code, q3_status: status, q3_challenges: clean(shown[i][COL.challenges]), q3_next_steps: clean(shown[i][COL.next]), lines: [],
      });
    }
    byCode.get(code).lines.push(lineOf(shown[i], raw[i]));
  }
  const tickets = [...byCode.values()];
  const lineCount = tickets.reduce((n, t) => n + t.lines.length, 0);
  if (tickets.length !== EXPECTED.tickets) errors.push(`Expected ${EXPECTED.tickets} tickets, found ${tickets.length}`);
  if (lineCount !== EXPECTED.lines) errors.push(`Expected ${EXPECTED.lines} lines, found ${lineCount}`);
  return { tickets, errors };
}

if (require.main === module) {
  try {
    const file = argFile();
    const { tickets, errors } = extract(file);
    if (errors.length) {
      process.stderr.write(`${errors.join('\n')}\n`);
      process.exit(1);
    }
    process.stdout.write(`${JSON.stringify({
      source: { file: path.basename(file), sheet: SHEET, extracted_at: new Date().toISOString().slice(0, 10), script: 'extract_big_tickets_2026_q3.js' },
      fiscal_year: '2026',
      quarter: 'Q3',
      tickets,
    }, null, 2)}\n`);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { extract, _internals: { lineOf, value } };
