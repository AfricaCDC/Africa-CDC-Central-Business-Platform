/**
 * Extract the Big Tickets mid-year 2026 consolidation into a committed JSON
 * snapshot (D-20261015-02).
 *
 * The workbook ("Big_Ticket_2026_Midyear_pillar_reports_consolidated_Oct_2026.xlsx",
 * sheet "Mid-Year Big Tickets Reporting", one row per indicator line) stays out
 * of git; the JSON it produces is committed under src/db/data/ and read by the
 * migration 20261015120000_big_tickets.js — same convention as
 * extract_amert_2027.js.
 *
 * Rows sharing a ticket number (BT18: long/short-term training, BT41: four
 * indices) become one ticket with several lines. The mid-year milestone,
 * achieved value and BU narration become the Q2 2026 report.
 *
 * READ-ONLY: never touches the database, never writes a file. Prints the JSON
 * to stdout; on a validation failure prints the reasons to stderr, emits
 * nothing on stdout and exits non-zero.
 *
 * Usage:
 *   node src/scripts/extract_big_tickets_2026.js --file=/path/to/workbook.xlsx > src/db/data/big_tickets_2026.json
 */

'use strict';

const path = require('path');
const xlsx = require('xlsx');

const SHEET = 'Mid-Year Big Tickets Reporting';
const EXPECTED = { tickets: 42, lines: 46 };
const HEADERS = [
  'Ticket #', 'AHSS Pillar', 'Big Ticket', 'Result(s)', 'PIRS Indicator & Code', 'Tier',
  '2026 Target', 'Mid-Year 2026 Milestone', 'Delivery Model', 'Success Factors',
  'Achieved (mid-year)', 'Performance (%)', 'Progress Status',
  "Progress Milestones (BU's narration)", 'Challenges', 'Next Steps', 'Lead BU', 'Contributing BU',
];
const STATUS = { 'on track': 'ON_TRACK', achieved: 'ACHIEVED', 'at risk': 'AT_RISK', 'off track': 'OFF_TRACK' };
// PIRS codes look like "KM.10.3-3", "PR&A.13.1-29", "NCD.1.1.-14".
const CODE = /([A-Za-z&]+\.[\d.]+-\d+)/;
// The number a cell starts with: "75", "1,538 professionals", "90% of outbreaks".
// Not "1) 30 MS" (an enumeration), not ">95%" or "V0" (no leading number).
const LEADING_NUMBER = /^\s*(\d[\d,]*(?:\.\d+)?)(?!\d|\)|,\d)/;

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const toNumber = (v) => {
  const m = String(v ?? '').match(LEADING_NUMBER);
  return m ? Number(m[1].replace(/,/g, '')) : null;
};
// "Long-term training: 1) 163 professionals" → "Long-term training".
const labelFromTarget = (t) => (/^[^:]{3,40}: /.test(t) ? t.split(':')[0].trim() : '');

function argFile() {
  const arg = process.argv.find((a) => a.startsWith('--file='));
  if (!arg) throw new Error('Usage: --file=/path/to/Big_Ticket_2026_Midyear_...xlsx');
  return path.resolve(arg.slice('--file='.length));
}

function lineOf(r) {
  const indicator = clean(r[4]);
  const match = indicator.match(CODE);
  const label = indicator.match(/^\[([^\]]+)\]/);
  return {
    label: label ? label[1] : labelFromTarget(clean(r[6])),
    indicator_code: match ? match[1] : null,
    source_indicator: indicator,
    tier: /^Tier \d$/.test(clean(r[5])) ? clean(r[5]) : null,
    target_2026: clean(r[6]),
    target_2026_numeric: toNumber(r[6]),
    q2_milestone: clean(r[7]),
    q2_milestone_numeric: toNumber(r[7]),
    q2_achieved: clean(r[10]),
    q2_achieved_numeric: toNumber(r[10]),
    q2_performance: r[11] === '' ? null : Number(r[11]),
    q2_narrative: clean(r[13]),
  };
}

/**
 * Parse the workbook into tickets with their lines.
 *
 * @param {string} file - path to the workbook
 * @returns {{ tickets: object[], errors: string[] }}
 * @throws {Error} when the sheet is missing
 * @example extract('/tmp/Big_Ticket_2026.xlsx');
 */
function extract(file) {
  const wb = xlsx.readFile(file);
  const ws = wb.Sheets[SHEET];
  if (!ws) throw new Error(`Sheet "${SHEET}" not found`);
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const errors = [];
  const header = rows[0].map(clean);
  HEADERS.forEach((h, i) => { if (header[i] !== h) errors.push(`Column ${i + 1}: expected "${h}", found "${header[i]}"`); });

  const byCode = new Map();
  for (const r of rows.slice(1)) {
    const code = clean(r[0]);
    if (!code) continue;
    if (!/^BT\d{2}$/.test(code)) { errors.push(`Bad ticket number "${code}"`); continue; }
    const status = STATUS[clean(r[12]).toLowerCase()];
    if (!status) errors.push(`${code}: unknown progress status "${clean(r[12])}"`);
    if (!byCode.has(code)) {
      byCode.set(code, {
        code,
        pillar: clean(r[1]).split(' - ')[0],
        title: clean(r[2]),
        expected_result: clean(r[3]),
        delivery_model: clean(r[8]),
        success_factors: clean(r[9]),
        lead_label: clean(r[16]),
        contributors_label: clean(r[17]),
        q2_status: status,
        q2_challenges: clean(r[14]),
        q2_next_steps: clean(r[15]),
        lines: [],
      });
    }
    byCode.get(code).lines.push(lineOf(r));
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
      source: { file: path.basename(file), sheet: SHEET, extracted_at: new Date().toISOString().slice(0, 10), script: 'extract_big_tickets_2026.js' },
      fiscal_year: '2026',
      tickets,
    }, null, 2)}\n`);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { extract, _internals: { lineOf, toNumber, CODE } };
