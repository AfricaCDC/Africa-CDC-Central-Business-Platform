/* eslint-disable max-lines -- 3 sub-components + main page in one file */
import { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Loader2, Shield, Database, Building2, Plus, X, Check, Pencil, Calendar, Lock, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { STATUS_COLORS } from '@rbm/lib/enums';
import {
  useAdminSettingsData,
  useReportingPeriods,
  useCreatePeriod,
  useUpdatePeriod,
  useUpdateRolePermissions,
} from './admin/hooks/useAdminQueries';
import EmailRemindersSettings from './admin/EmailRemindersSettings';

const QUARTER_LABELS = {
  Q1: 'Q1 — Jan–Mar', Q2: 'Q2 — Apr–Jun', Q3: 'Q3 — Jul–Sep', Q4: 'Q4 — Oct–Dec',
};

const EMPTY_FORM = { quarter: 'Q1', fiscal_year: new Date().getFullYear(), label: '', start_date: '', end_date: '' };

function ReportingPeriods() {
  const { data: periods = [], isLoading } = useReportingPeriods();
  const createMut = useCreatePeriod();
  const updateMut = useUpdatePeriod();

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState({});

  const handleCreate = async () => {
    if (!form.label || !form.start_date || !form.end_date) {
      toast.error('Fill in all fields'); return;
    }
    try {
      await createMut.mutateAsync(form);
      toast.success('Period created');
      setShowCreate(false);
      setForm(EMPTY_FORM);
    } catch { toast.error('Failed to create period'); }
  };

  const setStatus = async (id, status) => {
    try {
      await updateMut.mutateAsync({ id, data: { status } });
      toast.success(status === 'OPEN' ? 'Reporting period opened' : 'Reporting period closed');
    } catch { toast.error('Failed to update period'); }
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditForm({
      quarter: p.quarter,
      fiscal_year: p.fiscal_year,
      label: p.label,
      start_date: p.start_date?.substring(0, 10) || '',
      end_date: p.end_date?.substring(0, 10) || '',
    });
  };

  const handleSaveEdit = async (id) => {
    if (!editForm.label || !editForm.start_date || !editForm.end_date) {
      toast.error('Fill in all fields'); return;
    }
    try {
      await updateMut.mutateAsync({ id, data: editForm });
      toast.success('Period updated');
      setEditingId(null);
    } catch { toast.error('Failed to update period'); }
  };

  return (
    <div className="bg-white border border-gray-200 border-t-0">
      <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#1A5632]" />
          <h3 className="text-[13px] font-semibold text-gray-800">Quarterly Report — Reporting Periods</h3>
        </div>
        <button onClick={() => setShowCreate(p => !p)}
          className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 border border-[#1A5632] text-[#1A5632] hover:bg-[#1A5632] hover:text-white">
          <Plus className="w-3.5 h-3.5" /> New Period
        </button>
      </div>

      {showCreate && (
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50 space-y-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Create New Period</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Quarter</label>
              <select value={form.quarter} onChange={e => setForm(p => ({ ...p, quarter: e.target.value }))}
                className="w-full text-[12px] border border-gray-300 px-3 py-2 focus:outline-none focus:border-[#1A5632]">
                {Object.entries(QUARTER_LABELS).map(([q, l]) => <option key={q} value={q}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Fiscal Year</label>
              <input type="number" value={form.fiscal_year} onChange={e => setForm(p => ({ ...p, fiscal_year: Number(e.target.value) }))}
                className="w-full text-[12px] border border-gray-300 px-3 py-2 focus:outline-none focus:border-[#1A5632]" />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-gray-500 block mb-1">Label (displayed to reporters)</label>
              <input type="text" value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
                placeholder="e.g. Q1 FY2026 — January to March 2026"
                className="w-full text-[12px] border border-gray-300 px-3 py-2 focus:outline-none focus:border-[#1A5632]" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Start Date</label>
              <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                className="w-full text-[12px] border border-gray-300 px-3 py-2 focus:outline-none focus:border-[#1A5632]" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">End Date</label>
              <input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
                className="w-full text-[12px] border border-gray-300 px-3 py-2 focus:outline-none focus:border-[#1A5632]" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={createMut.isPending}
              className="px-4 py-2 text-[12px] font-medium bg-[#1A5632] text-white hover:bg-[#15472a] flex items-center gap-2 disabled:opacity-50">
              {createMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Create
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-[12px] border border-gray-300 text-gray-600 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-[#1A5632]" /></div>
      ) : periods.length === 0 ? (
        <div className="px-5 py-8 text-center text-[13px] text-gray-400">No reporting periods created yet.</div>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] text-gray-500 border-b border-gray-200 bg-gray-50/50">
              <th className="px-4 py-2">Label</th>
              <th className="px-4 py-2 w-[70px]">Quarter</th>
              <th className="px-4 py-2 w-[70px]">FY</th>
              <th className="px-4 py-2 w-[100px]">Start</th>
              <th className="px-4 py-2 w-[100px]">End</th>
              <th className="px-4 py-2 w-[80px] text-center">Status</th>
              <th className="px-4 py-2 w-[120px] text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {periods.map(p => editingId === p.id ? (
              <tr key={p.id} className="border-b border-gray-100 bg-amber-50/40">
                <td className="px-3 py-2" colSpan={7}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 items-end">
                    <div>
                      <label className="text-[9px] text-gray-400 uppercase block mb-1">Quarter</label>
                      <select value={editForm.quarter} onChange={e => setEditForm(f => ({ ...f, quarter: e.target.value }))}
                        className="w-full text-[11px] border border-gray-300 px-2 py-1.5 focus:outline-none focus:border-[#1A5632]">
                        {Object.entries(QUARTER_LABELS).map(([q]) => <option key={q} value={q}>{q}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] text-gray-400 uppercase block mb-1">FY</label>
                      <input type="number" value={editForm.fiscal_year} onChange={e => setEditForm(f => ({ ...f, fiscal_year: Number(e.target.value) }))}
                        className="w-full text-[11px] border border-gray-300 px-2 py-1.5 focus:outline-none focus:border-[#1A5632]" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[9px] text-gray-400 uppercase block mb-1">Label</label>
                      <input type="text" value={editForm.label} onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                        className="w-full text-[11px] border border-gray-300 px-2 py-1.5 focus:outline-none focus:border-[#1A5632]" />
                    </div>
                    <div>
                      <label className="text-[9px] text-gray-400 uppercase block mb-1">Start</label>
                      <input type="date" value={editForm.start_date} onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))}
                        className="w-full text-[11px] border border-gray-300 px-2 py-1.5 focus:outline-none focus:border-[#1A5632]" />
                    </div>
                    <div>
                      <label className="text-[9px] text-gray-400 uppercase block mb-1">End</label>
                      <input type="date" value={editForm.end_date} onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))}
                        className="w-full text-[11px] border border-gray-300 px-2 py-1.5 focus:outline-none focus:border-[#1A5632]" />
                    </div>
                    <div className="flex gap-2 pt-4">
                      <button onClick={() => handleSaveEdit(p.id)} disabled={updateMut.isPending}
                        className="flex items-center gap-1 text-[10px] px-2 py-1.5 bg-[#1A5632] text-white hover:bg-[#15472a] disabled:opacity-50">
                        {updateMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-[10px] px-2 py-1.5 border border-gray-300 text-gray-600 hover:bg-gray-50">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5 text-[12px] text-gray-800">{p.label}</td>
                <td className="px-4 py-2.5 text-[11px] font-mono text-gray-600">{p.quarter}</td>
                <td className="px-4 py-2.5 text-[11px] text-gray-600">{p.fiscal_year}</td>
                <td className="px-4 py-2.5 text-[11px] text-gray-500">{p.start_date?.substring(0, 10)}</td>
                <td className="px-4 py-2.5 text-[11px] text-gray-500">{p.end_date?.substring(0, 10)}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`text-[9px] font-bold uppercase px-2 py-0.5 ${STATUS_COLORS[p.status] || ''}`}>{p.status}</span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => startEdit(p)}
                      className="flex items-center gap-1 text-[10px] px-2 py-1 border border-gray-300 text-gray-600 hover:bg-gray-50">
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                    {p.status === 'OPEN' ? (
                      <button onClick={() => setStatus(p.id, 'CLOSED')} disabled={updateMut.isPending}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50">
                        {updateMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />} Close
                      </button>
                    ) : (
                      <button onClick={() => setStatus(p.id, 'OPEN')} disabled={updateMut.isPending}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 border border-[#1A5632] text-[#1A5632] hover:bg-[#1A5632] hover:text-white disabled:opacity-50">
                        {updateMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlock className="w-3 h-3" />} Open
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const ALL_PERMS = [
  'admin.users', 'admin.roles', 'admin.settings', 'admin.audit', 'admin.integrations',
  'all.archive', 'all.restore',
  'rbm.structure', 'rbm.templates', 'rbm.workflow', 'rbm.publish',
  'plans.create', 'plans.edit', 'plans.submit',
  'results.create', 'results.edit',
  'logframe.create', 'logframe.edit',
  'programs.create', 'programs.edit', 'programs.submit',
  'projects.create', 'projects.edit',
  'workplans.create', 'workplans.edit', 'workplans.submit',
  'items.create', 'items.edit', 'items.status',
  'indicators.create', 'indicators.edit',
  'baselines.edit', 'targets.edit',
  'achievements.create', 'achievements.validate',
  'dqa.create', 'dqa.edit',
  'budgets.create', 'budgets.edit', 'budgets.submit',
  'expenditures.create', 'expenditures.edit',
  'approvals.decide', 'approvals.view',
  'dashboard.view', 'reports.view',
  'partner.view', 'partner.comment',
];

function PermEditor({ role }) {
  const updatePermsMut = useUpdateRolePermissions();
  const [editing, setEditing] = useState(false);
  const [perms, setPerms] = useState(() => {
    let p = role.permissions;
    if (typeof p === 'string') try { p = JSON.parse(p); } catch { p = []; }
    return Array.isArray(p) ? p : [];
  });
  const toggle = (perm) => {
    setPerms(prev => prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]);
  };

  const save = async () => {
    try {
      await updatePermsMut.mutateAsync({ roleId: role.id, permissions: perms });
      toast.success(`${role.code} permissions updated`);
      setEditing(false);
    } catch { toast.error('Failed to save'); }
  };

  if (!editing) {
    return (
      <div className="flex flex-wrap gap-1 items-center">
        {perms.map(p => (
          <span key={p} className="text-[9px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5">{p}</span>
        ))}
        <button onClick={() => setEditing(true)} className="text-[9px] px-1.5 py-0.5 text-[#1A5632] hover:bg-green-50 border border-dashed border-gray-300">
          <Pencil className="w-2.5 h-2.5 inline" />
        </button>
      </div>
    );
  }

  const groups = {};
  ALL_PERMS.forEach(p => {
    const prefix = p.split('.')[0];
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(p);
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={save} disabled={updatePermsMut.isPending}
          className="text-[10px] px-2 py-1 bg-[#1A5632] text-white flex items-center gap-1">
          {updatePermsMut.isPending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Check className="w-2.5 h-2.5" />} Save
        </button>
        <button onClick={() => setEditing(false)} className="text-[10px] px-2 py-1 border border-gray-300 text-gray-600">Cancel</button>
      </div>
      {Object.entries(groups).map(([prefix, groupPerms]) => (
        <div key={prefix} className="flex flex-wrap gap-1 items-center">
          <span className="text-[8px] font-bold text-gray-400 uppercase w-[70px] flex-shrink-0">{prefix}</span>
          {groupPerms.map(p => {
            const has = perms.includes(p);
            const action = p.split('.')[1];
            return (
              <button key={p} onClick={() => toggle(p)}
                className={`text-[9px] font-mono px-1.5 py-0.5 border transition-colors ${
                  has ? 'bg-[#1A5632] text-white border-[#1A5632]' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'
                }`}>
                {action}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function AdminSettingsPage() {
  const { data, isLoading } = useAdminSettingsData();

  const roles = data?.roles || [];
  const tiers = data?.tiers || [];
  const bus = data?.bus || [];

  const tierColors = { 1: '#9F2241', 2: '#1A5632', 3: '#B4A269', 4: '#58595B', 5: '#2563EB' };

  if (isLoading) return <DashboardLayout breadcrumbs={[{ label: 'Admin' }, { label: 'Settings' }]}><div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" /></div></DashboardLayout>;

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Admin' }, { label: 'Settings' }]}>
      <div className="space-y-0">
        <div className="bg-[#1A5632] text-white">
          <div className="px-6 py-5">
            <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">Admin</span>
            <h1 className="text-[20px] font-semibold mt-2">Platform Settings</h1>
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex items-center gap-6 text-[12px] text-white/70">
            <span>FY {new Date().getFullYear()}</span>
            <span><strong className="text-white">{roles.length}</strong> Roles</span>
            <span><strong className="text-white">{tiers.length}</strong> Tiers</span>
            <span><strong className="text-white">{bus.length}</strong> Business Units</span>
          </div>
        </div>

        <ReportingPeriods />

        <EmailRemindersSettings />

        {/* Roles & Permissions */}
        <div className="bg-white border border-gray-200 border-t-0">
          <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#1A5632]" />
            <h3 className="text-[13px] font-semibold text-gray-800">Roles & Permissions (RBAC)</h3>
            <span className="text-[10px] text-gray-400 ml-1">Click pencil to edit permissions</span>
          </div>
          <div className="divide-y divide-gray-100">
            {roles.map(role => (
              <div key={role.id || role.code} className="px-5 py-3">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[11px] font-mono font-bold text-[#1A5632] bg-green-50 px-2 py-0.5">{role.code}</span>
                  <span className="text-[12px] font-semibold text-gray-900">{role.name}</span>
                  <span className="text-[10px] text-gray-400">— {role.description}</span>
                </div>
                <PermEditor role={role} />
              </div>
            ))}
          </div>
        </div>

        {/* Tiers */}
        <div className="bg-white border border-gray-200 border-t-0">
          <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
            <Database className="w-4 h-4 text-[#1A5632]" />
            <h3 className="text-[13px] font-semibold text-gray-800">Result Tiers</h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-5 divide-x divide-gray-200">
            {tiers.map(t => (
              <div key={t.tier_id} className="px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold text-white px-2 py-0.5" style={{ backgroundColor: tierColors[t.tier_id] || '#666' }}>T{t.tier_id}</span>
                  <span className="text-[13px] font-semibold text-gray-900">{t.tier_label}</span>
                </div>
                <div className="text-[11px] text-gray-500">{t.sp_level || '—'}</div>
                <div className="text-[10px] text-gray-400 mt-1">{t.timeframe || '—'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Business Units */}
        <div className="bg-white border border-gray-200 border-t-0">
          <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#1A5632]" />
            <h3 className="text-[13px] font-semibold text-gray-800">Business Units ({bus.length})</h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4">
            {bus.filter(b => b.id !== 1).map(bu => (
              <div key={bu.id} className="px-4 py-3 border-r border-b border-gray-100">
                <span className="text-[11px] font-mono font-semibold text-[#1A5632] mr-2">{bu.code}</span>
                <span className="text-[11px] text-gray-700">{bu.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
