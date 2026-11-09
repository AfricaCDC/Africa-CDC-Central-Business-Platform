import { STATUS_STYLES } from '@rbm/lib/enums';
import { ErrorState } from '@/components/shared/QueryStates';
import { getErrorMessage } from '@/utils/errorMessage';
import { useActivityTrail } from './hooks/useActivityPlanningQueries';

const LABEL = 'text-[9px] font-semibold uppercase text-gray-400';
const when = (iso) => new Date(iso).toLocaleString('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function WaitingFor({ waiting }) {
  if (!waiting) return null;
  const who = waiting.name || 'nobody: ask your administrator to name one in Org Structure';
  return (
    <p className="mb-3 text-[11px] text-gray-800">
      Waiting for: <strong>{who}</strong>{waiting.step ? ` (${waiting.step})` : ''}
    </p>
  );
}

function Events({ events }) {
  if (!events.length) return <p className="text-[11px] text-gray-500">No history recorded for this activity.</p>;
  return (
    <ol className="space-y-2">
      {events.map((e) => (
        <li key={e.id} className="grid grid-cols-1 gap-x-3 text-[11px] sm:grid-cols-[130px_160px_1fr]">
          <span className="tabular-nums text-gray-500">{when(e.at)}</span>
          <span className="text-gray-700">{e.actor || 'System'}</span>
          <span>
            <span className={e.decision ? `font-semibold ${STATUS_STYLES[e.decision]?.text || ''}` : 'text-gray-900'}>{e.label}</span>
            {e.comment && <span className="mt-0.5 block text-[10px] text-gray-600">&ldquo;{e.comment}&rdquo;</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Approval trail on the specific activity page (D-20261103-02): who created,
 * edited, submitted, approved or rejected it, and whom it waits for.
 *
 * @param {{ activityId: number }} props
 * @returns {JSX.Element}
 * @example <ApprovalTrail activityId={node.id} />
 */
export default function ApprovalTrail({ activityId }) {
  const { data, isLoading, isError, error, refetch } = useActivityTrail(activityId);
  let body;
  if (isLoading) body = <div className="h-12 animate-pulse bg-gray-100" aria-label="Loading approval trail" />;
  else if (isError || !data) body = <ErrorState message={getErrorMessage(error, 'Could not load the approval trail.')} onRetry={refetch} />;
  else body = <><WaitingFor waiting={data.waiting_for} /><Events events={data.events} /></>;
  return (
    <div className="border border-t-0 border-gray-200 bg-white px-6 py-4">
      <p className={`${LABEL} mb-3`}>Approval trail</p>
      {body}
    </div>
  );
}
