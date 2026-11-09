/* eslint-disable max-lines, complexity -- Outbox admin view: list + detail modal with 3 tabs (preview / metadata / payload). Splitting into sub-files would fragment a single cohesive admin flow. */
// ── Admin → Notifications → Outbox ──
//
// Live view of `notification_outbox`: queued / sent / failed rows with
// filters. Admins check here whether an email actually left the server
// (and why it failed when it didn't).

import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, Clock, X, Eye } from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { notificationsApi } from '@/services/notifications.api';

const STATUS_BADGE = {
  queued: { bg: 'bg-amber-50', text: 'text-amber-700', icon: Clock, label: 'QUEUED' },
  draft:  { bg: 'bg-blue-50',  text: 'text-blue-700',  icon: Clock, label: 'IN-FLIGHT' },
  sent:   { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle2, label: 'SENT' },
  failed: { bg: 'bg-red-50',   text: 'text-red-700',   icon: AlertTriangle, label: 'FAILED' },
};

const fmt = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export default function OutboxPage() {
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [recipient, setRecipient] = useState('');
  const [eventKey, setEventKey] = useState('');
  const [detail, setDetail] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await notificationsApi.listOutbox({ status, recipient, event_key: eventKey, limit: 200 });
      const payload = r.data?.data || r.data || {};
      setRows(Array.isArray(payload.rows) ? payload.rows : []);
      setCounts(Array.isArray(payload.counts) ? payload.counts : []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load outbox');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    const m = { queued: 0, draft: 0, sent: 0, failed: 0 };
    counts.forEach((c) => { m[c.status] = Number(c.n || 0); });
    return m;
  }, [counts]);

  return (
    <DashboardLayout title="Notification outbox">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[#1A5632]">Notification outbox</h2>
            <p className="text-[11px] text-gray-500">Every email the platform has tried to send. Use to audit delivery and diagnose failures.</p>
          </div>
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {['sent', 'queued', 'failed', 'draft'].map((k) => {
            const cfg = STATUS_BADGE[k] || STATUS_BADGE.draft;
            return (
              <div key={k} className={`${cfg.bg} border border-gray-200 px-3 py-2 flex items-center justify-between`}>
                <span className={`${cfg.text} text-[10px] font-semibold uppercase tracking-wide`}>{cfg.label}</span>
                <span className={`${cfg.text} text-[16px] font-bold`}>{totals[k] || 0}</span>
              </div>
            );
          })}
        </div>

        <div className="bg-white border border-gray-200 px-3 py-2 flex items-center gap-2 flex-wrap">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="text-[11px] border border-gray-200 px-2 py-1.5">
            <option value="">All statuses</option>
            <option value="queued">Queued</option>
            <option value="draft">In-flight</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
          <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Recipient contains…" className="text-[11px] border border-gray-200 px-2 py-1.5 w-full sm:w-[200px]" />
          <input value={eventKey} onChange={(e) => setEventKey(e.target.value)} placeholder="Event key (e.g. indicator_report.submitted)" className="text-[11px] border border-gray-200 px-2 py-1.5 w-full sm:w-[280px]" />
          <button onClick={load} className="text-[11px] px-3 py-1.5 bg-[#1A5632] text-white hover:bg-[#0F3D24]">Apply</button>
        </div>

        <div className="bg-white border border-gray-200 overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center"><Loader2 className="w-4 h-4 animate-spin text-gray-400 mx-auto" /></div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-[11px] text-gray-400">No outbox rows match the current filter.</div>
          ) : (
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase text-gray-500">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Event</th>
                  <th className="px-3 py-2">Recipient</th>
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Attempts</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Sent</th>
                  <th className="px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => {
                  const cfg = STATUS_BADGE[r.status] || STATUS_BADGE.draft;
                  const Icon = cfg.icon;
                  const siblings = r.correlation_id ? rows.filter((x) => x.correlation_id === r.correlation_id).length : 1;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setDetail(r)}>
                      <td className="px-3 py-2 font-mono text-[10px] text-gray-400">{r.id}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-gray-700">{r.event_key}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {r.recipient}
                        {siblings > 1 && (
                          <span className="ml-1.5 text-[9px] text-gray-400" title={`${siblings} rows share the same correlation_id (same batch)`}>+ {siblings - 1} others</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600 max-w-[260px] truncate" title={r.subject || ''}>{r.subject || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 ${cfg.bg} ${cfg.text} text-[9px] font-semibold px-1.5 py-0.5`}>
                          <Icon className="w-3 h-3" /> {cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{r.attempts || 0}</td>
                      <td className="px-3 py-2 text-gray-500">{fmt(r.created_at)}</td>
                      <td className="px-3 py-2 text-gray-500">{fmt(r.sent_at)}</td>
                      <td className="px-3 py-2 text-[10px] text-red-600 max-w-[300px] truncate" title={r.last_error || ''}>
                        {r.last_error ? r.last_error.slice(0, 80) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {detail && <OutboxDetailModal row={detail} allRows={rows} onClose={() => setDetail(null)} />}
    </DashboardLayout>
  );
}

function OutboxDetailModal({ row, allRows, onClose }) {
  const payload = parseJson(row.payload);
  const headers = parseJson(row.headers);
  const batch = row.correlation_id
    ? allRows.filter((r) => r.correlation_id === row.correlation_id)
    : [row];
  const cfg = STATUS_BADGE[row.status] || STATUS_BADGE.draft;
  const [tab, setTab] = useState('preview');
  const [preview, setPreview] = useState({ loading: true, html: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setPreview({ loading: true, html: null, error: null });
    notificationsApi.previewOutbox(row.id)
      .then((r) => {
        if (cancelled) return;
        const data = r.data?.data || r.data || {};
        setPreview({ loading: false, html: data.html || null, error: data.error || null });
      })
      .catch((err) => {
        if (cancelled) return;
        setPreview({ loading: false, html: null, error: err.response?.data?.message || 'Preview unavailable' });
      });
    return () => { cancelled = true; };
  }, [row.id]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white border border-gray-200 w-full max-w-[720px] max-h-[90vh] overflow-auto">
        <div className="px-5 py-3 border-b border-gray-200 bg-[#1A5632] text-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            <h3 className="text-[13px] font-semibold">Outbox row #{row.id}</h3>
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="border-b border-gray-200 bg-gray-50 flex overflow-x-auto">
          {[{ k: 'preview', label: 'Email preview' }, { k: 'meta', label: 'Metadata' }, { k: 'payload', label: 'Payload / headers' }].map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`text-[10px] px-4 py-2 font-semibold uppercase tracking-wide whitespace-nowrap ${tab === t.k ? 'bg-white text-[#1A5632] border-b-2 border-[#1A5632]' : 'text-gray-500 hover:text-gray-800'}`}
            >{t.label}</button>
          ))}
        </div>
        {tab === 'preview' && (
          <div className="px-5 py-4">
            {preview.loading ? (
              <div className="p-10 text-center"><Loader2 className="w-4 h-4 animate-spin text-gray-400 mx-auto" /></div>
            ) : preview.html ? (
              <div>
                <p className="text-[10px] text-gray-400 mb-2">Rendered from the stored payload against the registered template. This is what the recipient saw in their inbox.</p>
                <iframe title={`Preview #${row.id}`} srcDoc={preview.html} sandbox="" className="w-full h-[440px] border border-gray-200 bg-white" />
              </div>
            ) : (
              <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2">
                No preview available. {preview.error ? <span className="text-gray-600">({preview.error})</span> : null}
              </div>
            )}
          </div>
        )}
        {tab === 'meta' && (
        <div className="px-5 py-4 space-y-4">
          <KV label="Event" value={<code className="text-[11px]">{row.event_key}</code>} />
          <KV label="Recipient" value={row.recipient} />
          <KV label="Subject" value={row.subject || '—'} />
          <KV label="Attempts" value={row.attempts || 0} />
          <KV label="Created" value={fmt(row.created_at)} />
          <KV label="Sent" value={fmt(row.sent_at)} />
          {row.last_error && (
            <div>
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Last error</div>
              <pre className="text-[10px] bg-red-50 text-red-800 border border-red-200 p-2 whitespace-pre-wrap break-words">{row.last_error}</pre>
            </div>
          )}
          {batch.length > 1 && (
            <div>
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Same batch ({batch.length} recipients) — correlation_id {row.correlation_id}
              </div>
              <ul className="text-[10px] border border-gray-200 divide-y divide-gray-100">
                {batch.map((b) => {
                  const bcfg = STATUS_BADGE[b.status] || STATUS_BADGE.draft;
                  return (
                    <li key={b.id} className="flex items-center gap-2 px-2 py-1">
                      <span className="text-gray-400 font-mono w-12">#{b.id}</span>
                      <span className="flex-1 text-gray-700">{b.recipient}</span>
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 ${bcfg.bg} ${bcfg.text}`}>{bcfg.label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
        )}
        {tab === 'payload' && (
          <div className="px-5 py-4 space-y-3">
            <div>
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Payload (template variables)</div>
              <pre className="text-[10px] bg-gray-50 border border-gray-200 p-2 overflow-x-auto whitespace-pre-wrap break-words">
                {payload ? JSON.stringify(payload, null, 2) : row.payload || '—'}
              </pre>
            </div>
            {headers ? (
              <div>
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Headers (cc / bcc / etc.)</div>
                <pre className="text-[10px] bg-gray-50 border border-gray-200 p-2 overflow-x-auto whitespace-pre-wrap break-words">
                  {JSON.stringify(headers, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="text-[10px] text-gray-400 italic">No extra headers (no cc/bcc).</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function KV({ label, value }) {
  return (
    <div className="flex gap-3">
      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-24 flex-shrink-0">{label}</div>
      <div className="text-[11px] text-gray-800 break-all">{value}</div>
    </div>
  );
}

function parseJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}
