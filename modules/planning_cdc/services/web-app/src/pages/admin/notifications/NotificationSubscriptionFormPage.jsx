/**
 * NotificationSubscriptionFormPage — dedicated create/edit page.
 *
 * Routes:
 *   /admin/notifications/subscriptions/new        → create mode
 *   /admin/notifications/subscriptions/:id/edit   → edit mode (loads existing)
 *
 * Per CLAUDE.md, forms with >3 fields are NEVER modals — this is a full page.
 *
 * Spec: docs/specs/notification-wizard.md §6.3
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Bell, Save, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useNotificationEvents,
  useNotificationTemplates,
  useNotificationResolvers,
  useNotificationSubscription,
  useCreateSubscription,
  useUpdateSubscription,
} from './hooks/useNotificationsAdminQueries';
import SubscriptionFormFields, { TemplatePreview } from './_SubscriptionFormFields';

const EMPTY = {
  event_key: '',
  recipient_role: '',
  recipient_scope: '',
  channel: 'email',
  template_key: '',
  priority: 100,
  is_active: true,
  throttle_window_sec: '',
};

function toPayload(form) {
  return {
    event_key: form.event_key,
    recipient_role: form.recipient_role || null,
    recipient_scope: form.recipient_scope,
    channel: form.channel,
    template_key: form.template_key,
    priority: Number(form.priority) || 100,
    is_active: Boolean(form.is_active),
    throttle_window_sec: form.throttle_window_sec === ''
      ? 0
      : Number(form.throttle_window_sec),
  };
}

function rowToForm(r) {
  return {
    event_key: r.event_key || '',
    recipient_role: r.recipient_role || '',
    recipient_scope: r.recipient_scope || '',
    channel: r.channel || 'email',
    template_key: r.template_key || '',
    priority: r.priority ?? 100,
    is_active: Boolean(r.is_active),
    throttle_window_sec: r.throttle_window_sec ?? '',
  };
}

function buildSubmitHandler({ form, isEdit, mutation, navigate }) {
  return (e) => {
    e.preventDefault();
    if (!form.event_key || !form.recipient_scope || !form.template_key) {
      toast.error('event_key, recipient_scope and template_key are required');
      return;
    }
    mutation.mutate(toPayload(form), {
      onSuccess: () => {
        toast.success(`Subscription ${isEdit ? 'updated' : 'created'}`);
        navigate('/admin/notifications');
      },
      onError: (err) => toast.error(err?.response?.data?.message || 'Save failed'),
    });
  };
}

function NotificationSubscriptionFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const eventsQ    = useNotificationEvents();
  const templatesQ = useNotificationTemplates();
  const resolversQ = useNotificationResolvers();
  const existingQ  = useNotificationSubscription(id);
  const createMut  = useCreateSubscription();
  const updateMut  = useUpdateSubscription(id);

  const [form, setForm] = useState({ ...EMPTY });

  useEffect(() => {
    if (isEdit && existingQ.data) setForm(rowToForm(existingQ.data));
  }, [isEdit, existingQ.data]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const mutation = isEdit ? updateMut : createMut;
  const handleSubmit = buildSubmitHandler({ form, isEdit, mutation, navigate });
  const labels = buildLabels({ isEdit, id });
  const breadcrumbs = [
    { label: 'Admin' },
    { label: 'Notifications', to: '/admin/notifications' },
    { label: labels.crumb },
  ];

  if (isEdit && existingQ.isLoading) {
    return (
      <DashboardLayout breadcrumbs={breadcrumbs}>
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" />
        </div>
      </DashboardLayout>
    );
  }

  const submitting = createMut.isPending || updateMut.isPending;

  return (
    <DashboardLayout breadcrumbs={breadcrumbs}>
      <FormHeader labels={labels} />
      <form onSubmit={handleSubmit} className="px-6 py-5 grid gap-4 lg:grid-cols-[minmax(360px,460px)_minmax(0,1fr)]">
        <div className="space-y-4 min-w-0">
          <SubscriptionFormFields
            form={form}
            isEdit={isEdit}
            events={eventsQ.data || []}
            templates={templatesQ.data || []}
            resolvers={resolversQ.data || []}
            setField={setField}
          />
          <FormFooter submitting={submitting} submitLabel={labels.submit} />
        </div>
        <aside className="lg:sticky lg:top-4 self-start">
          <div className="bg-white border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="text-[12px] font-semibold text-gray-800">Email preview</h3>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Rendered with a synthetic sample payload — change "Template" on the left to refresh.
              </p>
            </div>
            <div className="p-3">
              <TemplatePreview templateKey={form.template_key} />
            </div>
          </div>
        </aside>
      </form>
    </DashboardLayout>
  );
}

function buildLabels({ isEdit, id }) {
  if (isEdit) {
    return {
      pill: 'Edit Subscription',
      title: `Subscription #${id}`,
      crumb: `Edit #${id}`,
      submit: 'Save changes',
    };
  }
  return {
    pill: 'New Subscription',
    title: 'Create notification subscription',
    crumb: 'New subscription',
    submit: 'Create subscription',
  };
}

function FormHeader({ labels }) {
  return (
    <div className="bg-[#1A5632] text-white px-6 py-5">
      <div className="flex items-center gap-3 mb-2">
        <Bell className="w-5 h-5" />
        <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">
          {labels.pill}
        </span>
      </div>
      <h1 className="text-[16px] font-semibold">{labels.title}</h1>
      <p className="text-[11px] text-white/60 mt-1">
        Bind an event to a recipient resolver and template.
      </p>
    </div>
  );
}

function FormFooter({ submitting, submitLabel }) {
  return (
    <div className="flex items-center justify-between border-t border-gray-200 pt-4">
      <Link
        to="/admin/notifications"
        className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 hover:text-gray-800"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to list
      </Link>
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center gap-1.5 bg-[#1A5632] text-white text-[11px] px-3 py-1.5 hover:bg-[#14442A] disabled:opacity-60"
      >
        {submitting
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Save className="w-3.5 h-3.5" />
        }
        {submitLabel}
      </button>
    </div>
  );
}

export default NotificationSubscriptionFormPage;
