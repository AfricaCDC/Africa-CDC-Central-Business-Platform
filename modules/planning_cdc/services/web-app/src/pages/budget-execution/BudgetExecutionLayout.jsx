import DashboardLayout from '@/components/layout/DashboardLayout';

const ROOT = [{ label: 'Execution' }, { label: 'Budget Execution', path: '/' }];

/**
 * App shell of the budget execution pages with their breadcrumbs.
 *
 * @param {{ crumb?: string, children: React.ReactNode }} props
 * @returns {JSX.Element}
 * @example <BudgetExecutionLayout crumb="Imports">...</BudgetExecutionLayout>
 */
export default function BudgetExecutionLayout({ crumb, children }) {
  return (
    <DashboardLayout breadcrumbs={crumb ? [...ROOT, { label: crumb }] : ROOT}>
      <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4">{children}</div>
    </DashboardLayout>
  );
}
