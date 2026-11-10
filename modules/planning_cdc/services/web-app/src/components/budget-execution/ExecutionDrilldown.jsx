import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorState } from '@/components/shared/QueryStates';
import { getErrorMessage } from '@/utils/errorMessage';
import { useBudgetExecutionActivities } from '@/pages/budget-execution/hooks/useBudgetExecutionQueries';
import { DivisionsTable, ActivitiesTable } from './ExecutionTables';

/** URL parameter of the business unit opened on the dashboard. */
export const BU_PARAM = 'exec_bu';
const PAGE = 15;

function Activities({ fiscalYear, division }) {
  const navigate = useNavigate();
  const [isAll, setAll] = useState(false);
  const { data, isLoading, isError, error, refetch } = useBudgetExecutionActivities({ fiscal_year: String(fiscalYear), division });
  if (isLoading) return <div className="h-16 animate-pulse bg-gray-100" aria-label="Loading activities" />;
  if (isError) return <ErrorState message={getErrorMessage(error, 'Could not load the activities.')} onRetry={refetch} />;
  const items = data?.items || [];
  if (!items.length) return <p className="text-[11px] text-gray-500">No activity with a budget code in this import.</p>;
  return (
    <>
      <ActivitiesTable items={isAll ? items : items.slice(0, PAGE)} onOpen={(id) => navigate(`/plan/node/${id}`)} />
      {items.length > PAGE && (
        <button type="button" onClick={() => setAll((v) => !v)} className="self-start text-[11px] font-medium text-[#1A5632] hover:underline">
          {isAll ? 'Show fewer' : `Show all ${items.length} activities`}
        </button>
      )}
    </>
  );
}

/**
 * Below the totals of the dashboard block: the business units (when the
 * user sees several), then the activities of the chosen or only unit; a
 * click opens the broad activity with its budget lines.
 *
 * @param {{ fiscalYear: string, division?: string, divisions: object[] }} props
 *   `division`: fixed unit (business unit dashboard); `divisions`: from the summary
 * @returns {JSX.Element}
 * @example <ExecutionDrilldown fiscalYear="2026" divisions={summary.divisions} />
 */
export default function ExecutionDrilldown({ fiscalYear, division, divisions }) {
  const [params, setParams] = useSearchParams();
  const chosen = division || params.get(BU_PARAM) || (divisions.length === 1 ? divisions[0].division_code : null);
  const setChosen = (code) => setParams((p) => {
    const next = new URLSearchParams(p);
    if (code) next.set(BU_PARAM, code); else next.delete(BU_PARAM);
    return next;
  }, { replace: true });

  if (!chosen) return <DivisionsTable divisions={divisions} onSelect={setChosen} />;
  return (
    <>
      {!division && divisions.length > 1 && (
        <button type="button" onClick={() => setChosen(null)} className="self-start text-[11px] font-medium text-[#1A5632] hover:underline">
          ← All business units · {chosen}
        </button>
      )}
      <Activities fiscalYear={fiscalYear} division={chosen} />
    </>
  );
}
