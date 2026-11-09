/**
 * referenceService — suggestion lists for the free-text comboboxes (H-3).
 *
 * A reference list is the union of:
 *   1. curated rows in `reference_values` (admin-managed, ordered by sort_order)
 *   2. the distinct values already entered on plan_nodes for that field
 *
 * (2) means the list self-improves: a value a user typed once becomes a
 * suggestion for everyone afterwards, with no admin step. Free text is always
 * accepted by the form — this list is only a convenience.
 */

const db = require('../config/db');
const { REFERENCE_TYPES } = require('@rbm/lib/enums');

// Which plan_nodes columns feed the "already used" half of each list.
const USED_VALUE_COLUMNS = Object.freeze({
  [REFERENCE_TYPES.FUNDING_SOURCE]: ['primary_funding_source', 'other_funding_source'],
  [REFERENCE_TYPES.GRANT]:          ['grant_name'],
});

/**
 * Is `type` a supported reference list?
 *
 * @param {string} type
 * @returns {boolean}
 */
function isValidType(type) {
  return Object.prototype.hasOwnProperty.call(USED_VALUE_COLUMNS, type);
}

/**
 * Distinct non-empty values used on plan_nodes for the given reference type.
 *
 * @param {string} type - a REFERENCE_TYPES value
 * @returns {Promise<string[]>}
 */
async function usedValues(type) {
  const columns = USED_VALUE_COLUMNS[type] || [];
  // Key by trimmed + lowercased value so case/whitespace variants
  // (" World Bank" / "world bank" / "World Bank") collapse to a SINGLE
  // suggestion — this is what de-duplicates the combobox (H-3 round-2).
  // The first-seen spelling is kept as the display value.
  const byKey = new Map();
  for (const col of columns) {
    const rows = await db('plan_nodes')
      .distinct(col)
      .whereNotNull(col)
      .andWhere(col, '!=', '');
    rows.forEach((r) => {
      const v = (r[col] || '').trim();
      if (!v) return;
      const key = v.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, v);
    });
  }
  return [...byKey.values()];
}

/**
 * Suggestion list for a reference type: curated rows first (in sort_order),
 * then any extra values already used on plan_nodes, alphabetically.
 *
 * @param {string} type - a REFERENCE_TYPES value (FUNDING_SOURCE | GRANT)
 * @returns {Promise<string[]>} ordered, de-duplicated suggestions
 * @throws nothing — an unknown type yields `[]` (the route guards first)
 * @example
 * await getValues('FUNDING_SOURCE'); // ['African Union', 'GAVI', …]
 */
async function getValues(type) {
  if (!isValidType(type)) return [];

  const curatedRows = await db('reference_values')
    .where({ type, active: true })
    .orderBy('sort_order')
    .orderBy('value')
    .select('value');
  const curated = curatedRows.map((r) => r.value);

  const curatedSet = new Set(curated.map((v) => v.toLowerCase()));
  const extras = (await usedValues(type))
    .filter((v) => !curatedSet.has(v.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  return [...curated, ...extras];
}

module.exports = { getValues, isValidType };
