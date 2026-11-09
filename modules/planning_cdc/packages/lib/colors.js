/**
 * @rbm/lib/colors — Backwards-compat shim around `@rbm/lib/theme`.
 *
 * Existing consumers import `COLORS` from this module; new code should use
 * `BRAND` from `@rbm/lib/theme` instead. Keeping the legacy keys here so we
 * don't have to migrate every file in one PR.
 */

const { BRAND, TIER_CONFIG } = require('./theme');

const COLORS = {
  // AU corporate palette (legacy keys)
  AU_GREEN_DARK: BRAND.greenDark,
  AU_GREEN: BRAND.green,
  AU_RED: BRAND.red,
  AU_GOLD: BRAND.gold,
  AU_WHITE: BRAND.white,
  AU_GRAY: BRAND.gray,

  // Tier-specific (legacy keys)
  TIER_1: TIER_CONFIG.T1.color,
  TIER_2: TIER_CONFIG.T2.color,
  TIER_3: TIER_CONFIG.T3.color,
  TIER_4: TIER_CONFIG.T4.color,

  // UI
  BG_LIGHT: BRAND.bgLight,
  BORDER: BRAND.border,
};

module.exports = { COLORS };
