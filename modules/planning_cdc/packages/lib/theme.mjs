/**
 * @rbm/lib/theme — ESM source.
 *
 * Mirror of ./theme.js (CJS) for frontend bundlers. Keep both files in
 * lockstep when adjusting the brand palette.
 */

export const BRAND = Object.freeze({
  greenDark: '#1A5632',
  greenDeep: '#14442A',
  green:     '#348F41',
  red:       '#9F2241',
  maroon:    '#9F2241',
  gold:      '#B4A269',
  amber:     '#E8A838',
  amberDark: '#D97706',
  white:     '#FFFFFF',
  gray:      '#58595B',
  bgLight:   '#F5F7FA',
  border:    '#E5E7EB',
});

export const TIER_CONFIG = Object.freeze({
  T1: {
    id: 1, code: 'T1', label: 'T1', short: 'T1', full: 'Impact',
    longLabel: 'Tier 1 — Impact', color: BRAND.red, bg: BRAND.red,
  },
  T2: {
    id: 2, code: 'T2', label: 'T2', short: 'T2', full: 'Outcome',
    longLabel: 'Tier 2 — Outcome', color: BRAND.greenDark, bg: BRAND.greenDark,
  },
  T3: {
    id: 3, code: 'T3', label: 'T3', short: 'T3', full: 'Short-term Outcome',
    longLabel: 'Tier 3 — Short-term Outcome', color: BRAND.greenDeep, bg: BRAND.greenDeep,
  },
  T4: {
    id: 4, code: 'T4', label: 'T4', short: 'T4', full: 'Output',
    longLabel: 'Tier 4 — Output', color: BRAND.amberDark, bg: BRAND.amberDark,
  },
});

export const TIER_BY_NUMBER = Object.freeze({
  1: TIER_CONFIG.T1,
  2: TIER_CONFIG.T2,
  3: TIER_CONFIG.T3,
  4: TIER_CONFIG.T4,
});

export function getTierByNumber(n) {
  if (n == null) return null;
  return TIER_BY_NUMBER[Number(n)] || null;
}

export function getTierByCode(code) {
  if (!code) return null;
  return TIER_CONFIG[String(code).toUpperCase()] || null;
}

export const CHART_COLORS = Object.freeze([
  BRAND.greenDark, BRAND.amber, BRAND.red, BRAND.green,
  BRAND.gold, BRAND.amberDark, BRAND.greenDeep, BRAND.gray,
]);

export const CATEGORY_COLORS = Object.freeze({
  funding:   BRAND.amber,
  budget:    BRAND.amberDark,
  impact:    BRAND.red,
  outcome:   BRAND.greenDark,
  output:    BRAND.amberDark,
  activity:  BRAND.green,
  positive:  BRAND.green,
  negative:  BRAND.red,
  warning:   BRAND.amber,
  neutral:   BRAND.gray,
});

export const INPUT_CLASSES = Object.freeze({
  base: 'w-full px-3 py-2 border border-gray-300 text-[11px] focus:border-[#1A5632] focus:outline-none',
  invalid: 'border-red-500 focus:border-red-500',
  disabled: 'bg-gray-50 text-gray-400 cursor-not-allowed',
});

export default {
  BRAND, TIER_CONFIG, TIER_BY_NUMBER, CHART_COLORS, CATEGORY_COLORS,
  INPUT_CLASSES, getTierByNumber, getTierByCode,
};
