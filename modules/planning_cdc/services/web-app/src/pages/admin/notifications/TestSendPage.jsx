/**
 * TestSendPage — fire a synthetic event through `emitEvent` and display the
 * dispatch counts returned by the wizard. Useful for QA + smoke checks.
 *
 * Spec: docs/specs/notification-wizard.md §6.4
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { FlaskConical, Send, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useNotificationEvents,
  useTestSend,
} from './hooks/useNotificationsAdminQueries';

const BREADCRUMBS = [
  { label: 'Admin' },
  { label: 'Notifications', to: '/admin/notifications' },
  { label: 'Test send' },
];

function parseJson(value, fallback) {
  if (!value || !value.trim()) return { ok: true, value: fallback };
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function ResultPanel({ result }) {
  if (!result) return null;
  return (
    <div className="border border-green-200 bg-green-50 px-4 py-3 mt-4 text-[11px] text-green-900">
      <div className="flex items-center gap-2 mb-1.5">
        <CheckCircle2 className="w-4 h-4" />
        <strong>Dispatch complete</strong>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
        <div>
          <div className="text-[10px] uppercase text-green-700/70">Subscriptions matched</div>
          <div className="text-[14px] font-semibold">{result.matched ?? 0}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-green-700/70">Recipients</div>
          <div className="text-[14px] font-semibold">{result.recipients ?? 0}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-green-700/70">Outbox rows</div>
          <div className="text-[14px] font-semibold">{result.outboxRows ?? 0}</div>
        </div>
      </div>
    </div>
  );
}

function TestSendPage() {
  const eventsQ = useNotificationEvents();
  const testMut = useTestSend();

  const [eventKey, setEventKey] = useState('');
  const [entityText, setEntityText] = useState('');
  const [metadataText, setMetadataText] = useState('');
  const [result, setResult] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!eventKey) {
      toast.error('Pick an event to send');
      return;
    }
    const entity = parseJson(entityText, undefined);
    const metadata = parseJson(metadataText, undefined);
    if (!entity.ok) { toast.error(`Entity JSON invalid: ${entity.error}`); return; }
    if (!metadata.ok) { toast.error(`Metadata JSON invalid: ${metadata.error}`); return; }

    setResult(null);
    testMut.mutate(
      { event_key: eventKey, entity: entity.value, metadata: metadata.value },
      {
        onSuccess: (data) => {
          setResult(data);
          toast.success('Test event dispatched');
        },
        onError: (err) => toast.error(err?.response?.data?.message || 'Test send failed'),
      },
    );
  };

  const events = eventsQ.data || [];

  return (
    <DashboardLayout breadcrumbs={BREADCRUMBS}>
      <div className="bg-[#1A5632] text-white px-6 py-5">
        <div className="flex items-center gap-3 mb-2">
          <FlaskConical className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">
            Wizard · Test Send
          </span>
        </div>
        <h1 className="text-[16px] font-semibold">Send a synthetic event</h1>
        <p className="text-[11px] text-white/60 mt-1">
          Fires <code>emitEvent</code> and reports what would be dispatched in production.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="px-6 py-5 max-w-3xl space-y-4">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1">
            Event Key <span className="text-red-600">*</span>
          </label>
          <select
            value={eventKey}
            onChange={(e) => setEventKey(e.target.value)}
            className="w-full border border-gray-300 px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-[#1A5632]"
          >
            <option value="">— Select an event —</option>
            {events.map((ev) => (
              <option key={ev.event_key} value={ev.event_key}>
                {ev.event_key} {ev.label ? `— ${ev.label}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1">
            Entity (JSON, optional)
          </label>
          <textarea
            value={entityText}
            onChange={(e) => setEntityText(e.target.value)}
            rows={5}
            placeholder='e.g. { "id": 42, "title": "Test activity" }'
            className="w-full border border-gray-300 px-2.5 py-1.5 text-[11px] font-mono focus:outline-none focus:border-[#1A5632]"
          />
        </div>

        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1">
            Metadata (JSON, optional)
          </label>
          <textarea
            value={metadataText}
            onChange={(e) => setMetadataText(e.target.value)}
            rows={4}
            placeholder='e.g. { "reason": "smoke test" }'
            className="w-full border border-gray-300 px-2.5 py-1.5 text-[11px] font-mono focus:outline-none focus:border-[#1A5632]"
          />
          <p className="text-[10px] text-gray-500 mt-1">
            The wizard tags every test send with <code>_test: true</code> in metadata.
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <Link
            to="/admin/notifications"
            className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 hover:text-gray-800"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to list
          </Link>
          <button
            type="submit"
            disabled={testMut.isPending}
            className="inline-flex items-center gap-1.5 bg-[#1A5632] text-white text-[11px] px-3 py-1.5 hover:bg-[#14442A] disabled:opacity-60"
          >
            {testMut.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Send className="w-3.5 h-3.5" />
            }
            Send test event
          </button>
        </div>

        <ResultPanel result={result} />
      </form>
    </DashboardLayout>
  );
}

export default TestSendPage;
