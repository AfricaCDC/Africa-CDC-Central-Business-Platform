import { useState, useMemo } from 'react';
import { Loader2, BellRing, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAppSettings, useUpdateAppSettings } from './hooks/useAdminQueries';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/**
 * Admin section: email reminder schedulers (D-20260707-01).
 *
 * Edits the `reminders.*` rows of `app_settings`:
 *   - Draft reminder    → reporters with unsubmitted DRAFT reports (daily).
 *   - Deadline reminder → approvers with reports awaiting their decision,
 *     fired N days before the OPEN period's end_date.
 *   - Review reminder   → each approver, every weekday, the reports waiting
 *     for their decision on /review-submissions (D-20261015-01).
 *
 * Values apply live — the api-server crons re-read settings on every tick
 * (≤15 min), no restart needed.
 *
 * @returns {JSX.Element}
 * @example <EmailRemindersSettings />
 */
export default function EmailRemindersSettings() {
  const { data: rows = [], isLoading, error, refetch } = useAppSettings('reminders.');
  const updateMut = useUpdateAppSettings();
  // Only the user's pending edits live in state; displayed values are derived
  // (edits override fetched values). No hydration effect needed, and the save
  // payload naturally contains just the changed keys.
  const [edits, setEdits] = useState({});

  const values = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.key, r.value])),
    [rows],
  );
  const val = (key, dflt) => edits[key] ?? values[key] ?? dflt;
  const dirty = Object.keys(edits).length > 0;

  const setField = (key, value) => {
    setEdits((e) => ({ ...e, [key]: value }));
  };

  const validateDays = (raw) => {
    const parts = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
    return parts.length > 0 && parts.every((p) => /^\d+$/.test(p) && Number(p) <= 90);
  };

  const handleSave = async () => {
    if (!validateDays(val('reminders.deadline.days_before', '7,3,1'))) {
      toast.error('Deadline days must be a comma-separated list of numbers (0–90), e.g. 7,3,1');
      return;
    }
    try {
      await updateMut.mutateAsync(edits);
      toast.success('Reminder settings saved');
      setEdits({});
    } catch (err) {
      const msg = err.response?.data?.message;
      toast.error(typeof msg === 'string' ? msg : 'Failed to save settings');
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 border-t-0 px-5 py-8 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-[#1A5632]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-gray-200 border-t-0 px-5 py-6 text-center">
        <p className="text-[12px] text-gray-500">Failed to load reminder settings.</p>
        <button onClick={() => refetch()} className="mt-2 text-[11px] px-3 py-1 border border-gray-300 text-gray-600 hover:bg-gray-50">Retry</button>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="bg-white border border-gray-200 border-t-0 px-5 py-6 text-center text-[12px] text-gray-400">
        No reminder settings found — run the latest database migrations.
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 border-t-0">
      <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BellRing className="w-4 h-4 text-[#1A5632]" />
          <h3 className="text-[13px] font-semibold text-gray-800">Email Reminders</h3>
          <span className="text-[10px] text-gray-400 ml-1">Applied live — no restart needed</span>
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || updateMut.isPending}
          className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-[#1A5632] text-white hover:bg-[#15472a] disabled:opacity-40"
        >
          {updateMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
        {/* Draft reminder — reporters */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <div className="text-[12px] font-semibold text-gray-900">Draft reports — reporters</div>
            <p className="text-[10px] text-gray-400 mt-0.5">Daily email to users with unsubmitted DRAFT reports.</p>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={val('reminders.draft.enabled', '0') === '1'}
              onChange={(e) => setField('reminders.draft.enabled', e.target.checked ? '1' : '0')}
            />
            Enabled
          </label>
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Send after (UTC hour)</label>
            <select
              value={val('reminders.draft.hour_utc', '6')}
              onChange={(e) => setField('reminders.draft.hour_utc', e.target.value)}
              className="w-[120px] text-[12px] border border-gray-300 px-2 py-1.5 focus:outline-none focus:border-[#1A5632]"
            >
              {HOURS.map((h) => <option key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </div>
        </div>

        {/* Deadline reminder — approvers */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <div className="text-[12px] font-semibold text-gray-900">Quarter deadline — approvers</div>
            <p className="text-[10px] text-gray-400 mt-0.5">Email to approvers with reports awaiting their decision, sent N days before the open period closes.</p>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={val('reminders.deadline.enabled', '0') === '1'}
              onChange={(e) => setField('reminders.deadline.enabled', e.target.checked ? '1' : '0')}
            />
            Enabled
          </label>
          <div className="flex items-end gap-4">
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Days before close</label>
              <input
                type="text"
                value={val('reminders.deadline.days_before', '7,3,1')}
                onChange={(e) => setField('reminders.deadline.days_before', e.target.value)}
                placeholder="7,3,1"
                className="w-[120px] text-[12px] border border-gray-300 px-2 py-1.5 focus:outline-none focus:border-[#1A5632]"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Send after (UTC hour)</label>
              <select
                value={val('reminders.deadline.hour_utc', '6')}
                onChange={(e) => setField('reminders.deadline.hour_utc', e.target.value)}
                className="w-[120px] text-[12px] border border-gray-300 px-2 py-1.5 focus:outline-none focus:border-[#1A5632]"
              >
                {HOURS.map((h) => <option key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Review reminder — approvers, every weekday */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <div className="text-[12px] font-semibold text-gray-900">Pending reviews — M&amp;E and approvers</div>
            <p className="text-[10px] text-gray-400 mt-0.5">Every weekday, each approver receives the list of reports waiting for their decision. Recipients and wording are managed in Notifications (review_queue.pending).</p>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={val('reminders.review.enabled', '1') === '1'}
              onChange={(e) => setField('reminders.review.enabled', e.target.checked ? '1' : '0')}
            />
            Enabled
          </label>
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Send after (UTC hour)</label>
            <select
              value={val('reminders.review.hour_utc', '6')}
              onChange={(e) => setField('reminders.review.hour_utc', e.target.value)}
              className="w-[120px] text-[12px] border border-gray-300 px-2 py-1.5 focus:outline-none focus:border-[#1A5632]"
            >
              {HOURS.map((h) => <option key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
