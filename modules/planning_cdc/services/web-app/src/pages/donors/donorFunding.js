// ── Donor funding from the budget codes of a plan year (D-20261106-13) ──
//
// A budget code carries its funding source; the donor pages group the codes
// of the year by source, then by Business Unit.

export const DONOR_PAGE_SIZE = 15;
const NO_UNIT = 'No Business Unit';

const amountOf = (code) => Number(code.amount || 0);

/**
 * Budget codes grouped by funding source, largest amount first. Codes
 * without a funding source are left out.
 *
 * @param {object[]} codes - rows of GET /budget-codes
 * @returns {{ id: number, name: string, amount: number, codes: number, activities: number }[]}
 * @example fundingBySource([{ funding_source_id: 48, funding_source_name: 'World Bank', amount: 10, plan_node_id: 3 }])
 */
export function fundingBySource(codes) {
  const sources = new Map();
  for (const c of codes) {
    if (!c.funding_source_id) continue;
    const s = sources.get(c.funding_source_id)
      || { id: c.funding_source_id, name: c.funding_source_name || `Source ${c.funding_source_id}`, amount: 0, codes: 0, broads: new Set() };
    s.amount += amountOf(c);
    s.codes += 1;
    s.broads.add(c.plan_node_id);
    sources.set(c.funding_source_id, s);
  }
  return [...sources.values()]
    .map(({ broads, ...s }) => ({ ...s, activities: broads.size }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Budget codes grouped by Business Unit, largest amount first.
 *
 * @param {object[]} codes
 * @returns {{ unit: string, amount: number, codes: number }[]}
 * @example fundingByUnit([{ division_name: 'Digital', amount: 5 }]) // [{ unit: 'Digital', amount: 5, codes: 1 }]
 */
export function fundingByUnit(codes) {
  const units = new Map();
  for (const c of codes) {
    const unit = c.division_name || NO_UNIT;
    const u = units.get(unit) || { unit, amount: 0, codes: 0 };
    u.amount += amountOf(c);
    u.codes += 1;
    units.set(unit, u);
  }
  return [...units.values()].sort((a, b) => b.amount - a.amount);
}

/** Percent of `part` in `total`, 0 when the total is 0. */
export const shareOf = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);
