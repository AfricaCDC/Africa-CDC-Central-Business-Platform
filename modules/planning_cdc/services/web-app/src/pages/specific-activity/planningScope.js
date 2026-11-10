// ── What the specific activity form offers (D-20261028-03) ──
//
// A user picks among the broads of their business units, then among the
// T3/T4 indicators of the broad's BU: a specific activity is linked to the
// T3/T4 it contributes to, the broad to its Tier 2 (D-20261105-06; the
// Activity Mapping links no longer narrow the list). Codes are compared upper-case.

import { countryByCode } from '@rbm/lib/countries';

const upper = (c) => String(c).toUpperCase();

/** Responsible + contributing division codes of a plan node, upper-cased. */
function unitsOf(node) {
  let cd = node.contributing_divisions;
  if (typeof cd === 'string') { try { cd = JSON.parse(cd); } catch { cd = []; } }
  return [node.responsible_division_code, ...(Array.isArray(cd) ? cd : [])].filter(Boolean).map(upper);
}

const inUnits = (node, codes) => unitsOf(node).some((c) => codes.has(c));

/**
 * Broads the user's business unit is responsible for (a broad it only
 * contributes to belongs to another BU). A user with no unit keeps the full
 * list. The broad already saved on the activity is always kept.
 *
 * @param {object[]} broads
 * @param {Set<string>} codes - the user's division codes, upper-cased
 * @param {number|string} [keepId]
 * @returns {object[]}
 * @example scopeBroads(broads, new Set(['DCM']), 41)
 */
export function scopeBroads(broads, codes, keepId) {
  if (!codes.size) return broads;
  const ownBu = (b) => b.responsible_division_code && codes.has(upper(b.responsible_division_code));
  return broads.filter((b) => ownBu(b) || (keepId && String(b.id) === String(keepId)));
}

/**
 * T3/T4 indicators offered for a broad: those of its BU, else those of the
 * user's units. The indicator already saved on the activity is always kept.
 *
 * @param {{ indicators: object[], broad?: object, codes: Set<string>, keepId?: number|string }} p
 * @returns {object[]}
 * @example indicatorsForBroad({ indicators, broad: { responsible_division_code: 'DCM' }, codes })
 */
export function indicatorsForBroad({ indicators, broad, codes, keepId }) {
  const bu = broad?.responsible_division_code ? new Set([upper(broad.responsible_division_code)]) : new Set();
  const candidates = [
    indicators.filter((i) => inUnits(i, bu)),
    codes.size ? indicators.filter((i) => inUnits(i, codes)) : indicators,
  ];
  const list = candidates.find((c) => c.length) || [];
  const kept = keepId && !list.some((i) => String(i.id) === String(keepId)) && indicators.find((i) => String(i.id) === String(keepId));
  return kept ? [kept, ...list] : list;
}

/**
 * Country office mode (D-20261105-07): a country office has no broad of its
 * own, so when it is the active unit its members pick among every broad of the
 * year; the activity is carried by the office and takes place in its country.
 *
 * @param {object|null} unit - active unit from /me/divisions
 * @returns {{ code: string, country: string|null }|null} null when not a country office
 * @example countryOfficeOf({ code: 'CO-KEN', is_country_office: true, country_code: 'KEN' }) // { code: 'CO-KEN', country: 'Kenya' }
 */
export function countryOfficeOf(unit) {
  if (!unit?.is_country_office) return null;
  return { code: unit.code, country: countryByCode(unit.country_code)?.name || null };
}
