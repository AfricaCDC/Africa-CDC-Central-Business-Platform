import { Link, useSearchParams } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { RBAC_MODULES, RBAC_ACTIONS, RBAC_SCOPES } from '@rbm/lib/rbac';
import { usePermissions } from '@/hooks/usePermissions';
import { ErrorState } from '@/components/shared/QueryStates';
import { getErrorMessage } from '@/utils/errorMessage';
import { useBudgetExecutionSummary } from '@/pages/budget-execution/hooks/useBudgetExecutionQueries';
import ImportStatusBanner from '@/pages/budget-execution/imports/ImportStatusBanner';
import ExecutionFigures from './ExecutionFigures';
import ExecutionBar from './ExecutionBar';
import ExecutionDrilldown, { BU_PARAM } from './ExecutionDrilldown';
import { day } from './budgetFigures';

const LINK = 'border border-gray-300 bg-white px-2.5 py-1 text-[10px] font-medium text-gray-700 hover:bg-gray-50';

function Shell({ children, asOf, canManage }) {
  return (
    <section className="border border-gray-200 border-t-0 bg-white">
      <header className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
        <Wallet className="h-3.5 w-3.5 text-[#1A5632]" />
        <h3 className="text-[12px] font-semibold text-gray-800">Budget execution</h3>
        {asOf && <span className="text-[10px] text-gray-500">Figures as at {day(asOf)}</span>}
        {canManage && (
          <span className="ml-auto flex gap-2">
            <Link to="/budget-execution/unlinked" className={LINK}>Unlinked budget codes</Link>
            <Link to="/budget-execution/imports" className={`${LINK} border-[#1A5632] text-[#1A5632]`}>Import budget execution</Link>
          </span>
        )}
      </header>
      <div className="flex flex-col gap-3 p-4">{children}</div>
    </section>
  );
}

/**
 * Budget execution on the home dashboards (D-20261015-04): balance,
 * released, committed, spent and the rates from the latest import, then the
 * business units and their activities (a click opens the broad activity with
 * its budget lines). Limited to what the user may see, and to `division`
 * when given. Managers also get this week's import status and their tools.
 * Hidden for users without access.
 *
 * @param {{ fiscalYear: string, division?: string }} props
 * @returns {JSX.Element|null}
 * @example <BudgetExecutionWidget fiscalYear="2026" division="EPR" />
 */
export default function BudgetExecutionWidget({ fiscalYear, division }) {
  const { getScope } = usePermissions();
  const [params] = useSearchParams();
  const canRead = !!getScope(RBAC_MODULES.BUDGET_EXECUTION, RBAC_ACTIONS.READ);
  const canManage = getScope(RBAC_MODULES.BUDGET_EXECUTION, RBAC_ACTIONS.CREATE) === RBAC_SCOPES.ALL;
  const summaryParams = { fiscal_year: String(fiscalYear), ...(division ? { division } : {}) };
  const { data, isLoading, isError, error, refetch } = useBudgetExecutionSummary(canRead ? summaryParams : null);

  if (!canRead) return null;
  if (isLoading) return <Shell canManage={canManage}><div className="h-20 animate-pulse bg-gray-100" aria-label="Loading budget execution" /></Shell>;
  if (isError) return <Shell canManage={canManage}><ErrorState message={getErrorMessage(error, 'Could not load the budget execution.')} onRetry={refetch} /></Shell>;
  return <Loaded data={data} fiscalYear={fiscalYear} division={division} canManage={canManage} opened={params.get(BU_PARAM)} />;
}

function Loaded({ data, fiscalYear, division, canManage, opened }) {
  const banner = canManage && <ImportStatusBanner />;
  if (!data?.import) {
    return <Shell canManage={canManage}>{banner}<p className="text-[11px] text-gray-500">No budget execution imported for {fiscalYear} yet.</p></Shell>;
  }
  const unit = !division && data.divisions.find((d) => d.division_code === opened);
  const totals = unit || data.totals;
  return (
    <Shell asOf={data.import.as_of_date} canManage={canManage}>
      {banner}
      <ExecutionFigures totals={totals} />
      <ExecutionBar totals={totals} />
      <ExecutionDrilldown fiscalYear={fiscalYear} division={division} divisions={data.divisions} />
    </Shell>
  );
}
