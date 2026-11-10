/**
 * Fiscal-year helpers (ESM mirror of fiscalYear.js).
 *
 *   FY1 = 2023
 *   FY2 = 2024
 *   FY3 = 2025
 *   FY4 = 2026   (← current year, the "active" FY)
 *   FY5 = 2027
 *
 * Kept as a standalone ESM module (not a re-export of the CJS file) so
 * Vite can tree-shake without needing interop on module.exports.
 */

export const FY_START_YEAR = 2023;
export const FY_END_YEAR = 2027;
export const TOTAL_FISCAL_YEARS = FY_END_YEAR - FY_START_YEAR + 1;

export function fyToYear(n) {
  const idx = Number(n);
  if (!Number.isFinite(idx) || idx < 1) return FY_START_YEAR;
  return FY_START_YEAR + idx - 1;
}

export function yearToFy(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return 0;
  const n = y - FY_START_YEAR + 1;
  return n >= 1 ? n : 0;
}

export function currentFy(at) {
  const d = at instanceof Date
    ? at
    : (Number.isFinite(Number(at)) ? new Date(Number(at), 0, 1) : new Date());
  return Math.max(1, Math.min(TOTAL_FISCAL_YEARS, yearToFy(d.getFullYear()) || TOTAL_FISCAL_YEARS));
}

export function fyLabel(n, opts = {}) {
  const year = fyToYear(n);
  const base = opts.short ? `FY${n}` : `FY${n} · ${year}`;
  if (opts.markCurrent && year === fyToYear(currentFy())) {
    return `${base} (current)`;
  }
  return base;
}

export default {
  FY_START_YEAR,
  FY_END_YEAR,
  TOTAL_FISCAL_YEARS,
  fyToYear,
  yearToFy,
  currentFy,
  fyLabel,
};
