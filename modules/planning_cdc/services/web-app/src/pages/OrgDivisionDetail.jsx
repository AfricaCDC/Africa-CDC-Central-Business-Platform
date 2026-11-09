/* eslint-disable complexity, no-restricted-syntax --
 * Legacy file with baseline debt from pre-guardrails era. Scheduled refactor:
 * task #38 (AdminUsersPage + OrgModals off pragma). Do NOT add new violations; this pragma is a ceiling.
 * (cdc-rbm/no-api-url-in-component dropped 2026-08-04: the rule no longer fires
 * here and the unused directive itself failed lint-staged --max-warnings 0.)
 */
// Org chart — single division detail page.
//
// URL: /reference/org/:code
// Read: any admin (ROLE_GROUPS.ADMINS).
// Write (rename / move / delete): SYSTEM_ADMIN ONLY.
//
// Shows: ancestors breadcrumb → this division → its children + users assigned.
// Inline edit for name when SYSTEM_ADMIN. The Move action is delegated back
// to the tree page for now (the picker UI lives there).

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, Pencil, Check, X, Users, ChevronRight, ArrowLeft,
  Folder, FolderOpen, Plus, Trash2, Link2, Link2Off, UserCheck, ShieldCheck, Eye,
} from 'lucide-react';
import api from '@/services/api';
import { toast } from 'sonner';
import SearchSelect from '@/components/shared/SearchSelect';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { divisionTeamApi } from '@/services/divisionTeam.api';
import { NewDivisionModal, ConfirmModal, AliasPickerModal, LevelBadge, LEVEL_STYLES } from './org/OrgModals';
import { CountryOfficeBadge, CountryOfficePicker } from './org/CountryOffice';
import { getErrorMessage } from '@/utils/errorMessage';
import { ORG_LEVEL_TYPES } from '@rbm/lib/enums';
import { DIVISION_ASSIGNMENT_ROLES as DR, DIVISION_ASSIGNMENT_ROLE_LABELS as DR_LABEL } from '@rbm/lib/user-divisions';

function fmtName(u) {
  if (!u) return '';
  const parts = [u.first_name, u.last_name].filter(Boolean);
  return parts.length ? parts.join(' ') : (u.full_name || u.email || '—');
}

/**
 * Assignment slot that shows ALL users with a given division role.
 * Supports multiple assignees (e.g. several focal persons).
 * Admins can add/remove via a search picker.
 */
function AssignmentSlot({ label, help, icon, assignedUsers, allUsers, saving, canEdit, onAdd, onRemove }) {
  const sorted = useMemo(
    () => [...(allUsers || [])].sort((a, b) => fmtName(a).localeCompare(fmtName(b))),
    [allUsers]
  );
  const assignedIds = new Set((assignedUsers || []).map(u => u.id));
  const available = sorted.filter(u => !assignedIds.has(u.id));

  return (
    <div className="border border-gray-100 px-3 py-2.5 bg-gray-50/40">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold text-gray-500 mb-1">
        {icon}
        {label}
        {assignedUsers?.length > 0 && (
          <span className="text-[9px] font-normal text-gray-400">({assignedUsers.length})</span>
        )}
      </div>
      {assignedUsers && assignedUsers.length > 0 ? (
        <div className="space-y-1 mb-1.5">
          {assignedUsers.map(u => (
            <div key={u.id} className="flex items-center gap-2">
              <div className="w-6 h-6 bg-[#1A5632] flex items-center justify-center flex-shrink-0">
                <span className="text-[9px] font-semibold text-white">
                  {fmtName(u).split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase() || 'U'}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium text-gray-900 truncate">{fmtName(u)}</div>
                <div className="text-[9px] text-gray-500 truncate">{u.email}</div>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onRemove(u.id)}
                  className="text-gray-400 hover:text-red-600 p-0.5 flex-shrink-0"
                  title="Remove"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px] italic text-gray-400 mb-1.5">Not assigned</div>
      )}
      {canEdit && (
        <div className="flex items-center gap-1.5">
          <div className="flex-1">
            <SearchSelect
              value={null}
              onChange={(v) => { if (v) onAdd(v); }}
              placeholder="Search by name or email..."
              options={available.map((u) => ({
                value: u.id,
                label: fmtName(u),
                sub: u.email,
              }))}
            />
          </div>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1A5632]" />}
        </div>
      )}
      <div className="text-[9px] text-gray-400 mt-1.5">{help}</div>
    </div>
  );
}

/**
 * Single-person picker for the Responsible (approver) slot — only one per division.
 * `inherited` names the ancestor approver used while the slot is empty.
 */
function SingleAssignmentSlot({ label, help, icon, currentUser, inherited, allUsers, saving, canEdit, onChange }) {
  const sorted = useMemo(
    () => [...(allUsers || [])].sort((a, b) => fmtName(a).localeCompare(fmtName(b))),
    [allUsers]
  );
  return (
    <div className="border border-gray-100 px-3 py-2.5 bg-gray-50/40">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold text-gray-500 mb-1">
        {icon}
        {label}
      </div>
      {currentUser ? (
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-7 h-7 bg-[#B45309] flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-semibold text-white">
              {fmtName(currentUser).split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase() || 'U'}
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-gray-900 truncate">{fmtName(currentUser)}</div>
            <div className="text-[10px] text-gray-500 truncate">{currentUser.email}</div>
          </div>
        </div>
      ) : inherited?.user ? (
        <div className="text-[11px] text-gray-500 mb-1.5">
          <span className="italic text-gray-400">Not assigned — </span>
          approvals go to <span className="font-medium text-gray-800">{fmtName(inherited.user)}</span>
          <span className="text-gray-400"> ({DR_LABEL[DR.HEAD_OF_DIVISION]} of{' '}
            <Link to={`/reference/org/${encodeURIComponent(inherited.code)}`} className="underline">{inherited.code}</Link>)
          </span>
        </div>
      ) : (
        <div className="text-[11px] italic text-gray-400 mb-1.5">Not assigned</div>
      )}
      {canEdit && (
        <div className="flex items-center gap-1.5">
          <div className="flex-1">
            <SearchSelect
              value={currentUser?.id || null}
              onChange={(v) => onChange(v || null)}
              placeholder="Search by name or email..."
              allowClear
              options={sorted.map((u) => ({
                value: u.id,
                label: fmtName(u),
                sub: u.email,
              }))}
            />
          </div>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1A5632]" />}
        </div>
      )}
      <div className="text-[9px] text-gray-400 mt-1.5">{help}</div>
    </div>
  );
}

/**
 * Detail page for a single division (resolved from the route param `code`).
 * Shows division members, activities and metrics; allows org editors to update.
 *
 * @returns {JSX.Element}
 */
export default function OrgDivisionDetail() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { user: currentUser } = useAuth();
  const canEdit = can('org_structure', 'update');

  const queryClient = useQueryClient();
  const [data, setData] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [newChildOpen, setNewChildOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [aliasPickerOpen, setAliasPickerOpen] = useState(false);
  const [savingAssign, setSavingAssign] = useState(null);

  const { data: fetchedData, isLoading: loading } = useQuery({
    queryKey: ['admin', 'division', code],
    queryFn: () => api.get(`/admin/divisions/${encodeURIComponent(code)}`).then(r => r.data),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (fetchedData) {
      setData(fetchedData);
      setDraftName(fetchedData.division_name || '');
    }
  }, [fetchedData]);

  // The Head of Division of THIS division may manage its reporting team even
  // without org_structure:update. detail.responsible_user_id is the HOD.
  const isHodHere = !!currentUser?.id && data?.responsible_user_id === currentUser.id;
  const canManageTeam = canEdit || isHodHere;

  const { data: allUsers = [] } = useQuery({
    queryKey: ['admin', 'users-active'],
    queryFn: () => api.get('/admin/users', { params: { limit: 500 } }).then(r => {
      const list = Array.isArray(r.data) ? r.data : (r.data?.data || r.data?.users || []);
      return list.filter(u => u.status !== 'INACTIVE');
    }).catch(() => []),
    enabled: canManageTeam,
    staleTime: 300_000,
  });

  // Reporting team members (user_divisions MEMBER) — HOD-managed.
  const { data: teamMembers = [] } = useQuery({
    queryKey: ['division-team', code],
    queryFn: () => divisionTeamApi.list(code).catch(() => []),
    enabled: !!code && canManageTeam,
    staleTime: 60_000,
  });
  const memberOnly = useMemo(
    () => teamMembers.filter((m) => m.role === DR.MEMBER),
    [teamMembers],
  );
  const [savingTeam, setSavingTeam] = useState(false);
  const handleAddTeamMember = async (userId) => {
    setSavingTeam(true);
    try {
      await divisionTeamApi.add(code, userId);
      queryClient.invalidateQueries({ queryKey: ['division-team', code] });
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not add the team member');
    } finally { setSavingTeam(false); }
  };
  const handleRemoveTeamMember = async (userId) => {
    setSavingTeam(true);
    try {
      await divisionTeamApi.remove(code, userId);
      queryClient.invalidateQueries({ queryKey: ['division-team', code] });
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not remove the team member');
    } finally { setSavingTeam(false); }
  };

  // Map an assignment field to its resolved-user sibling + UI loading key.
  // Keeps submitSetAssignment agnostic of which slot is being edited.
  const ASSIGN_FIELDS = {
    responsible_user_id: { resolvedKey: 'responsible_user', loadingKey: 'responsible' },
    m_and_e_user_id:     { resolvedKey: 'm_and_e_user',     loadingKey: 'm_and_e' },
  };

  // PATCH a single user assignment column on the division. Used for focal,
  // responsible and M&E officer slots. Optimistic update with rollback on error.
  const submitSetAssignment = async (field, userId) => {
    const meta = ASSIGN_FIELDS[field];
    if (!meta) return;
    const previous = data?.[field] ?? null;
    const previousResolved = data?.[meta.resolvedKey] ?? null;
    const next = userId ? Number(userId) : null;
    const resolvedNext = next ? allUsers.find((u) => Number(u.id) === next) || null : null;
    setSavingAssign(meta.loadingKey);
    setData((d) => d && {
      ...d,
      [field]: next,
      [meta.resolvedKey]: resolvedNext,
    });
    try {
      await api.patch(`/admin/divisions/${encodeURIComponent(code)}`, { [field]: next });
      toast.success(next ? 'Assignment updated' : 'Assignment cleared');
    } catch (err) {
      setData((d) => d && {
        ...d,
        [field]: previous,
        [meta.resolvedKey]: previousResolved,
      });
      toast.error(err.response?.data?.message || 'Failed to update assignment');
    } finally {
      setSavingAssign(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'division', code] });
    }
  };

  // Build per-role user lists from data.users + division_roles
  const usersByDivRole = useMemo(() => {
    const map = Object.fromEntries(Object.values(DR).map((r) => [r, []]));
    if (!data?.users) return map;
    for (const u of data.users) {
      for (const dr of (u.division_roles || [])) {
        if (map[dr]) map[dr].push(u);
      }
    }
    return map;
  }, [data?.users]);

  const addDivisionAssignment = async (userId, role) => {
    setSavingAssign(role);
    try {
      await api.post(`/admin/divisions/${encodeURIComponent(code)}/assignments`, { user_id: userId, role });
      toast.success('Assignment added');
      queryClient.invalidateQueries({ queryKey: ['admin', 'division', code] });
    } catch (err) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to add');
    } finally {
      setSavingAssign(null);
    }
  };

  const removeDivisionAssignment = async (userId, role) => {
    setSavingAssign(role);
    try {
      await api.delete(`/admin/divisions/${encodeURIComponent(code)}/assignments`, { data: { user_id: userId, role } });
      toast.success('Assignment removed');
      queryClient.invalidateQueries({ queryKey: ['admin', 'division', code] });
    } catch (err) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to remove');
    } finally {
      setSavingAssign(null);
    }
  };

  // Level comes from level_type, never from the code (CPI is a directorate
  // without a DIR_ prefix).
  const isDir = data?.level_type === ORG_LEVEL_TYPES.DIRECTORATE;
  const responsibleLabel = DR_LABEL[DR.HEAD_OF_DIVISION]; // "Responsible person" at every level

  const handleSaveName = async () => {
    const next = draftName.trim();
    if (!next || next === data.division_name) {
      setEditingName(false);
      return;
    }
    try {
      await api.patch(`/admin/divisions/${encodeURIComponent(code)}`, { division_name: next });
      toast.success('Renamed');
      setEditingName(false);
      queryClient.invalidateQueries({ queryKey: ['admin', 'division', code] });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to rename');
    }
  };

  const submitNewChild = async (payload) => {
    try {
      // A country office sends no code or name: the API generates them (D-20261028-01).
      const { data: created } = await api.post('/admin/divisions', { ...payload, parent_code: code });
      toast.success(`Created "${created?.division_name || payload.code}"`);
      setNewChildOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin', 'division', code] });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create'));
    }
  };

  const submitDelete = async () => {
    try {
      await api.delete(`/admin/divisions/${encodeURIComponent(code)}`);
      toast.success('Deleted');
      navigate('/reference/org');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete');
      setDeleteOpen(false);
    }
  };

  // Clear the legacy free-text `directorate` or `office` columns. Optimistic
  // so the badge disappears immediately. These columns are kept on the table
  // for backward-compat with old code paths but the user typically wants
  // them cleared once they've assigned a real parent_code + level_type.
  const submitClearLegacyField = async (field) => {
    const previous = data?.[field] ?? null;
    setData(d => (d ? { ...d, [field]: null } : d));
    try {
      await api.patch(`/admin/divisions/${encodeURIComponent(code)}`, { [field]: null });
      toast.success(`Cleared legacy ${field}`);
    } catch (err) {
      setData(d => (d ? { ...d, [field]: previous } : d));
      toast.error(err.response?.data?.error || `Failed to clear ${field}`);
    }
  };

  const submitSetLevelType = async (nextType) => {
    // Optimistic update — update the UI immediately so the select reflects
    // the new value without waiting for a refetch. Rollback on error.
    const previous = data?.level_type ?? null;
    const normalized = nextType || null;
    setData(d => (d ? { ...d, level_type: normalized } : d));
    try {
      await api.patch(`/admin/divisions/${encodeURIComponent(code)}`, { level_type: normalized });
      toast.success(normalized ? `Marked as ${normalized}` : 'Level cleared');
    } catch (err) {
      setData(d => (d ? { ...d, level_type: previous } : d));
      toast.error(err.response?.data?.error || 'Failed to set level');
    }
  };

  // Country office of one AU member state, or none (D-20261026-05).
  const submitCountryOffice = async (patch) => {
    const previous = { is_country_office: data?.is_country_office, country_code: data?.country_code };
    setData(d => (d ? { ...d, ...patch } : d));
    try {
      await api.patch(`/admin/divisions/${encodeURIComponent(code)}`, patch);
      toast.success(patch.is_country_office ? 'Marked as country office' : 'No longer a country office');
    } catch (err) {
      setData(d => (d ? { ...d, ...previous } : d));
      toast.error(getErrorMessage(err, 'Failed to update the country office'));
    }
  };

  const submitSetAlias = async (targetCode) => {
    try {
      await api.patch(`/admin/divisions/${encodeURIComponent(code)}`, { alias_of: targetCode });
      toast.success(`Marked as alias of ${targetCode}`);
      setAliasPickerOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin', 'division', code] });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to mark as alias');
    }
  };

  const submitUnalias = async () => {
    try {
      await api.patch(`/admin/divisions/${encodeURIComponent(code)}`, { alias_of: null });
      toast.success('Removed alias relationship');
      queryClient.invalidateQueries({ queryKey: ['admin', 'division', code] });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove alias');
    }
  };

  const openDelete = () => {
    if ((data?.users?.length || 0) > 0) {
      toast.error('Cannot delete: this division has users assigned');
      return;
    }
    if ((data?.children?.length || 0) > 0) {
      toast.error('Cannot delete: this division has children. Move them first.');
      return;
    }
    setDeleteOpen(true);
  };

  if (loading) return (
    <DashboardLayout breadcrumbs={[{ label: 'Reference' }, { label: 'Org Structure', to: '/reference/org' }, { label: code }]}>
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" />
      </div>
    </DashboardLayout>
  );

  if (!data) return (
    <DashboardLayout breadcrumbs={[{ label: 'Reference' }, { label: 'Org Structure', to: '/reference/org' }, { label: code }]}>
      <div className="px-6 py-10 text-center text-[12px] text-gray-500">
        Division <span className="font-mono">{code}</span> not found.{' '}
        <Link to="/reference/org" className="text-[#1A5632] underline">Back to org structure</Link>
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout
      breadcrumbs={[
        { label: 'Reference' },
        { label: 'Org Structure', to: '/reference/org' },
        { label: data.code },
      ]}
    >
      <div className="space-y-0">
        {/* Header */}
        <div className="bg-[#1A5632] text-white">
          <div className="px-6 py-5">
            <Link to="/reference/org" className="inline-flex items-center gap-1 text-[10px] text-white/70 hover:text-white mb-2">
              <ArrowLeft className="w-3 h-3" />
              Back to org chart
            </Link>
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 ${isDir ? 'bg-white text-[#1A5632]' : 'bg-white/15 text-white border border-white/30'}`}>
                {data.code}
              </span>
              {canEdit ? (
                <select
                  value={data.level_type || ''}
                  onChange={e => submitSetLevelType(e.target.value)}
                  className="text-[10px] font-bold bg-white/10 text-white border border-white/30 px-1.5 py-0.5 outline-none hover:bg-white/20 cursor-pointer"
                  title="Organisational level"
                >
                  <option value="" className="text-gray-800">— Unclassified —</option>
                  <option value="directorate" className="text-gray-800">Directorate</option>
                  <option value="division" className="text-gray-800">Division</option>
                  <option value="unit" className="text-gray-800">Unit</option>
                </select>
              ) : data.level_type && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-white/15 border border-white/30">
                  {LEVEL_STYLES[data.level_type]?.label || data.level_type.toUpperCase()}
                </span>
              )}
              {canEdit
                ? <CountryOfficePicker unit={data} onChange={submitCountryOffice} />
                : <CountryOfficeBadge unit={data} onDark />}
              {editingName ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={draftName}
                    onChange={e => setDraftName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                    className="text-[20px] font-semibold bg-white/10 text-white border border-white/30 px-2 py-0.5 outline-none focus:bg-white/20"
                  />
                  <button onClick={handleSaveName} className="p-1 text-white/80 hover:text-white" title="Save">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setEditingName(false); setDraftName(data.division_name); }} className="p-1 text-white/80 hover:text-white" title="Cancel">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-[20px] font-semibold">{data.division_name}</h1>
                  {canEdit && (
                    <button onClick={() => setEditingName(true)} className="p-1 text-white/60 hover:text-white" title="Rename">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Ancestors path */}
            {data.ancestors.length > 0 && (
              <div className="mt-3 flex items-center gap-1 text-[11px] text-white/70 flex-wrap">
                {data.ancestors.map((a, i) => (
                  <React.Fragment key={a.code}>
                    {i > 0 && <ChevronRight className="w-3 h-3 text-white/40" />}
                    <Link to={`/reference/org/${encodeURIComponent(a.code)}`} className="hover:text-white underline-offset-2 hover:underline">
                      {a.division_name}
                    </Link>
                  </React.Fragment>
                ))}
                <ChevronRight className="w-3 h-3 text-white/40" />
                <span className="text-white font-medium">{data.division_name}</span>
              </div>
            )}
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex items-center gap-6 text-[12px] text-white/70">
            <span><strong className="text-white">{data.users.length}</strong> Users assigned</span>
            <span><strong className="text-white">{data.children.length}</strong> Sub-divisions</span>
            {(data.aliases || []).length > 0 && (
              <span><strong className="text-white">{data.aliases.length}</strong> Known aliases</span>
            )}
            {data.directorate && (
              <span className="inline-flex items-center gap-1">
                <strong className="text-white">{data.directorate}</strong>
                <span className="text-white/60">(legacy directorate)</span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => submitClearLegacyField(ORG_LEVEL_TYPES.DIRECTORATE)}
                    className="ml-1 text-white/50 hover:text-white"
                    title="Clear legacy directorate"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            )}
            {data.office && (
              <span className="inline-flex items-center gap-1">
                <strong className="text-white">{data.office}</strong>
                <span className="text-white/60">(office)</span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => submitClearLegacyField(ORG_LEVEL_TYPES.OFFICE)}
                    className="ml-1 text-white/50 hover:text-white"
                    title="Clear office"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Alias banners */}
        {data.canonical && (
          <div className="bg-amber-50 border border-amber-200 border-t-0 px-5 py-2 flex items-center gap-2 text-[11px] text-amber-800">
            <span className="font-semibold">⚠ Alias</span>
            This division is an alias of{' '}
            <Link
              to={`/reference/org/${encodeURIComponent(data.canonical.code)}`}
              className="font-mono font-semibold hover:underline"
            >
              {data.canonical.code}
            </Link>{' '}
            — <span className="italic">{data.canonical.division_name}</span>.
            Legacy references still point here but the tree hides it by default.
          </div>
        )}
        {(data.aliases || []).length > 0 && (
          <div className="bg-amber-50/60 border border-amber-200 border-t-0 px-5 py-2 text-[11px] text-amber-800 flex items-center gap-2 flex-wrap">
            <span className="font-semibold">Known aliases of this division:</span>
            {data.aliases.map(a => (
              <Link
                key={a.code}
                to={`/reference/org/${encodeURIComponent(a.code)}`}
                className="font-mono font-semibold bg-white/60 px-1.5 py-0.5 border border-amber-200 hover:bg-white"
                title={a.division_name}
              >
                {a.code}
              </Link>
            ))}
          </div>
        )}

        {/* Action bar (system admin only) */}
        {canEdit && (
          <div className="bg-white border border-gray-200 border-t-0 px-5 py-2 flex items-center gap-2">
            <button
              onClick={() => setNewChildOpen(true)}
              className="text-[11px] px-3 py-1.5 bg-[#1A5632] text-white hover:bg-[#14442A] flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add sub-division
            </button>
            {data.canonical ? (
              <button
                onClick={submitUnalias}
                className="text-[11px] px-3 py-1.5 border border-amber-300 text-amber-700 hover:bg-amber-50 flex items-center gap-1.5"
                title={`Unlink from ${data.canonical.code}`}
              >
                <Link2Off className="w-3.5 h-3.5" />
                Remove alias
              </button>
            ) : (data.aliases || []).length > 0 ? (
              <span className="text-[10px] text-gray-400 italic flex items-center gap-1 px-2">
                <Link2 className="w-3 h-3" />
                Canonical for {data.aliases.length} alias{data.aliases.length > 1 ? 'es' : ''} — cannot be aliased
              </span>
            ) : (
              <button
                onClick={() => setAliasPickerOpen(true)}
                className="text-[11px] px-3 py-1.5 border border-amber-300 text-amber-700 hover:bg-amber-50 flex items-center gap-1.5"
                title="Mark this division as an alias of another canonical row"
              >
                <Link2 className="w-3.5 h-3.5" />
                Mark as alias of…
              </button>
            )}
            <button
              onClick={openDelete}
              disabled={data.users.length > 0 || data.children.length > 0}
              className="text-[11px] px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              title={data.users.length > 0 ? 'Has users — cannot delete' : data.children.length > 0 ? 'Has sub-divisions — move them first' : 'Delete this division'}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
            <span className="text-[10px] text-gray-400 ml-2">
              💡 To re-parent this division, use the <Link to="/reference/org" className="underline">org tree page</Link>'s Move button.
            </span>
          </div>
        )}

        {/* Focal + responsible + M&E assignment (visible to everyone, editable for system admin) */}
        <div className="bg-white border border-gray-200 border-t-0 px-5 py-3 grid grid-cols-1 md:grid-cols-3 gap-4">
          <AssignmentSlot
            label="Focal person"
            help="Submits new specific activities for this division and gets the rejection feedback."
            icon={<UserCheck className="w-3.5 h-3.5 text-[#1A5632]" />}
            assignedUsers={usersByDivRole[DR.FOCAL_PERSON]}
            allUsers={allUsers}
            saving={savingAssign === DR.FOCAL_PERSON}
            canEdit={canEdit}
            onAdd={(uid) => addDivisionAssignment(uid, DR.FOCAL_PERSON)}
            onRemove={(uid) => removeDivisionAssignment(uid, DR.FOCAL_PERSON)}
          />
          <SingleAssignmentSlot
            label={`${responsibleLabel} (approver)`}
            help={isDir
              ? 'Approves what the directorate submits and what its divisions escalate when they have no head. Only one per directorate.'
              : 'Approves or rejects activities submitted by the focal person of this division. Only one per division.'}
            icon={<ShieldCheck className="w-3.5 h-3.5 text-[#B45309]" />}
            // The pointer (responsible_user_id) is what approvals read.
            currentUser={data.responsible_user || null}
            inherited={data.inherited_responsible || null}
            allUsers={allUsers}
            saving={savingAssign === 'responsible'}
            canEdit={canEdit}
            // The server picks DIRECTOR or HEAD_OF_DIVISION from the division's
            // level and demotes the previous holder (divisionAssignmentService).
            onChange={(uid) => submitSetAssignment('responsible_user_id', uid)}
          />
          <AssignmentSlot
            label="M&E officer"
            help="Read-only access to this division's broad and specific activities, indicator reports. Cannot create, edit or access the global reports hub."
            icon={<Eye className="w-3.5 h-3.5 text-[#2563EB]" />}
            assignedUsers={usersByDivRole[DR.ME_OFFICER]}
            allUsers={allUsers}
            saving={savingAssign === DR.ME_OFFICER}
            canEdit={canEdit}
            onAdd={(uid) => addDivisionAssignment(uid, DR.ME_OFFICER)}
            onRemove={(uid) => removeDivisionAssignment(uid, DR.ME_OFFICER)}
          />
          {/* Reporting team — the Head of Division adds staff who may report
              on this division's activities (user_divisions MEMBER). */}
          {canManageTeam && (
            <AssignmentSlot
              label="Team members (reporting)"
              help="Staff added here can report on this division's activities. The Head of Division manages this list."
              icon={<Users className="w-3.5 h-3.5 text-[#1A5632]" />}
              assignedUsers={memberOnly}
              allUsers={allUsers}
              saving={savingTeam}
              canEdit={canManageTeam}
              onAdd={handleAddTeamMember}
              onRemove={handleRemoveTeamMember}
            />
          )}
        </div>

        {/* Two columns: children + users */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
          {/* Children */}
          <div className="bg-white border border-gray-200 border-t-0 lg:border-r-0">
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-[#1A5632]" />
              <h3 className="text-[12px] font-semibold text-gray-800">Sub-divisions ({data.children.length})</h3>
            </div>
            {data.children.length === 0 ? (
              <div className="px-5 py-8 text-center text-[11px] text-gray-400">No sub-divisions.</div>
            ) : (
              <div>
                {data.children.map(c => (
                  <Link
                    key={c.code}
                    to={`/reference/org/${encodeURIComponent(c.code)}`}
                    className="flex items-center gap-2 px-5 py-2 border-b border-gray-100 hover:bg-gray-50"
                  >
                    <Folder className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-[10px] font-mono font-semibold text-gray-400 w-[70px] flex-shrink-0">{c.code}</span>
                    <LevelBadge type={c.level_type} small />
                    <span className="text-[12px] text-gray-800 flex-1 truncate">{c.division_name}</span>
                    {c.user_count > 0 && (
                      <span className="text-[10px] font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 inline-flex items-center gap-1 flex-shrink-0">
                        <Users className="w-3 h-3" />
                        {c.user_count}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Users */}
          <div className="bg-white border border-gray-200 border-t-0">
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <h3 className="text-[12px] font-semibold text-gray-800">Users in this division ({data.users.length})</h3>
            </div>
            {data.users.length === 0 ? (
              <div className="px-5 py-8 text-center text-[11px] text-gray-400">No users assigned.</div>
            ) : (
              <div>
                {data.users.map(u => (
                  <div key={u.id} className="flex items-center gap-2 px-5 py-2 border-b border-gray-100 hover:bg-gray-50">
                    <div className="w-7 h-7 bg-[#1A5632] flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-semibold text-white">
                        {fmtName(u).split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-gray-900 truncate">{fmtName(u)}</div>
                      <div className="text-[10px] text-gray-500 truncate">{u.email}</div>
                    </div>
                    <div className="flex flex-wrap gap-1 flex-shrink-0">
                      {(u.roles || []).map(r => (
                        <span key={r.code} className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-600 font-medium">
                          {r.code}
                        </span>
                      ))}
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 font-medium flex-shrink-0 ${u.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {u.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <AliasPickerModal
        open={aliasPickerOpen}
        currentNode={data}
        onClose={() => setAliasPickerOpen(false)}
        onSave={submitSetAlias}
      />
      <NewDivisionModal
        open={newChildOpen}
        parentNode={data}
        onClose={() => setNewChildOpen(false)}
        onSave={submitNewChild}
      />
      <ConfirmModal
        open={deleteOpen}
        danger
        title="Delete division"
        message={
          <>
            Are you sure you want to delete{' '}
            <strong className="text-gray-900">{data.division_name}</strong>{' '}
            <span className="font-mono text-[10px] text-gray-500">({data.code})</span> ?
            <br />
            This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        onClose={() => setDeleteOpen(false)}
        onConfirm={submitDelete}
      />
    </DashboardLayout>
  );
}
