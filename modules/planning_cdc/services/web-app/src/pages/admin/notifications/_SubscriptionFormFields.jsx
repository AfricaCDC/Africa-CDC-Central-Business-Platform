/* eslint-disable no-restricted-syntax -- ENTITY_WITH_* lists declare notification_events.entity_type values (40+, wider space than @rbm/lib/enums.ENTITY_TYPES) for UI scope applicability; adding them all to the shared enum would pollute every consumer for a UI-only concern. */
/**
 * _SubscriptionFormFields — Frappe-Notification-style sectioned editor.
 * Sections: When · Filter · Who · How · Activate. Each section is a
 * labelled card with a short description, and recipient scopes are
 * radio cards (not raw dropdown of machine codes).
 */

import { useEffect, useState } from 'react';
import { AlertCircle, Bell, Users, Target, MessageSquare, Power, Loader2 } from 'lucide-react';
import httpClient from '@/services/api';

const CHANNELS = [
  { value: 'email',  label: 'Email',  desc: 'Transactional email via Azure Comm / Exchange relay.' },
  { value: 'in_app', label: 'In-app', desc: 'Bell icon dropdown in the web app.' },
  { value: 'both',   label: 'Both',   desc: 'Email AND in-app simultaneously.' },
];

// Human-readable resolver catalog. Falls back to the raw code for any
// unknown scope so a newly-added resolver still surfaces even without
// an entry here.
// Each scope declares which entity_types it applies to. `'*'` = any.
// When the selected event's entity_type is not in the list, the scope
// card is disabled (grey, not selectable) with a tooltip explaining why.
const ENTITY_WITH_DIVISION = [
  'ACTIVITY_REPORT', 'DIVISION_REPORT', 'INDICATOR_REPORT', 'INDICATOR_ACTUAL',
  'PLAN_NODE', 'WORKPLAN_ITEM', 'AMERT_ACTIVITY', 'AMERT_PROJECT', 'PROJECT',
  'WORKPLAN', 'EVIDENCE', 'RESULT', 'MILESTONE', 'DIVISION',
];
const ENTITY_WITH_CONTRIB = [
  'ACTIVITY_REPORT', 'DIVISION_REPORT', 'INDICATOR_REPORT', 'INDICATOR_ACTUAL',
  'PLAN_NODE', 'WORKPLAN_ITEM', 'AMERT_ACTIVITY', 'AMERT_OUTCOME_INDICATOR',
  'AMERT_OUTPUT_INDICATOR',
];
const ENTITY_WITH_SUBMITTER = ENTITY_WITH_DIVISION.concat([
  'ACHIEVEMENT', 'APPROVAL_INSTANCE', 'APPROVAL_STEP', 'COMMENT', 'DQA',
  'EVALUATION', 'LESSON', 'MOV', 'NOTIFICATION_SUBSCRIPTION', 'REPORTING_PERIOD',
]);
const ENTITY_WITH_OWNER = ENTITY_WITH_DIVISION;

const SCOPE_CATALOG = [
  { code: 'entity_main_hod',     title: 'HOD of the main division',            desc: 'The head of the division that owns (responsible_division_code) the entity.', entities: ENTITY_WITH_DIVISION },
  { code: 'entity_contrib_hods', title: 'HODs of every contributing division', desc: 'Each HOD listed on contributing_divisions plus Specific Activity owners.',    entities: ENTITY_WITH_CONTRIB },
  { code: 'focal_of_main',       title: 'Focal person of the main division',   desc: 'The focal (not HOD) of the owner division.',                                  entities: ENTITY_WITH_DIVISION },
  { code: 'submitter',           title: 'The user who submitted',              desc: 'Whoever created/submitted the entity (self-acknowledgment).',                  entities: ENTITY_WITH_SUBMITTER },
  { code: 'owner',               title: 'Entity owner',                        desc: 'The user flagged as owner on the entity row.',                                 entities: ENTITY_WITH_OWNER },
  { code: 'entity_owner',          title: 'Owner of the entity',          desc: 'The user the entity now belongs to (e.g. the new preparer of a report).',      entities: ENTITY_WITH_OWNER },
  { code: 'entity_previous_owner', title: 'Previous owner of the entity', desc: 'The user the entity was taken from (e.g. the previous preparer of a report).', entities: ENTITY_WITH_OWNER },
  { code: 'role_all',            title: 'Every user with the selected role',   desc: 'Requires Recipient Role below. Sends to every matching user (active + inactive).', entities: '*' },
  { code: 'role_all_active',     title: 'Every ACTIVE user with the role',     desc: 'Requires Recipient Role below. Sends only to users with status=ACTIVE.',          entities: '*' },
];

function isScopeApplicable(scope, entityType) {
  if (!scope) return true;
  if (scope.entities === '*') return true;
  if (!entityType) return true;
  return scope.entities.includes(entityType);
}

const INPUT_CLASS = 'w-full border border-gray-300 px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-[#1A5632]';

function Section({ icon: Icon, title, desc, required, children }) {
  return (
    <section className="bg-white border border-gray-200">
      <div className="flex items-start gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50">
        <Icon className="w-4 h-4 text-[#1A5632] mt-0.5" />
        <div className="flex-1">
          <h3 className="text-[12px] font-semibold text-gray-800">
            {title}{required ? <span className="text-red-600 ml-0.5">*</span> : null}
          </h3>
          {desc && <p className="text-[10px] text-gray-500 mt-0.5">{desc}</p>}
        </div>
      </div>
      <div className="px-4 py-3 space-y-3">{children}</div>
    </section>
  );
}

function FieldLabel({ children, required }) {
  return (
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1">
      {children}{required ? <span className="text-red-600 ml-0.5">*</span> : null}
    </label>
  );
}

export function TemplatePreview({ templateKey }) {
  const [state, setState] = useState({ loading: false, html: null, error: null });
  useEffect(() => {
    if (!templateKey) { setState({ loading: false, html: null, error: null }); return undefined; }
    let cancelled = false;
    setState({ loading: true, html: null, error: null });
    httpClient.get(`/admin/notifications/templates/${encodeURIComponent(templateKey)}/preview`)
      .then((r) => {
        if (cancelled) return;
        const data = r.data?.data || r.data || {};
        setState({ loading: false, html: data.html || null, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ loading: false, html: null, error: err.response?.data?.message || 'Preview unavailable' });
      });
    return () => { cancelled = true; };
  }, [templateKey]);
  if (!templateKey) {
    return <div className="text-[10px] text-gray-400 italic">Pick a template above to see what the email will look like.</div>;
  }
  if (state.loading) return <div className="p-6 text-center"><Loader2 className="w-4 h-4 animate-spin text-gray-400 mx-auto" /></div>;
  if (state.error) {
    return <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2">Preview failed: {state.error}</div>;
  }
  if (!state.html) {
    return <div className="text-[10px] text-gray-400 italic">No preview available for this template.</div>;
  }
  return (
    <iframe
      title={`Preview ${templateKey}`}
      srcDoc={state.html}
      sandbox=""
      className="w-full h-[720px] border border-gray-200 bg-white"
    />
  );
}

function ScopeCards({ value, onChange, entityType }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {SCOPE_CATALOG.map((s) => {
        const active = value === s.code;
        const applicable = isScopeApplicable(s, entityType);
        const disabled = !applicable;
        const tip = disabled
          ? `Not applicable to "${entityType}" — this entity doesn't carry the field this scope reads.`
          : null;
        return (
          <button
            type="button"
            key={s.code}
            onClick={() => !disabled && onChange(s.code)}
            disabled={disabled}
            title={tip || undefined}
            aria-disabled={disabled}
            className={`text-left px-3 py-2 border transition-colors ${
              disabled
                ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                : active
                  ? 'border-[#1A5632] bg-[#1A5632]/5'
                  : 'border-gray-200 hover:border-gray-400'
            }`}
          >
            <div className="flex items-start gap-2">
              <div className={`w-3 h-3 mt-0.5 flex-shrink-0 rounded-full border ${active ? 'bg-[#1A5632] border-[#1A5632]' : 'border-gray-300'}`}>
                {active && <div className="w-1 h-1 bg-white rounded-full m-auto mt-[3px]" />}
              </div>
              <div className="flex-1">
                <div className={`text-[11px] font-semibold ${disabled ? 'text-gray-500' : 'text-gray-800'}`}>{s.title}</div>
                <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">{s.desc}</div>
                <div className="text-[9px] font-mono text-gray-400 mt-1">
                  {s.code}
                  {disabled && <span className="ml-2 text-amber-700">· not applicable</span>}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// eslint-disable-next-line complexity -- 5-section form composition with conditional scope/role/template blocks; keeping flat reads better than splitting into 5 HOCs.
export default function SubscriptionFormFields({
  form, isEdit, events, templates, resolvers, setField,
}) {
  const selectedEvent = events.find((e) => e.event_key === form.event_key);
  const needsRole = form.recipient_scope === 'role_all' || form.recipient_scope === 'role_all_active';

  return (
    <div className="space-y-4">
      {/* ───── WHEN ──────────────────────────────────────────── */}
      <Section icon={Bell} title="When this fires" desc="Pick the workflow event that triggers this rule." required>
        <FieldLabel required>Event</FieldLabel>
        <select
          value={form.event_key}
          onChange={(e) => setField('event_key', e.target.value)}
          className={INPUT_CLASS}
          disabled={isEdit}
        >
          <option value="">— select an event —</option>
          {events.map((ev) => (
            <option key={ev.event_key} value={ev.event_key}>
              {ev.label ? `${ev.label}` : ev.event_key}
            </option>
          ))}
        </select>
        <div className="text-[10px] text-gray-500 mt-1">
          {isEdit ? 'Event is fixed after creation — create a new rule to bind another event.' : null}
        </div>
        {selectedEvent && (
          <div className="text-[10px] text-gray-600 border-l-2 border-[#1A5632]/30 bg-gray-50 px-3 py-2">
            <div><span className="font-semibold">Event key:</span> <code className="font-mono text-[10px]">{selectedEvent.event_key}</code></div>
            {selectedEvent.entity_type && <div><span className="font-semibold">Entity:</span> {selectedEvent.entity_type}</div>}
            {selectedEvent.action && <div><span className="font-semibold">Action:</span> {selectedEvent.action}</div>}
          </div>
        )}
      </Section>

      {/* ───── FILTER (conditions — placeholder for v2) ──────── */}
      <Section icon={Target} title="Filter (optional)" desc="Additional match conditions on the entity payload. Leave empty to fire on every event.">
        <div className="bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-amber-700 mt-0.5 flex-shrink-0" />
          <div className="text-[10px] text-amber-900">
            Condition builder coming in the next iteration. Right now every event-matched rule fires unconditionally.
            Use distinct subscriptions per scope if you need to vary recipients by event content.
          </div>
        </div>
      </Section>

      {/* ───── WHO ───────────────────────────────────────────── */}
      <Section icon={Users} title="Who is notified" desc="Pick how the recipient list is computed when this rule fires." required>
        <ScopeCards
          value={form.recipient_scope}
          onChange={(v) => setField('recipient_scope', v)}
          entityType={selectedEvent?.entity_type}
        />
        {selectedEvent?.entity_type && (
          <div className="text-[10px] text-gray-500 italic">
            Greyed scopes below don't apply to <code className="font-mono">{selectedEvent.entity_type}</code>
            — the entity doesn't carry the field they'd resolve against.
          </div>
        )}
        {/* Fallback for resolver codes not in SCOPE_CATALOG (new resolvers added by devs) */}
        {form.recipient_scope && !SCOPE_CATALOG.find((s) => s.code === form.recipient_scope) && (
          <div className="text-[10px] text-gray-500 border-l-2 border-gray-300 pl-3 py-1">
            Using custom resolver <code className="font-mono">{form.recipient_scope}</code>.
            {resolvers?.length
              ? <> Available: {resolvers.map((r) => r.code).join(', ')}</>
              : null}
          </div>
        )}
        {needsRole && (
          <div>
            <FieldLabel required>Role name</FieldLabel>
            <input
              type="text"
              value={form.recipient_role}
              onChange={(e) => setField('recipient_role', e.target.value)}
              placeholder="e.g. SYSTEM_ADMIN, ME_OFFICER, HEAD_OF_DIVISION"
              className={INPUT_CLASS}
            />
            <p className="text-[10px] text-gray-500 mt-1">Required because you picked a role-based scope above.</p>
          </div>
        )}
      </Section>

      {/* ───── HOW ───────────────────────────────────────────── */}
      <Section icon={MessageSquare} title="How they are notified" desc="Channel and template used to render the message.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <FieldLabel required>Channel</FieldLabel>
            <select
              value={form.channel}
              onChange={(e) => setField('channel', e.target.value)}
              className={INPUT_CLASS}
            >
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-500 mt-1">
              {CHANNELS.find((c) => c.value === form.channel)?.desc}
            </p>
          </div>
          <div>
            <FieldLabel required>Template</FieldLabel>
            <select
              value={form.template_key}
              onChange={(e) => setField('template_key', e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">— select a template —</option>
              {templates.map((t) => (
                <option key={t.template_key} value={t.template_key}>{t.template_key}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-500 mt-1">Templates are registered in code — ask the backend team to add new ones.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <FieldLabel>Priority</FieldLabel>
            <input
              type="number"
              value={form.priority}
              onChange={(e) => setField('priority', e.target.value)}
              className={INPUT_CLASS}
            />
            <p className="text-[10px] text-gray-500 mt-1">Higher number = sends first when multiple rules match (default 100).</p>
          </div>
          <div>
            <FieldLabel>Throttle window (sec)</FieldLabel>
            <input
              type="number"
              min="0"
              value={form.throttle_window_sec}
              onChange={(e) => setField('throttle_window_sec', e.target.value)}
              placeholder="0 = no throttle"
              className={INPUT_CLASS}
            />
            <p className="text-[10px] text-gray-500 mt-1">Skip a new dispatch to the same user within this window.</p>
          </div>
        </div>
      </Section>

      {/* ───── ACTIVATE ──────────────────────────────────────── */}
      <Section icon={Power} title="Activate" desc="Inactive rules stay configured but no longer dispatch.">
        <label className="inline-flex items-center gap-2 text-[11px] text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setField('is_active', e.target.checked)}
            className="border-gray-300"
          />
          Rule is active — new matching events will dispatch notifications.
        </label>
      </Section>
    </div>
  );
}
