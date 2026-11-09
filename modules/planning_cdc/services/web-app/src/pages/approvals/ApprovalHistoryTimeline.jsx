import { STATUSES } from '@rbm/lib/enums';
import { useApprovalHistory } from './hooks/useApprovalQueries';

const STEP_LABEL = {
  1: 'Step 1 — Contributing HOD',
  2: 'Step 2 — Accountable HOD',
  3: 'Step 3 — M&E final review',
};

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '—';
  }
}

function getErrorMessage(error) {
  if (!error) return 'Could not load approval history.';
  return error?.response?.data?.message || error?.message || 'Could not load approval history.';
}

function decisionStyle(step) {
  // Backend writes STATUSES.APPROVED / STATUSES.REJECTED for step decisions.
  // Admin bypass is APPROVED + admin_bypass=true per contributorWorkflowEngine.js:23.
  if (step?.decision !== STATUSES.APPROVED && step?.decision !== STATUSES.REJECTED) {
    return { color: '#4a5568', label: 'Pending' };
  }
  if (step?.decision === STATUSES.REJECTED) return { color: '#DC2626', label: 'Rejected' };
  if (step?.adminBypass) return { color: '#d97706', label: 'Admin bypass' };
  return { color: '#1A5632', label: 'Approved' };
}

function TimelineItem({ step }) {
  const style = decisionStyle(step);
  return (
    <li className="flex items-start gap-3 border-l-2 pl-3" style={{ borderColor: style.color }}>
      <div className="flex-1">
        <div className="text-[11px] font-semibold text-gray-700">
          {STEP_LABEL[step.step] || `Step ${step.step}`}
          <span className="ml-2 text-[10px] font-normal" style={{ color: style.color }}>
            {style.label}
          </span>
        </div>
        <div className="text-[10px] text-gray-500">
          {step.approverName || step.approverId || '—'} · {formatDate(step.decidedAt || step.createdAt)}
        </div>
        {step.comment && (
          <div className="mt-1 text-[11px] text-gray-700">
            <em>&ldquo;{step.comment}&rdquo;</em>
          </div>
        )}
        {step.reason && (
          <div className="mt-1 text-[11px]" style={{ color: '#DC2626' }}>
            Reason: {step.reason}
          </div>
        )}
      </div>
    </li>
  );
}

function extractSteps(data) {
  if (!data) return [];
  if (Array.isArray(data.steps)) return data.steps;
  if (Array.isArray(data.data?.steps)) return data.data.steps;
  return [];
}

function StepList({ steps }) {
  return (
    <section className="border border-gray-200 bg-white p-3">
      <h3 className="mb-2 text-[12px] font-semibold text-gray-700">Approval history</h3>
      <ol className="space-y-2">
        {steps.map((step) => <TimelineItem key={step.id} step={step} />)}
      </ol>
    </section>
  );
}

/**
 * Reusable approval history timeline for report detail pages. Reads from
 * `GET /api/governance/workflows/:entityType/:entityId/history` via React Query.
 * Safe to render unconditionally — query is disabled when ids are missing.
 *
 * @param {object} props
 * @param {string} props.entityType
 * @param {string|number} props.entityId
 * @returns {JSX.Element|null}
 * @example
 * <ApprovalHistoryTimeline entityType="ACTIVITY_REPORT" entityId={42} />
 */
export default function ApprovalHistoryTimeline({ entityType, entityId }) {
  const { data, isLoading, isError, error } = useApprovalHistory(entityType, entityId);

  if (!entityType || !entityId) return null;
  if (isLoading) return <div className="p-3 text-[11px] text-gray-500">Loading approval history…</div>;
  if (isError) return <div className="border border-red-200 bg-red-50 p-3 text-[11px] text-red-700">{getErrorMessage(error)}</div>;

  const steps = extractSteps(data);
  if (steps.length === 0) {
    return <div className="p-3 text-[11px] text-gray-500">No approval history yet.</div>;
  }
  return <StepList steps={steps} />;
}
