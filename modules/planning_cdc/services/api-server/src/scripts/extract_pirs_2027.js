/**
 * Extract the Tier 3 and Tier 4 indicators of the 2027 PIRS into a committed
 * JSON snapshot (D-20261029-01).
 *
 * The workbook ("New_Updated_PIRS_October_2026_version_7.0.xlsx", sheet
 * "LastesT_Import PIRS_7.0", one row per indicator) stays out of git; the JSON
 * it produces is committed under src/db/data/ and read by the migration
 * 20261029090000_pirs_2027_t3_t4.js — same convention as extract_amert_2027.js.
 *
 * READ-ONLY: never touches the database, never writes a file. Prints the JSON
 * to stdout; on a validation failure prints the reasons to stderr, emits
 * nothing on stdout and exits non-zero.
 *
 * Usage:
 *   node src/scripts/extract_pirs_2027.js --file=/path/to/workbook.xlsx > src/db/data/pirs_2027.json
 */

'use strict';

const path = require('path');
const xlsx = require('xlsx');

const SHEET = 'LastesT_Import PIRS_7.0';
const TIERS = { TIER_3: 3, TIER_4: 4 };
// Columns of the sheet (0-based), checked against the header row below.
const COL = {
  objectiveCode: 3, code: 6, title: 7, tier: 12, pillar: 15, definition: 17, calcType: 18,
  baseline: 22, t2023: 23, t2024: 24, t2025: 25, t2026: 26, t2027: 27, frequency: 33, bu: 35,
};
const HEADERS = {
  3: 'Objective code', 6: 'Indicator Code', 12: 'Indicator Type linked to Result Mapping Level',
  15: 'Indicator linked to AHSS Pillar', 18: 'Calculation type', 22: 'Baseline & Source',
  27: 'Target: 2027', 35: 'Primary Responsible/Accountable BU',
};

const clean = (v) => (v == null ? null : String(v).replace(/\s+/g, ' ').trim() || null);

/**
 * Snapshot rows of the T3/T4 indicators of the sheet.
 *
 * @param {Array<Array<*>>} rows - sheet rows, header first
 * @returns {{ indicators: object[], errors: string[] }}
 * @example extractRows(xlsx.utils.sheet_to_json(ws, { header: 1, defval: null }))
 */
function extractRows(rows) {
  const errors = [];
  const header = rows[0] || [];
  for (const [i, label] of Object.entries(HEADERS)) {
    if (clean(header[i]) !== label) errors.push(`column ${i}: expected "${label}", found "${clean(header[i])}"`);
  }
  const seen = new Set();
  const indicators = [];
  rows.slice(1).forEach((r, i) => {
    const tier = TIERS[clean(r[COL.tier])];
    const code = clean(r[COL.code])?.replace(/\s/g, '');
    if (!tier || !code) return;
    if (seen.has(code)) errors.push(`row ${i + 2}: duplicate code ${code}`);
    seen.add(code);
    if (!clean(r[COL.title])) errors.push(`row ${i + 2}: ${code} has no title`);
    indicators.push({
      code, tier, title: clean(r[COL.title]),
      objective_code: clean(r[COL.objectiveCode])?.replace(/\s/g, '') || null,
      pillar: clean(r[COL.pillar]), bu: clean(r[COL.bu]),
      definition: clean(r[COL.definition]), calc_type: clean(r[COL.calcType])?.toLowerCase() || null,
      baseline: clean(r[COL.baseline]),
      targets: { 2023: clean(r[COL.t2023]), 2024: clean(r[COL.t2024]), 2025: clean(r[COL.t2025]), 2026: clean(r[COL.t2026]), 2027: clean(r[COL.t2027]) },
      reporting_frequency: clean(r[COL.frequency]),
    });
  });
  return { indicators, errors };
}

function main() {
  const fileArg = process.argv.find((a) => a.startsWith('--file='));
  if (!fileArg) { process.stderr.write('Usage: --file=/path/to/PIRS.xlsx\n'); process.exit(2); }
  const file = path.resolve(fileArg.slice('--file='.length));
  const ws = xlsx.readFile(file).Sheets[SHEET];
  if (!ws) { process.stderr.write(`Sheet "${SHEET}" not found\n`); process.exit(1); }
  const { indicators, errors } = extractRows(xlsx.utils.sheet_to_json(ws, { header: 1, defval: null }));
  if (errors.length) { process.stderr.write(`${errors.join('\n')}\n`); process.exit(1); }
  process.stdout.write(`${JSON.stringify({ source: path.basename(file).replace(/^[0-9a-f]{8}-/, ''), sheet: SHEET, fiscal_year: '2027', indicators }, null, 1)}\n`);
}

if (require.main === module) main();

module.exports = { extractRows };
