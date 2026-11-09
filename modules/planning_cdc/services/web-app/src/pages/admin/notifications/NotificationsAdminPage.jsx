/* eslint-disable max-lines -- Grouped card view + inline filter/toolbar + confirm dialog; splitting would fragment a cohesive admin flow. */
/**
 * NotificationsAdminPage — landing for `/admin/notifications`.
 *
 * Grouped-by-event card view (inspired by Frappe Notification DocType):
 * one card per event, subscriptions shown as compact rows inside.
 * Filters at the top (free-text search, active-only toggle).
 * Edit / Delete / Toggle actions stay inline per subscription.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { Bell, Plus, FlaskConical, Loader2, Search, ChevronDown, ChevronRight, Pencil, Trash2, Users, AtSign, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import {
  useNotificationSubscriptions,
  useToggleSubscription,
  useDeleteSubscription,
} from './hooks/useNotificationsAdminQueries';

const BREADCRUMBS = [{ label: 'Admin' }, { label: 'Notification Wizard' }];

// Human labels for the machine-coded recipient_scope values — keeps the
// scope column readable for non-devs. Falls back to raw code when unknown.
const SCOPE_LABELS = {
  entity_main_hod:       'HOD of the main division',
  entity_contrib_hods:   'HODs of contributing divisions',
  focal_of_main:         'Focal of the main division',
  role_all:              'Everyone with the selected role',
  role_all_active:       'Every active user with the role',
  submitter:             'Submitter of the entity',
  owner:                 'Owner of the entity',
  entity_owner:          'Owner of the entity',
  entity_previous_owner: 'Previous owner of the entity',
};

const CHANNEL_ICON = {
  email: AtSign,
  inapp: MessageSquare,
  sms:   MessageSquare,
};

function ToggleSwitch({ checked, onChange, busy }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={busy}
      aria-pressed={checked}
      className={`inline-flex items-center h-5 w-9 border ${checked ? 'bg-[#1A5632] border-[#14442A]' : 'bg-gray-200 border-gray-300'} px-0.5`}
    >
      <span className={`block w-4 h-4 bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  );
}

function RecipientChip({ row }) {
  const label = SCOPE_LABELS[row.recipient_scope] || row.recipient_scope;
  return (
    <span className="inline-flex items-center gap-1 bg-[#1A5632]/10 text-[#1A5632] text-[10px] px-1.5 py-0.5">
      <Users className="w-3 h-3" />
      {label}
      {row.recipient_role && <span className="text-[9px] text-gray-500 ml-1">· {row.recipient_role}</span>}
    </span>
  );
}

function SubscriptionRow({ row, onToggle, onDelete, toggleBusy, deleteBusy }) {
  const ChannelIcon = CHANNEL_ICON[row.channel] || MessageSquare;
  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50">
      <td className="px-3 py-2">
        <RecipientChip row={row} />
      </td>
      <td className="px-3 py-2 text-[11px] text-gray-700">
        <span className="inline-flex items-center gap-1">
          <ChannelIcon className="w-3 h-3 text-gray-400" />
          {row.channel}
        </span>
      </td>
      <td className="px-3 py-2 text-[10px] font-mono text-gray-500">{row.template_key}</td>
      <td className="px-3 py-2 text-[10px] text-gray-500">P{row.priority}</td>
      <td className="px-3 py-2">
        <ToggleSwitch
          checked={Boolean(row.is_active)}
          busy={toggleBusy}
          onChange={() => onToggle(row)}
        />
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <Link
          to={`/admin/notifications/subscriptions/${row.id}/edit`}
          className="text-[11px] text-gray-500 hover:text-[#1A5632] inline-flex items-center gap-1 mr-2"
          title="Edit"
        ><Pencil className="w-3 h-3" /></Link>
        <button
          type="button"
          onClick={() => onDelete(row)}
          disabled={deleteBusy}
          className="text-[11px] text-red-500 hover:text-red-700 inline-flex items-center"
          title="Delete"
        ><Trash2 className="w-3 h-3" /></button>
      </td>
    </tr>
  );
}

function EventCard({ eventKey, eventLabel, rows, onToggle, onDelete, toggleBusy, deleteBusy }) {
  const [open, setOpen] = useState(true);
  const active = rows.filter((r) => r.is_active).length;
  return (
    <div className="bg-white border border-gray-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
      >
        <div className="flex items-center gap-2 text-left">
          {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          <div>
            <div className="text-[12px] font-semibold text-gray-800">{eventLabel || eventKey}</div>
            <div className="text-[9px] font-mono text-gray-400">{eventKey}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 text-[10px] text-gray-500">
          <span><strong className="text-gray-800">{rows.length}</strong> subscription{rows.length > 1 ? 's' : ''}</span>
          <span><strong className="text-emerald-700">{active}</strong> active</span>
        </div>
      </button>
      {open && (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-gray-50 border-t border-gray-200 text-[9px] uppercase text-gray-500">
              <th className="px-3 py-1.5 text-left font-medium">Recipient</th>
              <th className="px-3 py-1.5 text-left font-medium">Channel</th>
              <th className="px-3 py-1.5 text-left font-medium">Template</th>
              <th className="px-3 py-1.5 text-left font-medium">Priority</th>
              <th className="px-3 py-1.5 text-left font-medium">Active</th>
              <th className="px-3 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <SubscriptionRow
                key={r.id}
                row={r}
                onToggle={onToggle}
                onDelete={onDelete}
                toggleBusy={toggleBusy}
                deleteBusy={deleteBusy}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-gray-300 px-6 py-10 text-center">
      <Bell className="w-6 h-6 text-gray-400 mx-auto mb-2" />
      <p className="text-[12px] text-gray-700 mb-1">No subscriptions configured yet.</p>
      <p className="text-[11px] text-gray-500 mb-4">
        Add a subscription to start dispatching notifications for an event.
      </p>
      <Link
        to="/admin/notifications/subscriptions/new"
        className="inline-flex items-center gap-1.5 bg-[#1A5632] text-white text-[11px] px-3 py-1.5 hover:bg-[#14442A]"
      >
        <Plus className="w-3.5 h-3.5" /> New subscription
      </Link>
    </div>
  );
}

function StatTile({ label, value, tone = 'default' }) {
  const tones = {
    default: 'bg-white',
    active:  'bg-emerald-50 text-emerald-800',
    events:  'bg-[#1A5632]/5 text-[#1A5632]',
  };
  return (
    <div className={`border border-gray-200 px-4 py-3 flex items-baseline justify-between ${tones[tone]}`}>
      <span className="text-[10px] uppercase tracking-wide text-gray-500">{label}</span>
      <span className="text-[20px] font-bold">{value}</span>
    </div>
  );
}

export default function NotificationsAdminPage() {
  const { data, isLoading, error, refetch } = useNotificationSubscriptions();
  const toggleMut = useToggleSubscription();
  const deleteMut = useDeleteSubscription();
  const [pendingDelete, setPendingDelete] = useState(null);
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);

  const rows = useMemo(() => data || [], [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => !activeOnly || r.is_active)
      .filter((r) => !q || [
        r.event_key, r.event_label, r.recipient_role, r.recipient_scope,
        r.template_key, r.channel,
      ].some((v) => (v || '').toLowerCase().includes(q)));
  }, [rows, search, activeOnly]);

  const grouped = useMemo(() => {
    const m = new Map();
    filtered.forEach((r) => {
      if (!m.has(r.event_key)) m.set(r.event_key, { label: r.event_label || null, rows: [] });
      m.get(r.event_key).rows.push(r);
    });
    return Array.from(m, ([eventKey, v]) => ({ eventKey, eventLabel: v.label, rows: v.rows }));
  }, [filtered]);

  const handleToggle = (row) => {
    toggleMut.mutate(
      { id: row.id, isActive: !row.is_active },
      {
        onSuccess: () => toast.success(`Subscription ${row.is_active ? 'disabled' : 'enabled'}`),
        onError: (err) => toast.error(err?.response?.data?.message || 'Failed to toggle subscription'),
      },
    );
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteMut.mutate(pendingDelete.id, {
      onSuccess: () => {
        toast.success('Subscription deleted');
        setPendingDelete(null);
      },
      onError: (err) => toast.error(err?.response?.data?.message || 'Failed to delete subscription'),
    });
  };

  if (isLoading) {
    return (
      <DashboardLayout breadcrumbs={BREADCRUMBS}>
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" />
        </div>
      </DashboardLayout>
    );
  }
  if (error) {
    return (
      <DashboardLayout breadcrumbs={BREADCRUMBS}>
        <div className="px-6 py-8 text-[12px] text-red-700">
          Failed to load subscriptions.{' '}
          <button type="button" onClick={() => refetch()} className="underline">Retry</button>
        </div>
      </DashboardLayout>
    );
  }

  const total = rows.length;
  const active = rows.filter((r) => r.is_active).length;
  const eventsCount = new Set(rows.map((r) => r.event_key)).size;

  return (
    <DashboardLayout breadcrumbs={BREADCRUMBS}>
      <div className="px-6 py-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-[#1A5632]/10 text-[#1A5632] flex items-center justify-center flex-shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-[15px] font-semibold text-gray-900">Notification rules</h1>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Choose who gets notified when a workflow event fires. Rules are grouped by event.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/admin/notifications/outbox"
              className="text-[11px] border border-gray-300 text-gray-700 px-3 py-1.5 hover:bg-gray-50">Outbox</Link>
            <Link to="/admin/notifications/test-send"
              className="inline-flex items-center gap-1.5 border border-gray-300 text-[11px] text-gray-700 px-3 py-1.5 hover:bg-gray-50">
              <FlaskConical className="w-3.5 h-3.5" /> Test send
            </Link>
            <Link to="/admin/notifications/subscriptions/new"
              className="inline-flex items-center gap-1.5 bg-[#1A5632] text-white text-[11px] px-3 py-1.5 hover:bg-[#14442A]">
              <Plus className="w-3.5 h-3.5" /> New rule
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <StatTile label="Events" value={eventsCount} tone="events" />
          <StatTile label="Rules" value={total} />
          <StatTile label="Active" value={active} tone="active" />
        </div>

        <div className="bg-white border border-gray-200 px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by event, recipient, template…"
                className="text-[11px] border border-gray-200 pl-7 pr-2 py-1.5 w-[320px] focus:outline-none focus:border-[#1A5632]"
              />
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
              <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
              Active only
            </label>
          </div>
          <span className="text-[10px] text-gray-500">
            Showing <strong className="text-gray-800">{grouped.length}</strong> event{grouped.length !== 1 ? 's' : ''} · <strong className="text-gray-800">{filtered.length}</strong> rule{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {rows.length === 0 ? (
          <EmptyState />
        ) : grouped.length === 0 ? (
          <div className="text-center py-10 text-[11px] text-gray-400 border border-dashed border-gray-200">
            No rules match the current filter.
          </div>
        ) : (
          <div className="space-y-2">
            {grouped.map((g) => (
              <EventCard
                key={g.eventKey}
                eventKey={g.eventKey}
                eventLabel={g.eventLabel}
                rows={g.rows}
                onToggle={handleToggle}
                onDelete={setPendingDelete}
                toggleBusy={toggleMut.isPending}
                deleteBusy={deleteMut.isPending}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete subscription"
        description={
          pendingDelete
            ? `Delete this rule for ${pendingDelete.event_key} (${SCOPE_LABELS[pendingDelete.recipient_scope] || pendingDelete.recipient_scope} → ${pendingDelete.channel})?`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </DashboardLayout>
  );
}
