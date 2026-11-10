const { escape } = require('@rbm/lib/html');

const VALUE_MAX = 500;
const MONO = 'font-family:Consolas,Menlo,monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;';

/**
 * Live alert for one server error (D-20261009-04), sent to TECH_ALERTS
 * holders by services/api-server/src/services/errorAlertService.js: who, page,
 * what they entered, exact error. Single column so it reads on a phone.
 *
 * @param {object} data — outbox payload
 * @param {object} [data.error]  — { at, method, path, status, duration_ms, message, body, query, repeated, window_min }
 * @param {object} [data.actor]  — { id, name, email }
 * @param {object} [data.client] — { ip, user_agent }
 * @returns {string} HTML body
 * @example render({ error: { method: 'POST', path: '/api/x', status: 500, message: 'boom' }, actor: { name: 'Kofi' } });
 */
function render(data) {
  const { e, actor, client } = parts(data);

  return `<!doctype html>
<html><body style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#111827;background:#f9fafb;padding:16px;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;">
    <div style="background:#991B1B;color:#fff;padding:16px 20px;">
      ${header(e)}
    </div>
    <div style="padding:16px 20px;">
      ${section('Who', whoLines(actor, e, client))}
      ${section('Error', `<div style="${MONO}background:#FEF2F2;border-left:3px solid #991B1B;padding:8px 10px;">${escape(e.message)}</div>`)}
      ${section('What they entered', inputBlock(e.body))}
      ${e.query ? section('Query', fieldRows(e.query)) : ''}
      ${repeatLine(e)}
      <p style="font-size:11px;color:#6b7280;margin-top:20px;">You receive this because you hold the Technical alerts role (Admin → Users). The same error for the same person is emailed once every ${escape(String(e.window_min))} minutes. Full row in audit_events (action API_ERROR_5XX).</p>
    </div>
  </div>
</body></html>`;
}

/** Payload pieces with defaults, so a partial payload still renders. */
function parts(data) {
  const d = data || {};
  return { e: { window_min: 30, message: '', ...(d.error || {}) }, actor: d.actor || null, client: d.client || {} };
}

/** Red banner: status, then method and path. */
function header(e) {
  const route = [e.method, e.path].filter(Boolean).join(' ');
  return `<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;opacity:.85;">Africa CDC RBM · Server error ${escape(String(e.status || ''))}</div>
      <div style="font-size:16px;font-weight:600;margin-top:4px;word-break:break-all;">${escape(route)}</div>`;
}

/** Titled block. */
function section(title, inner) {
  return `<div style="margin-top:14px;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;margin-bottom:4px;">${title}</div>${inner}</div>`;
}

/** User, time, duration and client lines. */
function whoLines(actor, e, client) {
  const who = actor ? `<strong>${escape(actor.name || '')}</strong> · ${escape(actor.email || '')}` : '<strong>Not signed in</strong>';
  const when = [shortTime(e.at), e.duration_ms != null ? `${e.duration_ms} ms` : null, client.ip].filter(Boolean).map((v) => escape(String(v))).join(' · ');
  const agent = client.user_agent ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;word-break:break-all;">${escape(client.user_agent)}</div>` : '';
  return `<div>${who}</div><div style="font-size:12px;color:#374151;margin-top:2px;">${when} UTC</div>${agent}`;
}

/** The request body as stacked label / value rows. */
function inputBlock(body) {
  if (!body || typeof body !== 'object' || !Object.keys(body).length) return '<div style="color:#6b7280;">Nothing (no request body).</div>';
  if (body._truncated) {
    return `<div style="color:#6b7280;">Too large to show (file upload or long text). Fields: ${escape((body.keys || []).join(', '))}</div>`;
  }
  return fieldRows(body);
}

/** One row per field: grey label, monospace value. */
function fieldRows(obj) {
  return Object.entries(obj).map(([key, value]) => `
      <div style="border-bottom:1px solid #f3f4f6;padding:4px 0;">
        <div style="font-size:11px;color:#6b7280;">${escape(key)}</div>
        <div style="${MONO}">${escape(displayValue(value))}</div>
      </div>`).join('');
}

/** Readable value: empty string shown as "(empty)", objects as JSON, long values cut. */
function displayValue(value) {
  if (value === '') return '(empty)';
  if (value === null || value === undefined) return '(none)';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.length > VALUE_MAX ? `${text.slice(0, VALUE_MAX)}…` : text;
}

/** "Happened N more times since the last alert" when repeats were swallowed. */
function repeatLine(e) {
  if (!e.repeated) return '';
  return `<p style="margin-top:14px;font-size:12px;color:#92400E;background:#FFFBEB;border:1px solid #FDE68A;padding:8px 10px;">Same error for this person happened ${escape(String(e.repeated))} more time${e.repeated === 1 ? '' : 's'} since the previous alert (not emailed individually).</p>`;
}

/** "2026-10-09 16:05:12" from an ISO date; empty when missing. */
function shortTime(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 19).replace('T', ' ');
}

render.subject = '[RBM] Server error';
module.exports = render;
