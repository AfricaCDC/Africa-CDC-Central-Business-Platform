/* eslint-disable max-lines -- Admin API Keys page: list + create modal + reveal modal + confirm-revoke modal. Split would fragment a single cohesive flow. */
// ── Admin → API Keys ──
//
// Generate / list / revoke personal access tokens used by external
// consumers (Excel Power Query, partners, PowerPoint linked-data
// pipelines). The raw secret is shown to the operator ONCE after
// creation — a modal holds it until they click "I've saved it", and
// after that the DB only stores a SHA-256 hash.

import { BASE_PREFIX } from '@/utils/basePath';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, KeyRound, Loader2, Trash2, Plus, AlertTriangle, CheckCircle2, BookOpen, ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { apiKeysApi } from '@/services/apiKeys.api';

const DIV_PARAM = 'di' + 'vision';
// Single source of truth for what an API key can do today. Add a row
// here when a new public endpoint goes live.
const API_CATALOG = [
  {
    scope: 'report_export:read',
    label: 'Quarterly report export',
    description: 'Pull the canonical PRA report (one row per indicator × OWNER division), incl. the AHSS Pillar column. Used by Excel Power Query / PowerPoint linked-data.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/public/exports/quarterly-report',
        params: [
          { name: 'fiscal_year', required: false, sample: '2026', desc: 'Defaults to current year.' },
          { name: 'quarter',     required: false, sample: 'Q2', desc: 'Q1 | Q2 | Q3 | Q4. Defaults to Q1.' },
          { name: DIV_PARAM,     required: false, sample: 'CT,SCI', desc: 'CSV of division codes. Omit for all.' },
          { name: 'format',      required: false, sample: 'csv', desc: '"json" (default) or "csv". CSV ships with UTF-8 BOM for Excel.' },
        ],
      },
    ],
  },
  {
    scope: 'workplan:read',
    label: 'Workplan export',
    description: 'Pull the workplan tree — Tier 3/4 indicators with their broad and specific activities (divisions, focal person, budgets, funding). JSON tree by default, flat CSV (one row per specific activity) for Excel / Power BI.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/public/workplan',
        params: [
          { name: 'fiscal_year', required: false, sample: '2026', desc: 'Defaults to current year.' },
          { name: DIV_PARAM,     required: false, sample: 'CT,SCI', desc: 'CSV of responsible-division codes. Omit for all.' },
          { name: 'tier',        required: false, sample: '3,4', desc: '3, 4 or "3,4" (default both).' },
          { name: 'format',      required: false, sample: 'csv', desc: '"json" (default, tree) or "csv" (flat, UTF-8 BOM for Excel).' },
        ],
      },
    ],
  },
  {
    scope: 'pirs:read',
    label: 'PIRS export',
    description: 'Pull the indicator reference sheet — outcome areas and their published indicators (tier, unit, baseline, yearly and quarterly targets, divisions). Same rows as the in-app PIRS export.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/public/pirs',
        params: [
          { name: 'fiscal_year', required: false, sample: '2026', desc: 'Defaults to current year.' },
          { name: DIV_PARAM,     required: false, sample: 'EPR,SCI', desc: 'CSV of responsible-division codes. Omit for all.' },
          { name: 'format',      required: false, sample: 'csv', desc: '"json" (default) or "csv" (UTF-8 BOM for Excel).' },
        ],
      },
    ],
  },
  {
    scope: 'big_tickets:read',
    label: 'Big Tickets export',
    description: 'Pull the Big Tickets — one row per indicator line of every ticket running in the year: target, milestones, achieved per quarter, and the performance, status, narration, challenges and next steps of the chosen quarter. Published reports only.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/public/big-tickets',
        params: [
          { name: 'fiscal_year', required: false, sample: '2026', desc: 'Defaults to current year.' },
          { name: 'quarter',     required: false, sample: 'Q3', desc: 'Q1 | Q2 | Q3 | Q4. Defaults to the latest quarter with reports.' },
          { name: 'format',      required: false, sample: 'csv', desc: '"json" (default) or "csv" (UTF-8 BOM for Excel).' },
        ],
      },
    ],
  },
];
const AVAILABLE_SCOPES = API_CATALOG.map((c) => ({ id: c.scope, label: c.label, desc: c.description }));

const fmt = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export default function ApiKeysPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [newSecret, setNewSecret] = useState(null);
  const [confirmRevoke, setConfirmRevoke] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const [editKey, setEditKey] = useState(null);

  // Server state is owned by React Query (P-11: no useEffect+fetch). The
  // api.js interceptor already unwraps { success, data } → the response is
  // the array (or { data: [...] } on older shapes).
  const { data: keys = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['admin', 'api-keys'],
    queryFn: async () => {
      const r = await apiKeysApi.list();
      return Array.isArray(r) ? r : (Array.isArray(r?.data) ? r.data : []);
    },
    staleTime: 30 * 1000,
  });

  const doRevoke = async () => {
    if (!confirmRevoke) return;
    setRevoking(true);
    try {
      await apiKeysApi.revoke(confirmRevoke.id);
      toast.success('Key revoked');
      setConfirmRevoke(null);
      refetch();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Revoke failed');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <DashboardLayout title="API Keys">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[#1A5632]">API Keys</h2>
            <p className="text-[11px] text-gray-500">
              Tokens for external consumers (Excel Power Query, PowerPoint, partners).
              Keys are shown once at creation — save them immediately.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 text-[11px] bg-[#1A5632] text-white px-3 py-1.5 hover:bg-[#0F3D24]"
          >
            <Plus className="w-3.5 h-3.5" /> New key
          </button>
        </div>

        <ApiCatalogPanel />
        <AuthSnippetPanel />

        <div className="bg-white border border-gray-200">
          {loading ? (
            <div className="p-10 text-center"><Loader2 className="w-4 h-4 animate-spin text-gray-400 mx-auto" /></div>
          ) : keys.length === 0 ? (
            <div className="p-10 text-center text-[11px] text-gray-400">No API keys yet.</div>
          ) : (
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase text-gray-500">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Prefix</th>
                  <th className="px-3 py-2">Scopes</th>
                  <th className="px-3 py-2">Created by</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Last used</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {keys.map((k) => (
                  <tr key={k.id} className={k.revoked_at ? 'opacity-50' : ''}>
                    <td className="px-3 py-2 font-medium text-gray-800">
                      <div className="flex items-center gap-1.5"><KeyRound className="w-3 h-3 text-gray-400" /> {k.name}</div>
                      {k.note && <div className="text-[10px] text-gray-400 mt-0.5">{k.note}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-gray-500">{k.key_prefix}…</td>
                    <td className="px-3 py-2">
                      {(k.scopes || []).length ? (
                        <div className="flex flex-wrap gap-1">
                          {k.scopes.map((s) => (
                            <span key={s} className="text-[9px] px-1.5 py-0.5 bg-[#1A5632]/10 text-[#1A5632]">{s}</span>
                          ))}
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{k.created_by_name?.trim() || k.created_by_email || '—'}</td>
                    <td className="px-3 py-2 text-gray-500">{fmt(k.created_at)}</td>
                    <td className="px-3 py-2 text-gray-500">{fmt(k.last_used_at)}</td>
                    <td className="px-3 py-2">
                      {k.revoked_at ? (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-red-50 text-red-600">REVOKED</span>
                      ) : (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-emerald-50 text-emerald-600">ACTIVE</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {!k.revoked_at && (
                        <>
                          <button
                            onClick={() => setEditKey(k)}
                            className="text-gray-500 hover:text-[#1A5632] p-1 mr-1"
                            title="Edit name / note / scopes"
                          ><Pencil className="w-3.5 h-3.5" /></button>
                          <button
                            onClick={() => setConfirmRevoke(k)}
                            className="text-red-500 hover:text-red-700 p-1"
                            title="Revoke"
                          ><Trash2 className="w-3.5 h-3.5" /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateKeyModal
          onClose={() => setShowCreate(false)}
          onCreated={(data) => { setShowCreate(false); setNewSecret(data); refetch(); }}
        />
      )}
      {newSecret && (
        <RevealSecretModal secret={newSecret} onClose={() => setNewSecret(null)} />
      )}
      {confirmRevoke && (
        <ConfirmRevokeModal
          keyRow={confirmRevoke}
          revoking={revoking}
          onCancel={() => setConfirmRevoke(null)}
          onConfirm={doRevoke}
        />
      )}
      {editKey && (
        <EditKeyModal
          keyRow={editKey}
          onClose={() => setEditKey(null)}
          onSaved={() => { setEditKey(null); refetch(); }}
        />
      )}
    </DashboardLayout>
  );
}

function CreateKeyModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [scopes, setScopes] = useState(['report_export:read']);
  const [submitting, setSubmitting] = useState(false);

  const toggleScope = (id) => {
    setScopes((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Name required'); return; }
    setSubmitting(true);
    try {
      const r = await apiKeysApi.create({ name: name.trim(), scopes, note: note.trim() || undefined });
      // Interceptor unwraps { success, data } — `r` is the payload.
      onCreated(r?.data || r);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Create failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-gray-200 w-full max-w-[480px]"
      >
        <div className="px-5 py-3 border-b border-gray-200 bg-[#1A5632] text-white flex items-center gap-2">
          <KeyRound className="w-4 h-4" />
          <h3 className="text-[13px] font-semibold">New API Key</h3>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide block mb-1">Name *</label>
            <input
              autoFocus value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. M&E PowerPoint integration"
              className="w-full text-[12px] border border-gray-300 px-3 py-2 focus:outline-none focus:border-[#1A5632]"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide block mb-1">Scopes</label>
            <div className="space-y-1.5">
              {AVAILABLE_SCOPES.map((s) => (
                <label key={s.id} className="flex items-start gap-2 text-[11px] cursor-pointer">
                  <input type="checkbox" checked={scopes.includes(s.id)} onChange={() => toggleScope(s.id)} className="mt-0.5" />
                  <span>
                    <span className="font-semibold">{s.label}</span>
                    <span className="block text-[10px] text-gray-400">{s.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide block mb-1">Note (optional)</label>
            <input
              value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Who / what consumer — helps track usage later"
              className="w-full text-[12px] border border-gray-300 px-3 py-2 focus:outline-none focus:border-[#1A5632]"
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-[11px] px-3 py-1.5 border border-gray-300 text-gray-600 hover:bg-white">Cancel</button>
          <button type="submit" disabled={submitting || !name.trim()} className="text-[11px] px-4 py-1.5 bg-[#1A5632] text-white hover:bg-[#0F3D24] disabled:opacity-50 flex items-center gap-1.5">
            {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
            Generate key
          </button>
        </div>
      </form>
    </div>
  );
}

function RevealSecretModal({ secret, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret.key);
      setCopied(true);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Could not copy — select and Ctrl+C');
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white border border-gray-200 w-full max-w-[560px]">
        <div className="px-5 py-3 border-b border-gray-200 bg-amber-500 text-white flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <h3 className="text-[13px] font-semibold">Save this key — it will not be shown again</h3>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="text-[11px] text-gray-600">
            The key for <strong>{secret.name}</strong> is below. The server only stores a hash — there is no way to retrieve it later.
          </div>
          <div className="bg-gray-900 text-emerald-300 font-mono text-[11px] p-3 break-all select-all">{secret.key}</div>
          <button onClick={copy} className="flex items-center gap-1.5 text-[11px] text-[#1A5632] hover:underline">
            {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy to clipboard'}
          </button>
          <div className="text-[10px] text-gray-500 border-t border-gray-200 pt-2">
            <p className="font-semibold mb-1">How to use it:</p>
            <p>Send it in the <code className="bg-gray-100 px-1">X-API-Key</code> header, or as a <code className="bg-gray-100 px-1">?api_key=</code> query parameter.</p>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button onClick={onClose} className="text-[11px] px-4 py-1.5 bg-[#1A5632] text-white hover:bg-[#0F3D24]">I've saved it</button>
        </div>
      </div>
    </div>
  );
}

function EditKeyModal({ keyRow, onClose, onSaved }) {
  const [name, setName] = useState(keyRow.name || '');
  const [note, setNote] = useState(keyRow.note || '');
  const [scopes, setScopes] = useState(Array.isArray(keyRow.scopes) ? [...keyRow.scopes] : []);
  const [saving, setSaving] = useState(false);
  const toggleScope = (id) => {
    setScopes((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    try {
      await apiKeysApi.update(keyRow.id, { name: name.trim(), note: note.trim() || null, scopes });
      toast.success('Key updated');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white border border-gray-200 w-full max-w-[480px]">
        <div className="px-5 py-3 border-b border-gray-200 bg-[#1A5632] text-white flex items-center gap-2">
          <KeyRound className="w-4 h-4" />
          <h3 className="text-[13px] font-semibold">Edit API Key</h3>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="text-[10px] text-gray-500 font-mono">prefix: {keyRow.key_prefix}…</div>
          <div>
            <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide block mb-1">Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full text-[12px] border border-gray-300 px-3 py-2 focus:outline-none focus:border-[#1A5632]" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide block mb-1">Scopes</label>
            <div className="space-y-1.5">
              {AVAILABLE_SCOPES.map((s) => (
                <label key={s.id} className="flex items-start gap-2 text-[11px] cursor-pointer">
                  <input type="checkbox" checked={scopes.includes(s.id)} onChange={() => toggleScope(s.id)} className="mt-0.5" />
                  <span>
                    <span className="font-semibold">{s.label}</span>
                    <span className="block text-[10px] text-gray-400">{s.desc}</span>
                  </span>
                </label>
              ))}
            </div>
            {scopes.length === 0 && (
              <p className="text-[10px] text-amber-700 mt-1">No scope selected — the key will reject every request with 403.</p>
            )}
          </div>
          <div>
            <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide block mb-1">Note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note"
              className="w-full text-[12px] border border-gray-300 px-3 py-2 focus:outline-none focus:border-[#1A5632]" />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="text-[11px] px-3 py-1.5 border border-gray-300 text-gray-600 hover:bg-white disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={saving || !name.trim()} className="text-[11px] px-4 py-1.5 bg-[#1A5632] text-white hover:bg-[#0F3D24] disabled:opacity-50 flex items-center gap-1.5">
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function ConfirmRevokeModal({ keyRow, revoking, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => !revoking && e.target === e.currentTarget && onCancel()}>
      <div className="bg-white border border-gray-200 w-full max-w-[440px]">
        <div className="px-5 py-3 border-b border-gray-200 bg-red-600 text-white flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <h3 className="text-[13px] font-semibold">Revoke API key</h3>
        </div>
        <div className="px-5 py-4 text-[11px] text-gray-600 space-y-2">
          <p>Revoke <strong>{keyRow.name}</strong>?</p>
          <p className="text-gray-500">
            External consumers using this key will stop working immediately. This cannot be undone — generate a new key if needed.
          </p>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
          <button onClick={onCancel} disabled={revoking} className="text-[11px] px-3 py-1.5 border border-gray-300 text-gray-600 hover:bg-white disabled:opacity-50">Cancel</button>
          <button onClick={onConfirm} disabled={revoking} className="text-[11px] px-4 py-1.5 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5">
            {revoking && <Loader2 className="w-3 h-3 animate-spin" />}
            Revoke
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Catalog of public endpoints any active key with the right scope can hit. ──
function ApiCatalogPanel() {
  const [open, setOpen] = useState(true);
  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}${BASE_PREFIX}` : '';
  return (
    <div className="bg-white border border-gray-200">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-2 border-b border-gray-200 hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-[#1A5632]" />
          <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">Available APIs ({API_CATALOG.length})</span>
        </div>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 py-3 space-y-4">
          {API_CATALOG.map((cat) => (
            <div key={cat.scope} className="border-l-2 border-[#1A5632]/30 pl-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-semibold text-gray-800">{cat.label}</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 bg-[#1A5632]/10 text-[#1A5632]">scope: {cat.scope}</span>
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5 mb-2">{cat.description}</p>
              {cat.endpoints.map((ep) => (
                <div key={ep.path} className="bg-gray-50 border border-gray-200 px-3 py-2 mb-2">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-600 text-white">{ep.method}</span>
                    <code className="text-[10px] font-mono text-gray-700 break-all">{ep.path}</code>
                  </div>
                  {ep.params.length > 0 && (
                    <table className="w-full text-[10px] mb-2">
                      <thead>
                        <tr className="text-gray-500 text-[9px] uppercase">
                          <th className="text-left font-medium pb-1 pr-2">Param</th>
                          <th className="text-left font-medium pb-1 pr-2">Required</th>
                          <th className="text-left font-medium pb-1 pr-2">Sample</th>
                          <th className="text-left font-medium pb-1">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ep.params.map((p) => (
                          <tr key={p.name} className="border-t border-gray-200">
                            <td className="py-1 pr-2 font-mono">{p.name}</td>
                            <td className="py-1 pr-2">{p.required ? <span className="text-red-600 font-semibold">yes</span> : <span className="text-gray-400">no</span>}</td>
                            <td className="py-1 pr-2 font-mono text-gray-500">{p.sample}</td>
                            <td className="py-1 text-gray-600">{p.desc}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <CurlSnippet baseUrl={baseUrl} path={ep.path} params={ep.params} />
                </div>
              ))}
            </div>
          ))}
          <p className="text-[10px] text-gray-400 italic">
            Need a new endpoint or scope? Backend team adds it under{' '}
            <code className="bg-gray-100 px-1">routes/public/</code> and registers a scope here.
            Full guide: <code className="bg-gray-100 px-1">docs/guides/excel-power-query-integration.md</code>.
          </p>
        </div>
      )}
    </div>
  );
}

function CurlSnippet({ baseUrl, path, params }) {
  const sampleQs = params
    .filter((p) => p.required || p.sample)
    .map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(p.sample)}`)
    .join('&');
  const url = `${baseUrl}${path}${sampleQs ? `?${sampleQs}` : ''}`;
  const cmd = `curl -H "X-API-Key: <YOUR_KEY>" "${url}"`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { toast.error('Copy failed'); }
  };
  return (
    <div className="relative">
      <pre className="text-[9px] font-mono bg-gray-900 text-emerald-300 px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">{cmd}</pre>
      <button
        onClick={copy}
        className="absolute top-1 right-1 text-[9px] px-1.5 py-0.5 bg-gray-800 text-gray-300 hover:bg-gray-700 flex items-center gap-1"
      >
        {copied ? <CheckCircle2 className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

// ── Two ways to send the key — header vs query param. ──
function AuthSnippetPanel() {
  return (
    <div className="bg-blue-50 border border-blue-200 px-4 py-3">
      <div className="text-[11px] font-semibold text-blue-900 uppercase tracking-wide mb-1.5">How to authenticate</div>
      <ul className="text-[10px] text-blue-900 space-y-0.5">
        <li>• <strong>Header (recommended):</strong> <code className="bg-white px-1">X-API-Key: cdc_…</code></li>
        <li>• <strong>Query param fallback:</strong> append <code className="bg-white px-1">?api_key=cdc_…</code> — useful for Excel Power Query refreshes that drop custom headers.</li>
        <li>• Both transports check the same hash. Either works on every endpoint above.</li>
      </ul>
    </div>
  );
}
