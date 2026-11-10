// ── PIRS import: snapshot rows → plan_nodes rows (D-20261029-01) ──
//
// Pure: no database access. The migration resolves the lookups (outcome
// areas of the year, division codes, pillars, units) and inserts the rows.
// Everything year-specific comes from the reviewed map
// (src/db/data/pirs_<year>_map.json); a value missing from the map, or a
// mapped code missing from the database, is an error, never a guess.

'use strict';

const { PLAN_NODE_TYPES, STATUSES } = require('@rbm/lib/enums');

// Target columns of the 2023-2027 strategic plan: target_y1 = 2023 … target_y5 = 2027.
const TARGET_YEARS = { target_y1: '2023', target_y2: '2024', target_y3: '2025', target_y4: '2026', target_y5: '2027' };

/**
 * The number a PIRS cell holds: "45" → 45, "70%" → 70, "1,200" → 1200.
 * Anything else ("1:4", "TBD") → null; the text is kept next to it.
 *
 * @param {string|null} text
 * @returns {number|null}
 * @example toNumber('70%') // 70
 */
function toNumber(text) {
  if (text == null) return null;
  const s = String(text).replace(/[,%\s]/g, '');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

/** Look a label up in a map section; records an error when absent or unresolved. */
function resolve({ section, label, lookup, what, code, errors }) {
  if (label == null) return null;
  if (!(label in section)) { errors.push(`${code}: ${what} "${label}" is not in the map`); return null; }
  const target = section[label];
  if (target == null) return null;
  if (!lookup.has(target)) { errors.push(`${code}: ${what} "${label}" maps to "${target}", absent from the database`); return null; }
  return lookup.get(target);
}

/**
 * plan_nodes rows for the T3/T4 indicators of a PIRS snapshot.
 *
 * @param {{ fiscal_year: string, indicators: object[] }} snapshot
 * @param {{ objective_area: object, bu: object, pillar: object, unit: object }} map
 * @param {{ areaIdByCode: Map, divisionCodes: Set, pillarIdByName: Map, unitIdByCode: Map }} lookups
 * @returns {{ rows: object[], errors: string[] }}
 * @example buildIndicatorRows(snapshot, map, lookups).rows.length // 463
 */
function buildIndicatorRows(snapshot, map, { areaIdByCode, divisionCodes, pillarIdByName, unitIdByCode }) {
  const errors = [];
  const divisions = new Map([...divisionCodes].map((c) => [c, c]));
  const rows = snapshot.indicators.map((ind, i) => {
    const at = { code: ind.code, errors };
    const targets = {};
    for (const [col, year] of Object.entries(TARGET_YEARS)) {
      targets[col] = ind.targets[year] ?? null;
      targets[`${col}_numeric`] = toNumber(ind.targets[year]);
    }
    return {
      node_type: PLAN_NODE_TYPES.OUTCOME_INDICATOR,
      tier_id: ind.tier,
      code: ind.code,
      indicator_code: ind.code,
      title: ind.title,
      description: ind.definition,
      fiscal_year: snapshot.fiscal_year,
      parent_id: resolve({ ...at, section: map.objective_area, label: ind.objective_code, lookup: areaIdByCode, what: 'objective code' }),
      responsible_division_code: resolve({ ...at, section: map.bu, label: ind.bu, lookup: divisions, what: 'BU' }),
      contributing_divisions: '[]',
      pillar_id: resolve({ ...at, section: map.pillar, label: ind.pillar, lookup: pillarIdByName, what: 'pillar' }),
      unit_of_measure_id: resolve({ ...at, section: map.unit, label: ind.calc_type, lookup: unitIdByCode, what: 'calculation type' }),
      baseline: ind.baseline,
      baseline_numeric: toNumber(ind.baseline),
      ...targets,
      status: STATUSES.APPROVED,
      is_active: 1,
      sort_order: i + 1,
      budget_main: 0,
    };
  });
  return { rows, errors };
}

module.exports = { buildIndicatorRows, toNumber };
