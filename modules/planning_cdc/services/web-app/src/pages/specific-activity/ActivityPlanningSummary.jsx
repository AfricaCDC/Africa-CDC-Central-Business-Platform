import { fmtBudget } from '@rbm/lib/formatters';
import { COMPLEXITY_CRITERIA, COMPLEXITY_RATINGS, COMPLEXITY_BANDS } from '@rbm/lib/complexity';
import { ErrorState } from '@/components/shared/QueryStates';
import { getErrorMessage } from '@/utils/errorMessage';
import { useActivityPlanning } from './hooks/useActivityPlanningQueries';

const money = (v) => fmtBudget(Number(v) || 0, { fallback: '$0' });
const ratingLabel = (v) => COMPLEXITY_RATINGS.find((r) => r.value === Number(v))?.label || '—';
const LABEL = 'text-[9px] font-semibold uppercase text-gray-400';

function Screening({ screening }) {
  if (!screening) return <p className="text-[11px] text-gray-500">Not answered yet.</p>;
  if (!screening.requires_complex_decision) return <p className="text-[11px] text-gray-800">No complex decision-making required.</p>;
  const band = COMPLEXITY_BANDS.find((b) => b.key === screening.complexity_band);
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-gray-900"><strong>Score {screening.total_score} / 15</strong>{band ? ` · ${band.label}` : ''}</p>
      {band && <p className="text-[11px] text-gray-600">{band.action}</p>}
      <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {COMPLEXITY_CRITERIA.map((c) => <li key={c.key} className="text-[10px] text-gray-600">{c.label}: <strong className="text-gray-800">{ratingLabel(screening[c.key])}</strong></li>)}
      </ul>
    </div>
  );
}

function CostLines({ lines, total }) {
  if (!lines.length) return <p className="text-[11px] text-gray-500">No cost breakdown yet.</p>;
  const byCategory = Object.entries(lines.reduce((acc, l) => ({ ...acc, [l.expense_category]: (acc[l.expense_category] || 0) + l.amount }), {}));
  return (
    <div className="space-y-2">
      <table className="w-full">
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-gray-100 text-[11px]">
              <td className="py-1.5 pr-3 text-gray-500">{l.expense_category}</td>
              <td className="py-1.5 pr-3 text-gray-800">{l.description}</td>
              <td className="py-1.5 text-right tabular-nums text-gray-900">{money(l.amount)}</td>
            </tr>
          ))}
          <tr className="text-[11px] font-semibold text-gray-900"><td className="py-1.5" colSpan={2}>Total</td><td className="py-1.5 text-right tabular-nums">{money(total)}</td></tr>
        </tbody>
      </table>
      {byCategory.length > 1 && (
        <p className="text-[10px] text-gray-500">By category: {byCategory.map(([name, amount]) => `${name} ${money(amount)}`).join(' · ')}</p>
      )}
    </div>
  );
}

/**
 * Read-only planning of a specific activity on its detail page
 * (D-20261026-01): complexity screening result and cost breakdown.
 *
 * @param {{ activityId: number }} props
 * @returns {JSX.Element}
 * @example <ActivityPlanningSummary activityId={node.id} />
 */
export default function ActivityPlanningSummary({ activityId }) {
  const { data, isLoading, isError, error, refetch } = useActivityPlanning(activityId);
  let body;
  if (isLoading) body = <div className="h-12 animate-pulse bg-gray-100" aria-label="Loading planning" />;
  else if (isError || !data) body = <ErrorState message={getErrorMessage(error, 'Could not load the planning of this activity.')} onRetry={refetch} />;
  else {
    body = (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div><p className={`${LABEL} mb-2`}>Decision Complexity Screening</p><Screening screening={data.screening} /></div>
        <div><p className={`${LABEL} mb-2`}>Cost breakdown</p><CostLines lines={data.cost_lines} total={data.total} /></div>
      </div>
    );
  }
  return <div className="border border-t-0 border-gray-200 bg-white px-6 py-4">{body}</div>;
}
