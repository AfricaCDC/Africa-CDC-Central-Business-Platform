/**
 * @rbm/lib/theme — Africa CDC brand palette + chart palette + canonical
 * tier configuration. Single source of truth for hex colors used by both
 * backend (PDF rendering) and frontend (React components, charts, badges).
 *
 * NEVER hardcode brand hex values in services. Import from here instead.
 */

const BRAND = {
  // Primary green palette
  greenDark: '#1A5632', // sidebar, headers, primary CTAs
  greenDeep: '#14442A', // hover state for greenDark
  green:     '#348F41', // success, completed, accent

  // Accent colors
  red:       '#9F2241', // alerts, critical, T1 (Impact)
  maroon:    '#9F2241', // alias of red
  gold:      '#B4A269', // secondary brand accent
  amber:     '#E8A838', // funding/warnings, T3 (Activity)
  amberDark: '#D97706', // T4 (Output)

  // Neutrals
  white:     '#FFFFFF',
  gray:      '#58595B',
  bgLight:   '#F5F7FA',
  border:    '#E5E7EB',
};

/**
 * Tier color/label config keyed by tier code (`T1`..`T4`) AND by numeric id (1..4).
 * Use `getTierByNumber(n)` or `getTierByCode(code)` to look up.
 */
const TIER_CONFIG = {
  T1: {
    id: 1,
    code: 'T1',
    label: 'T1',
    short: 'T1',
    full: 'Impact',
    longLabel: 'Tier 1 — Impact',
    color: BRAND.red,
    bg: BRAND.red,
  },
  T2: {
    id: 2,
    code: 'T2',
    label: 'T2',
    short: 'T2',
    full: 'Outcome',
    longLabel: 'Tier 2 — Outcome',
    color: BRAND.greenDark,
    bg: BRAND.greenDark,
  },
  T3: {
    id: 3,
    code: 'T3',
    label: 'T3',
    short: 'T3',
    full: 'Short-term Outcome',
    longLabel: 'Tier 3 — Short-term Outcome',
    color: BRAND.greenDeep,
    bg: BRAND.greenDeep,
  },
  T4: {
    id: 4,
    code: 'T4',
    label: 'T4',
    short: 'T4',
    full: 'Output',
    longLabel: 'Tier 4 — Output',
    color: BRAND.amberDark,
    bg: BRAND.amberDark,
  },
};

/**
 * Quick lookup table from numeric tier id to the tier config.
 */
const TIER_BY_NUMBER = {
  1: TIER_CONFIG.T1,
  2: TIER_CONFIG.T2,
  3: TIER_CONFIG.T3,
  4: TIER_CONFIG.T4,
};

/**
 * Resolve a tier config from a numeric id.
 *
 * @param {number|string|null|undefined} n
 * @returns {object|null}
 */
function getTierByNumber(n) {
  if (n == null) return null;
  return TIER_BY_NUMBER[Number(n)] || null;
}

/**
 * Resolve a tier config from its code (`T1`..`T4`, case-insensitive).
 *
 * @param {string|null|undefined} code
 * @returns {object|null}
 */
function getTierByCode(code) {
  if (!code) return null;
  return TIER_CONFIG[String(code).toUpperCase()] || null;
}

/**
 * Sequential color palette for charts. Picks alternating brand colors so
 * dashboards stay on-brand without manual color picking per chart.
 */
const CHART_COLORS = [
  BRAND.greenDark,
  BRAND.amber,
  BRAND.red,
  BRAND.green,
  BRAND.gold,
  BRAND.amberDark,
  BRAND.greenDeep,
  BRAND.gray,
];

/**
 * Per-category brand mapping used by dashboards to assign consistent colors
 * to recurring concepts (status, priority, outcome type, etc.).
 */
const CATEGORY_COLORS = {
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
};

/**
 * Tailwind utility class strings used by inputs / form controls. Centralized
 * so we can flip the form aesthetic in one place.
 */
const INPUT_CLASSES = {
  base: 'w-full px-3 py-2 border border-gray-300 text-[11px] focus:border-[#1A5632] focus:outline-none',
  invalid: 'border-red-500 focus:border-red-500',
  disabled: 'bg-gray-50 text-gray-400 cursor-not-allowed',
};

module.exports = {
  BRAND,
  TIER_CONFIG,
  TIER_BY_NUMBER,
  CHART_COLORS,
  CATEGORY_COLORS,
  INPUT_CLASSES,
  getTierByNumber,
  getTierByCode,
};
