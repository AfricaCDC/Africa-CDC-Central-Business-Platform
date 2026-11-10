// ── Specific Activities list: filters and order (D-20261105-05) ──
// Pure helpers behind MySpecificsPage, so the rules are tested without React.

import { STATUSES, ACTIVITY_RISK_LEVELS } from '@rbm/lib/enums';

/** Statuses in "needs your action first" order: rejected to fix, drafts to submit, … */
export const STATUS_ORDER = [STATUSES.REJECTED, STATUSES.DRAFT, STATUSES.IN_REVIEW, STATUSES.APPROVED, STATUSES.CANCELLED];
const RISK_ORDER = [ACTIVITY_RISK_LEVELS.HIGH, ACTIVITY_RISK_LEVELS.MEDIUM, ACTIVITY_RISK_LEVELS.LOW];

const rank = (order, value) => {
  const i = order.indexOf(value);
  return i === -1 ? order.length : i;
};

// filter key -> activity column; status is handled apart ('ALL' = no filter).
const FIELD_FILTERS = Object.freeze({
  type: 'activity_type',
  funding: 'primary_funding_source',
  arrangement: 'budgeting_arrangement',
  risk: 'risk_level',
});

/**
 * Keep the activities matching every filter that is set.
 *
 * @param {object[]} list - specific activities
 * @param {{ status?: string, type?: string, funding?: string, arrangement?: string, risk?: string, q?: string }} filters
 * @returns {object[]}
 * @example filterSpecifics(rows, { status: STATUSES.DRAFT, risk: ACTIVITY_RISK_LEVELS.HIGH })
 */
export function filterSpecifics(list, filters) {
  const q = (filters.q || '').trim().toLowerCase();
  return list.filter((s) => {
    if (filters.status && filters.status !== 'ALL' && s.status !== filters.status) return false;
    for (const [key, column] of Object.entries(FIELD_FILTERS)) {
      if (filters[key] && String(s[column] || '') !== filters[key]) return false;
    }
    if (!q) return true;
    return [s.title, s.code, s.indicator_code].some((v) => String(v || '').toLowerCase().includes(q));
  });
}

/**
 * Order: status needing action first, then the riskiest, then the latest change.
 *
 * @param {object[]} list
 * @returns {object[]} a new array
 * @example sortSpecifics(rows)[0].status // STATUSES.REJECTED when there is one
 */
export function sortSpecifics(list) {
  return [...list].sort((a, b) => (rank(STATUS_ORDER, a.status) - rank(STATUS_ORDER, b.status))
    || (rank(RISK_ORDER, a.risk_level) - rank(RISK_ORDER, b.risk_level))
    || (new Date(b.updated_at) - new Date(a.updated_at)));
}

/**
 * Distinct non-empty values of a column, sorted, as select options.
 *
 * @param {object[]} list
 * @param {string} column
 * @returns {Array<{ value: string, label: string }>}
 * @example distinctOptions(rows, 'primary_funding_source') // [{ value: 'AU', label: 'AU' }, …]
 */
export function distinctOptions(list, column) {
  const values = [...new Set(list.map((s) => s[column]).filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b));
  return values.map((value) => ({ value, label: value }));
}
