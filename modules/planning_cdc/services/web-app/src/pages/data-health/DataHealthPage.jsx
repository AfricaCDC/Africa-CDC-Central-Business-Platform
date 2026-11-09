import DashboardLayout from '@/components/layout/DashboardLayout';
import { LoadingState, ErrorState } from '@/components/shared/QueryStates';
import { usePlanningYear } from '@/contexts/PlanningYearContext';
import { getErrorMessage } from '@/utils/errorMessage';
import { useDataHealth } from './hooks/useDataHealthQueries';
import DataHealthCheck from './DataHealthCheck';

function Summary({ checks }) {
  const open = checks.filter((c) => c.count > 0);
  if (!open.length) return <p className="text-[11px] text-[#1A5632]">Every check is complete.</p>;
  const total = open.reduce((sum, c) => sum + c.count, 0);
  return <p className="text-[11px] text-gray-600">{total} records to complete in {open.length} of {checks.length} checks.</p>;
}

/**
 * Data health (D-20261105-11): the records that hold up approvals, reports
 * or the budget follow-up, for the plan year chosen in the top bar. The
 * M&E officers and RBM administrators also receive it each Monday.
 *
 * @returns {JSX.Element}
 * @example <Route path="/admin/data-health" element={<DataHealthPage />} />
 */
export default function DataHealthPage() {
  const { planningYear } = usePlanningYear();
  const { data, isLoading, error, refetch } = useDataHealth(planningYear);

  const body = () => {
    if (isLoading) return <LoadingState />;
    if (error) {
      // A refusal (403) does not go away by retrying.
      const isRefused = error.response?.status === 403;
      return <ErrorState message={getErrorMessage(error, 'The checks could not be loaded.')} onRetry={isRefused ? undefined : () => refetch()} />;
    }
    return (
      <>
        <Summary checks={data.checks} />
        {data.checks.map((c) => <DataHealthCheck key={c.key} check={c} />)}
      </>
    );
  };

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Data Health' }]}>
      <div className="max-w-5xl space-y-3">
        <div>
          <h1 className="text-[18px] font-semibold text-[#1A5632]">Data Health {planningYear}</h1>
          <p className="text-[11px] text-gray-600">
            What blocks approvals, reports or the budget follow-up until someone completes it. Click a row to open the page where it is fixed.
          </p>
        </div>
        {body()}
      </div>
    </DashboardLayout>
  );
}
