/**
 * Fiscal-year helpers — single source of truth for the FY ↔ calendar-year
 * mapping used across the Africa CDC strategic plan 2023-2027.
 *
 *   FY1 = 2023
 *   FY2 = 2024
 *   FY3 = 2025
 *   FY4 = 2026   (← current year, the "active" FY)
 *   FY5 = 2027
 *
 * Never hardcode the 2023 base or compute FY numbers inline: import
 * `fyToYear` / `yearToFy` / `currentFy` from here so the mapping can
 * shift in a single place when the strategic plan rolls over.
 */

'use strict';

const FY_START_YEAR = 2023;
const FY_END_YEAR = 2027;
const TOTAL_FISCAL_YEARS = FY_END_YEAR - FY_START_YEAR + 1;

/**
 * Convert an FY index (1..N) into a calendar year.
 * @param {number} n — 1-based FY number
 * @returns {number} calendar year (e.g. 2026 for FY4)
 * @example fyToYear(4) // 2026
 */
function fyToYear(n) {
  const idx = Number(n);
  if (!Number.isFinite(idx) || idx < 1) return FY_START_YEAR;
  return FY_START_YEAR + idx - 1;
}

/**
 * Convert a calendar year into its FY index.
 * @param {number} year — calendar year (e.g. 2026)
 * @returns {number} FY number (1..N), or 0 when out of plan range
 * @example yearToFy(2026) // 4
 */
function yearToFy(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return 0;
  const n = y - FY_START_YEAR + 1;
  return n >= 1 ? n : 0;
}

/**
 * FY index matching the calendar year of `at` (defaults to now). This
 * is the "active" FY — the one the app should default its selectors to.
 * @param {Date|number} [at] — date or year
 * @returns {number} FY number (1..N)
 * @example currentFy() // 4 in 2026
 */
function currentFy(at) {
  const d = at instanceof Date ? at : (Number.isFinite(Number(at)) ? new Date(Number(at), 0, 1) : new Date());
  return Math.max(1, Math.min(TOTAL_FISCAL_YEARS, yearToFy(d.getFullYear()) || TOTAL_FISCAL_YEARS));
}

/**
 * Human label for an FY, e.g. `"FY4 · 2026"` with optional "(current)"
 * suffix when it is the active year.
 * @param {number} n
 * @param {{ short?: boolean, markCurrent?: boolean }} [opts]
 * @returns {string}
 */
function fyLabel(n, opts = {}) {
  const year = fyToYear(n);
  const base = opts.short ? `FY${n}` : `FY${n} · ${year}`;
  if (opts.markCurrent && year === fyToYear(currentFy())) {
    return `${base} (current)`;
  }
  return base;
}

module.exports = {
  FY_START_YEAR,
  FY_END_YEAR,
  TOTAL_FISCAL_YEARS,
  fyToYear,
  yearToFy,
  currentFy,
  fyLabel,
};
