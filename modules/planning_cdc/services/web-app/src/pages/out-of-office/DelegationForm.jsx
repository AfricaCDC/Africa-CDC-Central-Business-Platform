import { useState } from 'react';
import SearchSelect from '@/components/shared/SearchSelect';
import { useDelegateCandidates } from './hooks/useOutOfOfficeQueries';

const INPUT = 'w-full border border-gray-300 px-3 py-1.5 text-[12px] outline-none focus:border-[#1A5632]';
const LABEL = 'block text-[10px] font-semibold uppercase tracking-wide text-gray-600';
const today = () => new Date().toISOString().slice(0, 10);

/**
 * New delegation: delegate (autocomplete), first and last day, reason.
 *
 * @param {{ onSubmit: (p: object) => void, isSaving: boolean, error?: string|null }} props
 * @returns {JSX.Element}
 * @example <DelegationForm onSubmit={handleCreate} isSaving={false} />
 */
export default function DelegationForm({ onSubmit, isSaving, error }) {
  const { data: users = [] } = useDelegateCandidates();
  const [delegateId, setDelegateId] = useState('');
  const [startsOn, setStartsOn] = useState(today());
  const [endsOn, setEndsOn] = useState('');
  const [reason, setReason] = useState('');
  const canSubmit = !isSaving && delegateId && startsOn && endsOn && endsOn >= startsOn;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (canSubmit) onSubmit({ delegate_id: Number(delegateId), starts_on: startsOn, ends_on: endsOn, reason: reason.trim() || null });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border border-gray-200 bg-white px-5 py-4">
      <h2 className="text-[12px] font-semibold text-gray-900">New delegation</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <span className={LABEL}>Delegate *</span>
          <SearchSelect value={delegateId || null} onChange={(v) => setDelegateId(v || '')} placeholder="— Choose a colleague —"
            options={users.map((u) => ({ value: u.id, label: u.name || u.email, sub: u.email }))} />
        </div>
        <label className={LABEL}>First day *
          <input type="date" value={startsOn} min={today()} onChange={(e) => setStartsOn(e.target.value)} className={INPUT} />
        </label>
        <label className={LABEL}>Last day *
          <input type="date" value={endsOn} min={startsOn || today()} onChange={(e) => setEndsOn(e.target.value)} className={INPUT} />
        </label>
        <label className={`${LABEL} sm:col-span-2`}>Reason
          <input type="text" value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} placeholder="Mission, leave…" className={INPUT} />
        </label>
      </div>
      {error && <p className="text-[11px] text-red-700">{error}</p>}
      <button type="submit" disabled={!canSubmit} className="bg-[#1A5632] px-5 py-2 text-[11px] font-semibold text-white disabled:opacity-50">
        {isSaving ? 'Saving…' : 'Save the delegation'}
      </button>
    </form>
  );
}
