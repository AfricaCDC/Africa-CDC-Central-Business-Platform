import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { getErrorMessage } from '@/utils/errorMessage';
import { useApprovalStep, useDecideStep } from './hooks/useDecideQueries';
import DecideForm from './DecideForm';

const REJECT = 'reject';

function Frame({ children }) {
  return (
    <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Decide' }]}>
      <div className="max-w-xl">{children}</div>
    </DashboardLayout>
  );
}

const TONES = {
  plain: 'border-gray-200 bg-white text-gray-700',
  red: 'border-red-200 bg-red-50 text-red-800',
  green: 'border-green-200 bg-green-50 text-[#1A5632]',
};

function Notice({ tone = 'plain', children }) {
  return <div className={`border px-5 py-4 text-[11px] ${TONES[tone]}`}>{children}</div>;
}

function ItemSummary({ step }) {
  const period = [step.quarter, step.fiscal_year].filter(Boolean).join(' ');
  return (
    <div className="border border-gray-200 bg-white px-5 py-4">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{step.type_label}</p>
      <p className="mt-1 text-[12px] font-semibold text-gray-900">
        {step.code && <span className="mr-2 font-mono text-[#1A5632]">{step.code}</span>}{step.title || 'Untitled'}
      </p>
      <p className="mt-1 text-[11px] text-gray-600">{[step.unit_code, period, step.step_label].filter(Boolean).join(' · ')}</p>
      {step.approver_name && <p className="mt-1 text-[11px] text-gray-500">Approver: {step.approver_name}</p>}
      {step.link && <Link to={step.link} className="mt-2 inline-block text-[12px] text-[#1A5632] hover:underline">Open the full page</Link>}
    </div>
  );
}

function LoadError({ error, onRetry }) {
  const status = error.response?.status;
  return (
    <Notice tone="red">
      {getErrorMessage(error, 'This approval could not be opened.')}{' '}
      {/* Retrying cannot help a refusal (403) or a missing step (404). */}
      {(!status || status >= 500) && <button type="button" onClick={onRetry} className="underline">Try again</button>}
    </Notice>
  );
}

function Decided({ decision, step }) {
  const isRejected = decision === REJECT;
  return (
    <>
      <Notice tone="green">
        <span className="flex items-center gap-2">
          {isRejected ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {isRejected ? 'Rejected. The author has been told, with your reason.' : 'Approved. Thank you.'}
        </span>
      </Notice>
      <div className="mt-3"><ItemSummary step={step} /></div>
    </>
  );
}

function Closed({ step }) {
  return (
    <Notice>
      This approval is already closed{step.decided_by_name ? `: decided by ${step.decided_by_name}` : ''}. Nothing more to do.
    </Notice>
  );
}

/**
 * « Decide from the email » page (D-20261105-10). The Approve / Reject
 * buttons of the approval emails open it; it shows the item and asks to
 * confirm (and a reason to reject), so opening the link never decides.
 *
 * @returns {JSX.Element}
 * @example <Route path="/decide/:stepId" element={<DecidePage />} />
 */
export default function DecidePage() {
  const { stepId } = useParams();
  const [params] = useSearchParams();
  const [done, setDone] = useState(null);
  const { data: step, isLoading, error, refetch } = useApprovalStep(stepId);
  const decideMutation = useDecideStep();

  const handleDecide = ({ decision, reason }) => {
    decideMutation.mutate(
      { entityType: step.entity_type, entityId: step.entity_id, decision, reason },
      { onSuccess: () => setDone(decision) },
    );
  };

  if (isLoading) return <Frame><Loader2 className="h-5 w-5 animate-spin text-[#1A5632]" /></Frame>;
  if (error) return <Frame><LoadError error={error} onRetry={() => refetch()} /></Frame>;
  if (done) return <Frame><Decided decision={done} step={step} /></Frame>;
  return (
    <Frame>
      <h1 className="mb-3 text-[16px] font-semibold text-[#1A5632]">Your decision</h1>
      <ItemSummary step={step} />
      <div className="mt-3">
        {step.can_decide ? (
          <DecideForm initialDecision={params.get('d') === REJECT ? REJECT : 'approve'} isSaving={decideMutation.isPending}
            error={decideMutation.error && getErrorMessage(decideMutation.error, 'The decision could not be saved.')}
            onDecide={handleDecide} />
        ) : <Closed step={step} />}
      </div>
    </Frame>
  );
}
