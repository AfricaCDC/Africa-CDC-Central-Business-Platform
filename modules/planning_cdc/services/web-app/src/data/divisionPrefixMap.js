/**
 * Maps the prefix portion of an indicator code to its canonical division
 * code in the `division_codes` table.
 *
 * Convention: T3/T4 indicator codes always start with the master contributor's
 * division prefix (e.g. SDI.2.5-4 → SDI division). Most prefixes match the
 * division code 1:1 case-insensitively, but some indicators in the source
 * Excel use aliases or typos:
 *
 *   - PR&A      → PRA       (& was preserved instead of stripped)
 *   - LABNET 5  → LABNET    (extra " 5" suffix in raw data)
 *   - PHAHM 6   → APPM      (extra " 6" suffix; PHAHM renamed APPM)
 *   - CPI-ASM   → CPI_ASM   (dash vs underscore)
 *   - DHIS      → Digital   (Digital Health, HIS & Data Governance)
 *   - DIA       → DIAG      (Division of Diagnostic Access)
 *   - CT        → SCI       (R&D and Clinical Trials)
 *   - Legal     → DDS       (Legal Affairs is the DDS division)
 *   - RHSS      → SRH       (SRMNCAH / Reproductive Health)
 *   - Admin     → ADMIN     (case difference)
 *   - Youth     → YOUTH     (case difference)
 *   - RefLab    → RefLAB    (case difference)
 *
 * Add new aliases here when new indicator codes are introduced. The frontend
 * uses this map (rather than a DB column) so a non-developer can add new
 * mappings without a migration.
 */
export const PREFIX_TO_DIVISION = {
  // Aliases
  'PR&A':      'PRA',
  'LABNET 5':  'LABNET',
  'PHAHM 6':   'APPM',
  // Renamed / merged divisions (scripts/merge_division_code.js)
  'PHAHM':     'APPM',
  'PHC-ID':    'ID',
  'CPI-ASM':   'CPI_ASM',
  'DHIS':      'Digital',
  'DIA':       'DIAG',
  'CT':        'SCI',
  'Legal':     'DDS',
  'RHSS':      'SRH',
  // Case normalization
  'Admin':     'ADMIN',
  'Youth':     'YOUTH',
  'RefLab':    'RefLAB',
};

/**
 * Extract the division-code prefix from an indicator code.
 * Examples:
 *   "SDI.2.5-4"      → "SDI"
 *   "PR&A.13.1-35"   → "PR&A"
 *   "MIS.13.2-2"     → "MIS"
 *   "CPI"            → "CPI" (no dot — whole code)
 */
export function extractCodePrefix(indicatorCode) {
  if (!indicatorCode) return null;
  // Split on first '.' (most codes are PREFIX.X.Y-Z)
  const dotIdx = indicatorCode.indexOf('.');
  return dotIdx === -1 ? indicatorCode : indicatorCode.substring(0, dotIdx);
}

/**
 * Resolve the canonical master division code for an indicator.
 * Returns null if no match (e.g. unknown alias not yet in PREFIX_TO_DIVISION).
 *
 * @param {string} indicatorCode  e.g. "SDI.2.5-4"
 * @param {Array}  divisions      list of { code, ... } from /admin/division-codes
 */
export function getMasterDivisionCode(indicatorCode, divisions = []) {
  const prefix = extractCodePrefix(indicatorCode);
  if (!prefix) return null;

  // 1. Explicit alias map
  if (PREFIX_TO_DIVISION[prefix]) return PREFIX_TO_DIVISION[prefix];

  // 2. Direct case-insensitive match
  const divByCode = new Map();
  divisions.forEach(d => {
    if (d?.code) divByCode.set(d.code.toLowerCase(), d.code);
  });
  const direct = divByCode.get(prefix.toLowerCase());
  if (direct) return direct;

  // 3. No match
  return null;
}

/**
 * Build a Set of division codes equivalent to `code` (the code itself
 * + any alias_of relation in either direction).
 */
function equivalentDivCodes(code, divisions = []) {
  if (!code) return new Set();
  const codes = new Set([code.toUpperCase()]);
  const links = divisions
    .filter((d) => d?.code && d.alias_of)
    .map((d) => [d.code.toUpperCase(), d.alias_of.toUpperCase()]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [dc, da] of links) {
      if (codes.has(dc) === codes.has(da)) continue;
      codes.add(dc);
      codes.add(da);
      changed = true;
    }
  }
  return codes;
}

/**
 * Returns whether `myDivisionCode` is the master contributor for the given
 * indicator code. Alias-aware: if user is on "Legal" and master is "DDS"
 * (DDS.alias_of = Legal), this returns true.
 */
export function isMasterContributor(indicatorCode, myDivisionCode, divisions = []) {
  if (!myDivisionCode) return false;
  const master = getMasterDivisionCode(indicatorCode, divisions);
  if (!master) return false;
  const userScope = equivalentDivCodes(myDivisionCode, divisions);
  return userScope.has(master.toUpperCase());
}
