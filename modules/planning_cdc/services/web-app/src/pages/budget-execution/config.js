/** Years offered in the filters: 2026 to next year. */
const FIRST_YEAR = 2026;
export const YEAR_OPTIONS = Array.from({ length: new Date().getFullYear() + 2 - FIRST_YEAR }, (_, i) => String(FIRST_YEAR + i));

export { money, rate, day, FIGURES, RATES, balanceTone } from '@/components/budget-execution/budgetFigures';
