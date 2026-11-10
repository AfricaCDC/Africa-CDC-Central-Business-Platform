import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApprovalHistory, useApproveStep, useRejectStep, useAdminBypass } from './hooks/useApprovalQueries';
import { usePermissions } from '../../hooks/usePermissions';
import ApprovalHistoryTimeline from './ApprovalHistoryTimeline';
import ApprovalActionForm from './ApprovalActionForm';
import BypassModal from './BypassModal';
import ReviewHeader from './ReviewHeader';
import AdminBypassCard from './AdminBypassCard';

const DEFAULT_ERROR = 'Request failed.';

function getErrorMessage(error) {
  if (!error) return DEFAULT_ERROR;
  const apiMessage = error.response?.data?.message;
  if (apiMessage) return apiMessage;
  return error.message || DEFAULT_ERROR;
}

function pick(data, path) {
  if (data?.[path] !== undefined) return data[path];
  return data?.data?.[path];
}

function isPendingMutation(approve, reject, bypass) {
  return approve.isPending || reject.isPending || bypass.isPending;
}

function LoadingState() {
  return <div className="mx-auto max-w-4xl p-4 text-[12px] text-gray-500">Loading approval…</div>;
}

function ErrorState({ error, onRetry }) {
  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
        {getErrorMessage(error)}{' '}
        <button type="button" onClick={onRetry} className="ml-2 underline">Retry</button>
      </div>
    </div>
  );
}

function NoPendingStep() {
  return (
    <div className="border border-gray-200 bg-white p-3 text-[11px] text-gray-500">
      This approval instance has no pending step for you.
    </div>
  );
}

function checkBypass(getScope) {
  // Admin bypass is reserved for users with an 'all' scope on reports:approve
  // (M&E / SYSTEM_ADMIN). usePermissions exposes getScope, not hasPermission —
  // the old hasPermission reference was always undefined so the bypass card
  // never rendered (FE-2).
  if (typeof getScope !== 'function') return false;
  return getScope('reports', 'approve') === 'all';
}

function buildDecisionBody(payload) {
  if (payload.action === 'approve') return { comment: payload.comment };
  return { reason: payload.reason };
}

/**
 * Full page for reviewing one pending approval step. Multi-line comment +
 * reason fields make this a dedicated page per CHARTER §4 ("Forms with > 3
 * fields = dedicated page"). Route: `/approvals/:instanceId` (spec §9.1).
 *
 * @returns {JSX.Element}
 */
export default function ApprovalReviewPage() {
  const { instanceId } = useParams();
  const navigate = useNavigate();
  const { getScope } = usePermissions();
  const canBypass = checkBypass(getScope);

  const { data, isLoading, isError, error, refetch } = useApprovalHistory('INSTANCE', instanceId);
  const instance = pick(data, 'instance');
  const currentStep = pick(data, 'currentStep');
  const entityType = instance?.entityType;
  const entityId = instance?.entityId;
  const stepId = currentStep?.id;

  const [formError, setFormError] = useState('');
  const [bypassOpen, setBypassOpen] = useState(false);

  const approveMutation = useApproveStep({ stepId, entityType, entityId });
  const rejectMutation = useRejectStep({ stepId, entityType, entityId });
  const bypassMutation = useAdminBypass({ instanceId, entityType, entityId });

  const goInbox = () => navigate('/approvals/inbox');
  const handleError = (err) => setFormError(getErrorMessage(err));

  function handleDecision(payload) {
    setFormError('');
    const mutation = payload.action === 'approve' ? approveMutation : rejectMutation;
    mutation.mutate(buildDecisionBody(payload), { onSuccess: goInbox, onError: handleError });
  }

  function handleBypassConfirm(reason) {
    setFormError('');
    bypassMutation.mutate({ reason }, {
      onSuccess: () => { setBypassOpen(false); goInbox(); },
      onError: handleError,
    });
  }

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState error={error} onRetry={refetch} />;

  const isSubmitting = isPendingMutation(approveMutation, rejectMutation, bypassMutation);
  const canAct = Boolean(stepId);

  return (
    <div className="mx-auto max-w-4xl p-4">
      <ReviewHeader
        instance={instance}
        currentStep={currentStep}
        entityType={entityType}
        onBack={goInbox}
      />
      <div className="mb-3">
        <ApprovalHistoryTimeline entityType={entityType} entityId={entityId} />
      </div>
      {canAct
        ? <ApprovalActionForm onSubmit={handleDecision} isSubmitting={isSubmitting} errorMessage={formError} />
        : <NoPendingStep />}
      {canBypass && <AdminBypassCard onOpen={() => setBypassOpen(true)} />}
      <BypassModal
        open={bypassOpen}
        onConfirm={handleBypassConfirm}
        onCancel={() => setBypassOpen(false)}
        isSubmitting={bypassMutation.isPending}
      />
    </div>
  );
}
