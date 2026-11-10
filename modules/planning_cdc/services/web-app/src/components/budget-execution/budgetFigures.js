import { fmtBudget, fmtDate } from '@rbm/lib/formatters';

/** Full dollar amount, "$0" for zero, minus sign kept (an overspent balance is negative). */
export const money = (v) => fmtBudget(Number(v) || 0, { fallback: '$0' });

/** "80.5%", or an em dash when nothing was released. */
export const rate = (v) => (v === null || v === undefined ? '—' : `${v}%`);

/** "Oct 13, 2026". */
export const day = (v) => fmtDate(v, { fallback: '—' });

/**
 * The figures, in reading order, with the one-line definition shown to users.
 * Balance comes first: it is what a business unit acts on.
 */
export const FIGURES = [
  { key: 'balance', label: 'Balance', help: 'Released − committed − spent: what is still available.' },
  { key: 'released_budget', label: 'Released', help: 'Budget released by Finance for the year.' },
  { key: 'committed', label: 'Committed', help: 'Engaged (purchase orders, contracts) but not paid yet.' },
  { key: 'spent', label: 'Spent', help: 'Actual expenditure paid.' },
];

export const RATES = [
  { key: 'execution_pct', label: 'Execution', help: '(Committed + spent) / released.' },
  { key: 'spend_pct', label: 'Spent only', help: 'Spent / released.' },
];

/** Text colour of a balance: red when overspent, green otherwise. */
export const balanceTone = (v) => (Number(v) < 0 ? 'text-red-700' : 'text-[#1A5632]');
