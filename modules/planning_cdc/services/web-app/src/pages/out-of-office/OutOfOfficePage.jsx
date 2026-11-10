import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { getErrorMessage } from '@/utils/errorMessage';
import { useMyDelegations, useCreateDelegation, useEndDelegation } from './hooks/useOutOfOfficeQueries';
import DelegationForm from './DelegationForm';
import DelegationList from './DelegationList';

/**
 * Out of office (D-20261105-09): name a delegate for a period. While it
 * runs, the delegate approves in your place and receives a copy of your
 * platform emails. Also lists who delegated to you.
 *
 * @returns {JSX.Element}
 * @example <Route path="/out-of-office" element={<OutOfOfficePage />} />
 */
export default function OutOfOfficePage() {
  const { data, isLoading, error, refetch } = useMyDelegations();
  const createMutation = useCreateDelegation();
  const endMutation = useEndDelegation();
  const [formKey, setFormKey] = useState(0);

  const handleCreate = (payload) => createMutation.mutate(payload, { onSuccess: () => setFormKey((k) => k + 1) });

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Out of office' }]}>
      <div className="max-w-3xl space-y-4">
        <div>
          <h1 className="text-[18px] font-semibold text-[#1A5632]">Out of office</h1>
          <p className="text-[11px] text-gray-600">
            Away for a while? Name a colleague. From the first to the last day, they can approve what waits for you
            and receive a copy of your platform emails. You can still approve too.
          </p>
        </div>
        <DelegationForm key={formKey} onSubmit={handleCreate} isSaving={createMutation.isPending}
          error={createMutation.error && getErrorMessage(createMutation.error, 'The delegation could not be saved.')} />
        {isLoading && <Loader2 className="h-5 w-5 animate-spin text-[#1A5632]" />}
        {error && (
          <div className="border border-red-200 bg-red-50 px-4 py-3 text-[11px] text-red-800">
            {getErrorMessage(error, 'Your delegations could not be loaded.')}{' '}
            <button type="button" onClick={() => refetch()} className="underline">Try again</button>
          </div>
        )}
        {data && (
          <>
            <DelegationList title="Your delegations" empty="You have no delegation planned." rows={data.given}
              who={(d) => d.delegate_name || d.delegate_email} onEnd={(id) => endMutation.mutate(id)} isEnding={endMutation.isPending} />
            <DelegationList title="Delegated to you" empty="Nobody has delegated to you." rows={data.received}
              who={(d) => d.delegator_name || d.delegator_email} />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
