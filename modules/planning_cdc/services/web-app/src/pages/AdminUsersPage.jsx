/* eslint-disable max-lines, no-unused-vars --
 * Legacy page with baseline debt from pre-guardrails era. Scheduled refactor:
 * task #38 — split AdminUsersPage into UserList / UserFormModal / RoleEditor
 * sub-components and migrate URLs to admin.api.js. Do NOT add new violations;
 * this pragma is a ceiling, not a green light.
 */
import React, { useEffect, useState, useMemo, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Search, Shield, ChevronDown, Check, X, Plus, Pencil, Info, Copy, RefreshCw } from 'lucide-react';
import CbpImportButton from './CbpImportButton';
import api from '@/services/api';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';
import UserDivisionsCell from '@/components/admin/UserDivisionsCell';
import UserFormModal from './admin/users/UserFormModal';

// Role codes that are AUTO-managed via the division-centric model
// (user_divisions FOCAL_PERSON rows; division_codes responsible_user_id →
// HEAD_OF_DIVISION / DIRECTOR, m_and_e_user_id → ME_OFFICER).
// Checking them in the role list still works as an override but won't
// wire the user to any specific division.
const AUTO_MANAGED_ROLE_CODES = new Set(['FOCAL_PERSON', 'HEAD_OF_DIVISION', 'DIRECTOR', 'ME_OFFICER']);

const ROLE_COLORS = {
  SYSTEM_ADMIN: 'bg-red-50 text-red-700 border-red-200',
  RBM_ADMIN: 'bg-purple-50 text-purple-700 border-purple-200',
  PLANNER: 'bg-blue-50 text-blue-700 border-blue-200',
  PROGRAM_OWNER: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  PROJECT_MANAGER: 'bg-amber-50 text-amber-700 border-amber-200',
  ME_OFFICER: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  FINANCE_OFFICER: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  APPROVER: 'bg-pink-50 text-pink-700 border-pink-200',
  EXECUTIVE_VIEWER: 'bg-gray-100 text-gray-600 border-gray-200',
  PARTNER_VIEWER: 'bg-gray-100 text-gray-500 border-gray-200',
  STAFF: 'bg-slate-50 text-slate-600 border-slate-200',
};

function RoleEditor({ user, allRoles, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(null);
  // Anchor coords for the portal-rendered dropdown. Recomputed on open +
  // on scroll/resize so the popover stays glued to the trigger button.
  const [pos, setPos] = useState({ top: 0, left: 0, openUp: false });
  const ref = useRef(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const userRoles = (user.roles || []).map(r => typeof r === 'string' ? r : r.code || r.name);

  // Recompute the portal coordinates from the trigger button's bounding
  // rect. If there isn't enough room below (e.g. the row is near the
  // bottom of the viewport OR inside a cramped overflow container with
  // only 1 row), flip the popover upward so it stays visible.
  const POP_WIDTH = 240;
  const POP_MAX_HEIGHT = 260;
  const recomputePosition = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < POP_MAX_HEIGHT + 8 && rect.top > POP_MAX_HEIGHT;
    const left = Math.min(rect.left, window.innerWidth - POP_WIDTH - 8);
    const top = openUp ? rect.top - 4 : rect.bottom + 4;
    setPos({ top, left: Math.max(8, left), openUp });
  };

  useLayoutEffect(() => { if (open) recomputePosition(); }, [open]);

  // Close on outside click + Escape, reposition on scroll/resize.
  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (popRef.current && popRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const handleKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', recomputePosition, true);
    window.addEventListener('resize', recomputePosition);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', recomputePosition, true);
      window.removeEventListener('resize', recomputePosition);
    };
  }, [open]);

  const toggleRole = async (role) => {
    const hasRole = userRoles.includes(role.code);
    setSaving(role.code);
    try {
      if (hasRole) {
        await api.delete(`/admin/users/${user.id}/roles/${role.id}`);
        toast.success(`Removed ${role.name} from ${user.full_name}`);
      } else {
        await api.post(`/admin/users/${user.id}/roles`, { role_id: role.id });
        toast.success(`Added ${role.name} to ${user.full_name}`);
      }
      onUpdate();
    } catch (err) {
      toast.error('Failed to update role');
    } finally { setSaving(null); }
  };

  return (
    <div className="relative" ref={ref}>
      <div className="flex flex-wrap gap-1 items-center">
        {userRoles.map(code => (
          <span key={code} className={`text-[9px] px-1.5 py-0.5 font-medium border ${ROLE_COLORS[code] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
            {code}
          </span>
        ))}
        <button
          ref={btnRef}
          onClick={() => setOpen((v) => !v)}
          className="text-[9px] px-1.5 py-0.5 bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600 border border-dashed border-gray-300"
        >
          {open ? '×' : '+'}
        </button>
      </div>
      {/* Render the popover in a portal so ancestor `overflow` cannot clip
          it — which used to happen whenever the table had a single row and
          the dropdown had nowhere to grow inside the overflow-x-auto wrapper. */}
      {open && createPortal(
        <div
          ref={popRef}
          className="fixed z-[9999] bg-white border border-gray-200 shadow-lg w-[240px] max-h-[260px] overflow-y-auto"
          style={{
            top: pos.openUp ? undefined : pos.top,
            bottom: pos.openUp ? window.innerHeight - pos.top : undefined,
            left: pos.left,
          }}
        >
          {allRoles.map(role => {
            const has = userRoles.includes(role.code);
            const isSaving = saving === role.code;
            return (
              <button
                key={role.id}
                onClick={() => toggleRole(role)}
                disabled={isSaving}
                className={`w-full text-left px-3 py-2 text-[11px] flex items-center gap-2 hover:bg-gray-50 border-b border-gray-50 ${has ? 'bg-green-50/50' : ''}`}
              >
                {isSaving ? <Loader2 className="w-3 h-3 animate-spin text-gray-400 flex-shrink-0" />
                  : has ? <Check className="w-3 h-3 text-green-600 flex-shrink-0" />
                  : <div className="w-3 h-3 border border-gray-300 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800">{role.code}</div>
                  <div className="text-[9px] text-gray-400">{role.name}</div>
                </div>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}


const ROLE_BAR_COLORS = {
  SYSTEM_ADMIN:     '#9F2241',  // AU red
  RBM_ADMIN:        '#7C3AED',  // purple
  PLANNER:          '#2563EB',  // blue
  PROGRAM_OWNER:    '#0891B2',  // cyan
  PROGRAM_MANAGER:  '#0891B2',  // (legacy alias → same as PROGRAM_OWNER)
  PROJECT_MANAGER:  '#D97706',  // amber
  ME_OFFICER:       '#4F46E5',  // indigo
  FINANCE_OFFICER:  '#059669',  // emerald
  APPROVER:         '#DB2777',  // pink
  EXECUTIVE_VIEWER: '#64748B',  // slate
  PARTNER_VIEWER:   '#94A3B8',  // slate-light
  HEAD_OF_DIVISION: '#B4A269',  // AU gold
  FOCAL_PERSON:     '#1A5632',  // AU green
};

/**
 * Compact role distribution widget — replaces the old grid of 12 stat
 * cards that made the zero-count rows look noisy. The new layout is:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ <stacked proportion bar — one coloured segment per role>    │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │ <legend: chips for populated roles only, sorted by count>   │
 *   │ <muted footer: "Unused: ROLE_A · ROLE_B · …" (one line)    │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * The bar + chips only render the populated roles so zero-count roles
 * don't waste vertical space. The unused list is still there for
 * reference, just muted into the footer line so it doesn't compete
 * for attention.
 */
function RoleDistribution({ roles, roleCounts, totalUsers }) {
  const populated = useMemo(() => {
    return [...(roles || [])]
      .map((r) => ({ ...r, count: roleCounts[r.code] || 0 }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [roles, roleCounts]);

  const unused = useMemo(() => {
    return (roles || [])
      .filter((r) => !(roleCounts[r.code] || 0))
      .map((r) => r.code);
  }, [roles, roleCounts]);

  // Total assignments (can exceed totalUsers because a user may carry
  // several roles). We use this to compute the bar segment widths so
  // the proportions always sum to 100%.
  const totalAssignments = populated.reduce((s, r) => s + r.count, 0);

  if (totalAssignments === 0) {
    return (
      <div className="bg-white border border-gray-200 border-t-0 px-5 py-4 text-[11px] text-gray-400 italic">
        No roles assigned yet.
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 border-t-0">
      {/* Header with title + total count */}
      <div className="px-5 py-2.5 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Role distribution
          </span>
          <span className="text-[10px] text-gray-400">
            · {totalAssignments} assignment{totalAssignments > 1 ? 's' : ''} across {totalUsers} user{totalUsers > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Stacked proportion bar — one coloured segment per populated role.
          Uses inline flex with percentage widths. Hover exposes the
          role code + count via native tooltip. */}
      <div className="px-5 pt-3">
        <div className="flex h-2 w-full overflow-hidden border border-gray-200">
          {populated.map((role) => {
            const pct = (role.count / totalAssignments) * 100;
            return (
              <div
                key={role.id}
                style={{
                  width: `${pct}%`,
                  backgroundColor: ROLE_BAR_COLORS[role.code] || '#9CA3AF',
                }}
                title={`${role.code}: ${role.count} (${pct.toFixed(0)}%)`}
              />
            );
          })}
        </div>
      </div>

      {/* Legend chips — one per populated role, sorted by count desc */}
      <div className="px-5 py-3 flex items-center gap-2 flex-wrap">
        {populated.map((role) => {
          const color = ROLE_BAR_COLORS[role.code] || '#9CA3AF';
          const pct = ((role.count / totalAssignments) * 100).toFixed(0);
          return (
            <div
              key={role.id}
              className="flex items-center gap-1.5 px-2 py-1 border border-gray-200 bg-gray-50/60"
              title={`${role.count} user${role.count > 1 ? 's' : ''} (${pct}% of assignments)`}
            >
              <span
                className="w-2 h-2 flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-[10px] font-semibold text-gray-800">{role.code}</span>
              <span className="text-[10px] font-bold text-gray-900 ml-0.5">{role.count}</span>
              <span className="text-[9px] text-gray-400">· {pct}%</span>
            </div>
          );
        })}
      </div>

      {/* Unused roles — muted footer line, only shown if any exist */}
      {unused.length > 0 && (
        <div className="px-5 pb-3 text-[10px] text-gray-400">
          <span className="uppercase tracking-wider font-semibold mr-1.5">Unused</span>
          <span className="text-gray-400">
            {unused.map((code, i) => (
              <React.Fragment key={code}>
                {i > 0 && <span className="text-gray-300"> · </span>}
                <span>{code}</span>
              </React.Fragment>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Admin user management page. Lists all platform users with role/division filters,
 * inline create/edit modals and account status toggles. Users sign in with
 * Microsoft only (D-20261107-03), so there is no password action.
 *
 * @returns {JSX.Element}
 */
export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { data: adminData, isLoading: loading } = useQuery({
    queryKey: ['admin', 'users-page'],
    queryFn: async () => {
      const [u, r, d] = await Promise.all([
        api.get('/admin/users?limit=500'),
        api.get('/admin/roles'),
        api.get('/admin/division-codes').catch(() => ({ data: [] })),
      ]);
      return {
        users: u.data?.data || u.data || [],
        roles: r.data?.data || r.data || [],
        divisions: d.data?.data || d.data || [],
      };
    },
    staleTime: 60_000,
  });
  const { users, roles, divisions } = useMemo(() => ({
    users: adminData?.users || [],
    roles: adminData?.roles || [],
    divisions: adminData?.divisions || [],
  }), [adminData]);
  // ?q= opens the page on one user, e.g. from the adoption list (D-20261106-03).
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('q') || '');
  const [modalState, setModalState] = useState({ open: false, mode: 'create', user: null });
  const openCreate = () => setModalState({ open: true, mode: 'create', user: null });
  const openEdit = (u) => setModalState({ open: true, mode: 'edit', user: u });
  const openDuplicate = (u) => setModalState({ open: true, mode: 'duplicate', user: u });
  const closeModal = () => setModalState({ open: false, mode: 'create', user: null });

  const refreshUsers = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users-page'] });

  // ── CBP staff import (D-20260713-01) — see CbpImportButton.jsx ──
  const { can } = usePermissions();
  const canSyncCbp = can('sync', 'execute');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return users;
    return users.filter(u => [u.full_name, u.email, ...(u.roles || []).map(r => typeof r === 'string' ? r : r.code)].join(' ').toLowerCase().includes(q));
  }, [users, search]);

  const roleCounts = {};
  users.forEach(u => (u.roles || []).forEach(r => { const c = typeof r === 'string' ? r : r.code || r.name; roleCounts[c] = (roleCounts[c] || 0) + 1; }));

  if (loading) return <DashboardLayout breadcrumbs={[{ label: 'Admin' }, { label: 'Users & Roles' }]}><div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" /></div></DashboardLayout>;

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Admin' }, { label: 'Users & Roles' }]}>
      <div className="space-y-0">

        <div className="bg-[#1A5632] text-white">
          <div className="px-6 py-5">
            <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">Admin</span>
            <h1 className="text-[20px] font-semibold mt-2">Users & Roles</h1>
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex items-center gap-6 text-[12px] text-white/70">
            <span><strong className="text-white">{users.length}</strong> Users</span>
            <span><strong className="text-white">{roles.length}</strong> Roles</span>
            <span><strong className="text-white">{users.filter(u => u.is_active !== false).length}</strong> Active</span>
          </div>
        </div>

        {/* Role distribution — stacked proportion bar + compact chips for
            populated roles, unused ones folded into a muted footer line. */}
        <RoleDistribution roles={roles} roleCounts={roleCounts} totalUsers={users.length} />

        {/* Search + Create */}
        <div className="bg-white border border-gray-200 border-t-0 px-5 py-3 flex items-center gap-3">
          <div className="relative flex-1 max-w-[300px]">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users or roles..."
              className="w-full text-[12px] border border-gray-200 pl-8 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1A5632]" />
          </div>
          <span className="text-[11px] text-gray-400">{filtered.length} users</span>
          {canSyncCbp && <CbpImportButton />}
          <button
            onClick={openCreate}
            className={`${canSyncCbp ? '' : 'ml-auto '}text-[11px] px-3 py-1.5 bg-[#1A5632] text-white hover:bg-[#14442A] flex items-center gap-1.5`}
          >
            <Plus className="w-3.5 h-3.5" />
            New User
          </button>
        </div>

        <UserFormModal
          open={modalState.open}
          mode={modalState.mode}
          user={modalState.user}
          onClose={closeModal}
          roles={roles}
          divisions={divisions}
          onSaved={refreshUsers}
        />

        {/* Users table */}
        <div className="bg-white border border-gray-200 border-t-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-100 text-[10px] text-gray-500 uppercase">
                  <th className="px-4 py-2 font-semibold">User</th>
                  <th className="px-4 py-2 font-semibold">Email</th>
                  <th className="px-4 py-2 font-semibold w-[220px]">Division</th>
                  <th className="px-4 py-2 font-semibold w-[250px]">Roles (click + to edit)</th>
                  <th className="px-4 py-2 font-semibold w-[70px] text-center">Status</th>
                  <th className="px-4 py-2 font-semibold w-[60px] text-center">Edit</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, idx) => (
                  <tr key={u.id} className={`border-b border-gray-100 hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 bg-[#1A5632] flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-semibold text-white">
                            {u.full_name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U'}
                          </span>
                        </div>
                        <span className="text-[12px] font-medium text-gray-900">{u.full_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-gray-500">{u.email}</td>
                    <td className="px-4 py-3"><UserDivisionsCell divisions={u.divisions} businessUnit={u.business_unit} /></td>
                    <td className="px-4 py-3">
                      <RoleEditor user={u} allRoles={roles} onUpdate={refreshUsers} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[10px] px-2 py-0.5 font-medium ${u.status === 'ACTIVE' || u.is_active !== false ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.status || (u.is_active !== false ? 'ACTIVE' : 'INACTIVE')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEdit(u)}
                          className="text-[10px] px-2 py-1 border border-gray-300 text-gray-600 hover:bg-[#1A5632] hover:text-white hover:border-[#1A5632] inline-flex items-center gap-1"
                          title="Edit user"
                        >
                          <Pencil className="w-3 h-3" />
                          Edit
                        </button>
                        <button
                          onClick={() => openDuplicate(u)}
                          className="text-[10px] px-2 py-1 border border-gray-300 text-gray-600 hover:bg-purple-600 hover:text-white hover:border-purple-600 inline-flex items-center gap-1"
                          title="Duplicate user (same roles &amp; division)"
                        >
                          <Copy className="w-3 h-3" />
                          Duplicate
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
