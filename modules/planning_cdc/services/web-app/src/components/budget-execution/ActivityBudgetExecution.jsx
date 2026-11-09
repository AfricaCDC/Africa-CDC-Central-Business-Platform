import { Wallet } from 'lucide-react';
import { RBAC_MODULES, RBAC_ACTIONS } from '@rbm/lib/rbac';
import { usePermissions } from '@/hooks/usePermissions';
import { ErrorState } from '@/components/shared/QueryStates';
import { getErrorMessage } from '@/utils/errorMessage';
import { useBudgetExecutionActivity } from '@/pages/budget-execution/hooks/useBudgetExecutionQueries';
import ExecutionFigures from './ExecutionFigures';
import ExecutionBar from './ExecutionBar';
import FundCenterCard from './FundCenterCard';
import { money, day } from './budgetFigures';

const NOT_FOUND = 404;

function Shell({ children, asOf }) {
  return (
    <section className="border border-gray-200 border-t-0 bg-white">
      <header className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-5 py-3">
        <Wallet className="h-3.5 w-3.5 text-[#1A5632]" />
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#1A5632]">Budget execution</h2>
        {asOf && <span className="text-[10px] text-gray-500">Figures as at {day(asOf)}</span>}
      </header>
      <div className="flex flex-col gap-3 p-4">{children}</div>
    </section>
  );
}

/**
 * Budget execution of a broad activity, on its detail page (D-20261015-04):
 * balance and figures, then every budget code with its funds and expense
 * lines. Hidden for users without `budget_execution:read`.
 *
 * @param {{ activityId: number, fiscalYear: string }} props
 * @returns {JSX.Element|null}
 * @example <ActivityBudgetExecution activityId={node.id} fiscalYear={node.fiscal_year} />
 */
export default function ActivityBudgetExecution({ activityId, fiscalYear }) {
  const { getScope } = usePermissions();
  const canRead = !!getScope(RBAC_MODULES.BUDGET_EXECUTION, RBAC_ACTIONS.READ);
  const query = useBudgetExecutionActivity(canRead ? activityId : null, String(fiscalYear || ''));
  return canRead ? <Content query={query} /> : null;
}

function Content({ query: { data, isLoading, isError, error, refetch } }) {
  if (isLoading) return <Shell><div className="h-16 animate-pulse bg-gray-100" aria-label="Loading budget execution" /></Shell>;
  if (isError && error?.response?.status === NOT_FOUND) {
    return <Shell><p className="text-[11px] text-gray-500">No budget execution for this activity: none of its budget codes is in the latest import.</p></Shell>;
  }
  if (isError || !data) return <Shell><ErrorState message={getErrorMessage(error, 'Could not load the budget execution.')} onRetry={refetch} /></Shell>;
  const a = data.activity;
  return (
    <Shell asOf={data.import.as_of_date}>
      <p className="text-[11px] text-gray-500">
        Planned in the workplan: <strong className="text-gray-800">{money(a.planned)}</strong> · {a.fund_centers.length} budget {a.fund_centers.length === 1 ? 'code' : 'codes'}
      </p>
      <ExecutionFigures totals={a} />
      <ExecutionBar totals={a} />
      <h3 className="text-[10px] font-semibold uppercase text-gray-600">By budget code, fund and expense line</h3>
      {a.fund_centers.map((c) => <FundCenterCard key={c.fund_center} center={c} />)}
    </Shell>
  );
}
