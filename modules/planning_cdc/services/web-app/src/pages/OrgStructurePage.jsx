/* eslint-disable max-lines, complexity, no-restricted-syntax --
 * Legacy file with baseline debt from the pre-guardrails era (809 lines, TreeRow
 * and OrgStructurePage branch per row action, level_type option values and
 * 'focal' chip literals). Scheduled refactor: task #38 with OrgDivisionDetail.
 * Do NOT add new violations; this pragma is a ceiling.
 */
// Africa CDC organigramme — simple expandable tree (file-explorer style).
//
// Read: any admin (ROLE_GROUPS.ADMINS).
// Write: SYSTEM_ADMIN ONLY (UI hides buttons; backend re-checks).
//
// No canvas, no drag-and-drop. Just a nested list with ▶/▼ to expand/collapse,
// and per-row actions: rename, add child, delete, "Move to..." (parent picker).
// "Move to..." opens an inline dropdown listing every legal parent (any node
// that is NOT a descendant of the row being moved + an "(top level)" option).

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, Plus, Lock, Pencil, Trash2, ChevronRight, ChevronDown, Move, Users, Search, X, Square, CheckSquare, UserCheck, ShieldCheck,
} from 'lucide-react';
import api from '@/services/api';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';
import { RenameModal, NewDivisionModal, ConfirmModal, LevelBadge } from './org/OrgModals';
import { CountryOfficeBadge } from './org/CountryOffice';
import { getErrorMessage } from '@/utils/errorMessage';
import { ORG_LEVEL_TYPES } from '@rbm/lib/enums';
import { DIVISION_ASSIGNMENT_ROLES as DR, DIVISION_ASSIGNMENT_ROLE_LABELS as DR_LABEL } from '@rbm/lib/user-divisions';

// Build parent → children index
function indexByParent(rows) {
  const out = new Map();
  rows.forEach(r => {
    const k = r.parent_code || '__ROOT__';
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(r);
  });
  out.forEach(list => list.sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return String(a.division_name || '').localeCompare(String(b.division_name || ''));
  }));
  return out;
}

// Walk down from `code` and collect every descendant code (for cycle
// protection). Takes the flat rows array directly so MovePicker doesn't
// need byParent plumbed through TreeBranch's rowProps spread.
function getDescendants(allRows, code) {
  const byParent = new Map();
  allRows.forEach(r => {
    if (!r.parent_code) return;
    if (!byParent.has(r.parent_code)) byParent.set(r.parent_code, []);
    byParent.get(r.parent_code).push(r);
  });
  const out = new Set();
  const stack = [code];
  while (stack.length) {
    const cur = stack.pop();
    for (const child of byParent.get(cur) || []) {
      if (!out.has(child.code)) {
        out.add(child.code);
        stack.push(child.code);
      }
    }
  }
  return out;
}

// ── Move-to modal ──
// Full-screen overlay so the picker can't bleed into other row buttons
// (the previous absolute-positioned dropdown was leaking clicks to the
// trash icon underneath). Click outside or Escape to close.
function MovePicker({ node, allRows, onClose, onSave }) {
  const [search, setSearch] = useState('');
  const banned = useMemo(() => getDescendants(allRows, node.code), [allRows, node.code]);

  // Esc to close
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const options = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allRows
      .filter(r => r.code !== node.code && !banned.has(r.code))
      .filter(r => !q || r.code.toLowerCase().includes(q) || (r.division_name || '').toLowerCase().includes(q))
      .sort((a, b) => String(a.division_name || '').localeCompare(String(b.division_name || '')));
  }, [allRows, banned, node.code, search]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-gray-200 w-full max-w-[640px] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-[#1A5632] text-white">
          <h2 className="text-[13px] font-semibold">
            Move "{node.code}" under…
          </h2>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="text-white/70 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 text-[11px] text-gray-700">
          Currently <span className="font-mono font-semibold text-gray-900">{node.code}</span>{' '}
          <span className="text-gray-500">— {node.division_name}</span>
          {node.parent_code && (
            <span className="ml-2 text-gray-400">(currently under <span className="font-mono">{node.parent_code}</span>)</span>
          )}
        </div>

        <div className="p-3 border-b border-gray-100">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search parent..."
              className="w-full text-[12px] border border-gray-200 pl-8 pr-3 py-1.5 outline-none focus:border-[#1A5632]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <button
            type="button"
            onClick={() => onSave(null)}
            className="w-full text-left px-5 py-3 text-[12px] hover:bg-gray-50 border-b border-gray-100 italic text-gray-600 font-medium"
          >
            ↑ Top level (no parent)
          </button>
          {options.map(opt => (
            <button
              key={opt.code}
              type="button"
              onClick={() => onSave(opt.code)}
              className="w-full text-left px-5 py-2 text-[12px] hover:bg-gray-50 border-b border-gray-50 last:border-b-0 flex items-center gap-3"
            >
              <span className="font-mono text-[10px] font-semibold text-gray-400 w-[80px] flex-shrink-0">{opt.code}</span>
              <span className="text-gray-800 flex-1 truncate">{opt.division_name}</span>
            </button>
          ))}
          {options.length === 0 && (
            <div className="px-5 py-10 text-[11px] text-gray-400 text-center">No matching parent</div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Short display name for a user (e.g. "Paidamoyo M.")
function shortName(u) {
  if (!u) return '';
  const first = u.first_name || (u.full_name || '').split(' ')[0] || '';
  const lastInitial = u.last_name ? u.last_name[0] : ((u.full_name || '').split(' ')[1] || '').slice(0, 1);
  return lastInitial ? `${first} ${lastInitial}.` : first;
}

// Small chip shown on a row when the division has an assigned focal or
// responsible person. Shows initials + short name inline, full name in
// tooltip. The responsible reads "Responsible person" at every level.
function AssigneeChip({ type, user, more = 0 }) {
  if (!user) return null;
  const Icon = type === 'focal' ? UserCheck : ShieldCheck;
  const color = type === 'focal'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-amber-50 text-amber-800 border-amber-200';
  const label = DR_LABEL[type === 'focal' ? DR.FOCAL_PERSON : DR.HEAD_OF_DIVISION];
  return (
    <span
      className={`text-[9px] font-medium px-1.5 py-0.5 inline-flex items-center gap-1 border ${color} flex-shrink-0 max-w-[140px]`}
      title={`${label}: ${user.full_name || shortName(user)} <${user.email || ''}>`}
    >
      <Icon className="w-2.5 h-2.5 flex-shrink-0" />
      <span className="truncate">{shortName(user)}</span>
      {more > 0 && <span className="flex-shrink-0">+{more}</span>}
    </span>
  );
}

// ── Single row ──
function TreeRow({ node, depth, expanded, onToggle, hasChildren, canEdit, onEdit, onAddChild, onDelete, onMove, allRows, selected, onToggleSelect, usersById }) {
  const [picking, setPicking] = useState(false);
  const isDir = node.level_type === ORG_LEVEL_TYPES.DIRECTORATE;

  return (
    <div className={`border-b border-gray-100 hover:bg-gray-50/60 relative ${selected ? 'bg-[#1A5632]/10' : 'bg-white'}`}>
      <div
        className="flex items-center gap-2 px-3 py-1.5"
        style={{ paddingLeft: 12 + depth * 22 }}
      >
        {canEdit && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleSelect(node.code); }}
            className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-[#1A5632] flex-shrink-0"
            title={selected ? 'Deselect' : 'Select'}
          >
            {selected
              ? <CheckSquare className="w-3.5 h-3.5 text-[#1A5632]" />
              : <Square className="w-3.5 h-3.5" />}
          </button>
        )}
        <button
          type="button"
          onClick={onToggle}
          className={`w-4 h-4 flex items-center justify-center text-gray-400 hover:text-[#1A5632] flex-shrink-0 ${hasChildren ? '' : 'invisible'}`}
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        <Link
          to={`/reference/org/${encodeURIComponent(node.code)}`}
          className={`text-[10px] font-mono font-semibold flex-shrink-0 px-1.5 py-0.5 hover:underline ${isDir ? 'bg-[#1A5632]/10 text-[#1A5632]' : 'text-gray-400'}`}
        >
          {node.code}
        </Link>
        <LevelBadge type={node.level_type} />
        <CountryOfficeBadge unit={node} />

        <Link
          to={`/reference/org/${encodeURIComponent(node.code)}`}
          className={`text-[12px] flex-1 truncate hover:text-[#1A5632] hover:underline ${isDir ? 'font-bold text-gray-900' : 'text-gray-700'} ${node.alias_of ? 'italic text-gray-500' : ''}`}
        >
          {node.division_name}
          {node.alias_of && (
            <span className="ml-2 text-[9px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 not-italic">
              alias → {node.alias_of}
            </span>
          )}
        </Link>

        {/* Focal + responsible chips — resolved from usersById map so the
            tree request stays a single round-trip without the join. Focal
            persons are a team: the first one, then « +N » (D-20261106-09). */}
        <AssigneeChip type="focal" user={usersById?.get(node.focal_user_ids?.[0])} more={(node.focal_user_ids?.length || 1) - 1} />
        <AssigneeChip type="responsible" user={usersById?.get(node.responsible_user_id)} />

        {(node.user_count || 0) > 0 && (
          <span className="text-[10px] font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 inline-flex items-center gap-1 flex-shrink-0">
            <Users className="w-3 h-3" />
            {node.user_count}
          </span>
        )}

        {canEdit && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button type="button" onClick={(e) => { e.stopPropagation(); onAddChild(node); }} title="Add child" className="p-1 text-gray-400 hover:text-[#1A5632]">
              <Plus className="w-3 h-3" />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(node); }} title="Rename" className="p-1 text-gray-400 hover:text-[#1A5632]">
              <Pencil className="w-3 h-3" />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); setPicking(p => !p); }} title="Move to..." className="p-1 text-gray-400 hover:text-[#1A5632]">
              <Move className="w-3 h-3" />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(node); }} title="Delete" className="p-1 text-gray-400 hover:text-red-600">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {picking && (
        <MovePicker
          node={node}
          allRows={allRows}
          onClose={() => setPicking(false)}
          onSave={(newParent) => {
            setPicking(false);
            onMove(node, newParent);
          }}
        />
      )}
    </div>
  );
}

// ── Recursive tree renderer ──
function TreeBranch({ parentCode, depth, byParent, expanded, selectedCodes, ...rowProps }) {
  const children = byParent.get(parentCode || '__ROOT__') || [];
  return (
    <>
      {children.map(child => {
        const childList = byParent.get(child.code) || [];
        const isExpanded = expanded.has(child.code);
        return (
          <React.Fragment key={child.code}>
            <TreeRow
              node={child}
              depth={depth}
              expanded={isExpanded}
              hasChildren={childList.length > 0}
              onToggle={() => rowProps.onToggle(child.code)}
              selected={selectedCodes.has(child.code)}
              {...rowProps}
            />
            {isExpanded && (
              <TreeBranch
                parentCode={child.code}
                depth={depth + 1}
                byParent={byParent}
                expanded={expanded}
                selectedCodes={selectedCodes}
                {...rowProps}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

/**
 * Page that renders the full Africa CDC organisation structure as a tree of
 * divisions and units. Org editors can add, rename and reassign nodes inline.
 *
 * @returns {JSX.Element}
 */
// ── Page ──
export default function OrgStructurePage() {
  const { can } = usePermissions();
  const canEdit = can('org_structure', 'update');

  const [search, setSearch] = useState('');
  const [showAliases, setShowAliases] = useState(false);

  const queryClient = useQueryClient();
  const { data: treeData, isLoading: loading } = useQuery({
    queryKey: ['admin', 'divisions-tree', showAliases],
    queryFn: async () => {
      const [treeRes, usersRes] = await Promise.all([
        api.get('/admin/divisions/tree', { params: { includeAliases: showAliases } }),
        api.get('/admin/users', { params: { limit: 1000 } }).catch(() => ({ data: [] })),
      ]);
      const list = Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data?.data || usersRes.data?.users || []);
      return {
        rows: treeRes.data || [],
        usersById: new Map(list.map(u => [u.id, u])),
      };
    },
    staleTime: 60_000,
  });
  const rows = useMemo(() => treeData?.rows || [], [treeData]);
  const usersById = useMemo(() => treeData?.usersById || new Map(), [treeData]);
  // Default: every top-level row and every directorate is expanded so the user lands on a
  // populated tree on first paint, not 25 collapsed buttons.
  const [expanded, setExpanded] = useState(() => new Set());

  // Modal state — kept in the page so modals can be opened from any row
  // via the injected handlers on TreeRow.
  const [renameModal, setRenameModal] = useState({ open: false, node: null });
  const [newChildModal, setNewChildModal] = useState({ open: false, parent: null });
  const [deleteModal, setDeleteModal] = useState({ open: false, node: null });

  // Bulk selection — set of selected division codes. Edit actions (level,
  // move, delete) operate on every row in this set when populated.
  const [selected, setSelected] = useState(() => new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const toggleSelect = (code) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  useEffect(() => {
    if (!rows.length) return;
    setExpanded(prev => {
      if (prev.size > 0) return prev;
      const next = new Set();
      rows.forEach(row => {
        if (!row.parent_code || row.level_type === ORG_LEVEL_TYPES.DIRECTORATE) next.add(row.code);
      });
      return next;
    });
  }, [rows]);

  const byParent = useMemo(() => indexByParent(rows), [rows]);

  // Filter — when searching, force-expand every ancestor of every match so
  // the matched rows are visible in context.
  const visibleByParent = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return byParent;
    const matched = new Set(rows
      .filter(r => r.code.toLowerCase().includes(q) || (r.division_name || '').toLowerCase().includes(q))
      .map(r => r.code));
    if (matched.size === 0) return new Map();
    // Walk up to add ancestors
    const keep = new Set(matched);
    matched.forEach(code => {
      let cur = code;
      while (cur) {
        const row = rows.find(r => r.code === cur);
        if (!row || !row.parent_code) break;
        keep.add(row.parent_code);
        cur = row.parent_code;
      }
    });
    const filtered = new Map();
    keep.forEach(c => {
      const row = rows.find(r => r.code === c);
      const k = row?.parent_code || '__ROOT__';
      if (!filtered.has(k)) filtered.set(k, []);
      filtered.get(k).push(row);
    });
    filtered.forEach(list => list.sort((a, b) => String(a.division_name || '').localeCompare(String(b.division_name || ''))));
    return filtered;
  }, [byParent, rows, search]);

  // While searching, expand everything that survived the filter
  const effectiveExpanded = useMemo(() => {
    if (!search.trim()) return expanded;
    const all = new Set();
    visibleByParent.forEach((_v, k) => k !== '__ROOT__' && all.add(k));
    return all;
  }, [search, visibleByParent, expanded]);

  const handleToggle = (code) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  // ── Row actions — open the matching modal; the actual API call happens
  // in the modal's onSave/onConfirm callback below. ──
  const handleEdit      = (node)   => setRenameModal({ open: true, node });
  const handleAddChild  = (parent) => setNewChildModal({ open: true, parent });
  const handleDelete    = (node)   => {
    if ((node.user_count || 0) > 0) {
      toast.error('Cannot delete: this division has users assigned');
      return;
    }
    setDeleteModal({ open: true, node });
  };

  // ── Actual API calls wired to the modals ──
  const submitRename = async (newName) => {
    const node = renameModal.node;
    if (!node || newName === node.division_name) {
      setRenameModal({ open: false, node: null });
      return;
    }
    try {
      await api.patch(`/admin/divisions/${encodeURIComponent(node.code)}`, { division_name: newName });
      toast.success('Renamed');
      setRenameModal({ open: false, node: null });
      queryClient.invalidateQueries({ queryKey: ['admin', 'divisions-tree'] });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to rename');
    }
  };

  const submitNewChild = async (payload) => {
    const parent = newChildModal.parent;
    try {
      // A country office sends no code or name: the API generates them (D-20261028-01).
      const { data: created } = await api.post('/admin/divisions', {
        ...payload,
        parent_code: parent ? parent.code : null,
      });
      toast.success(`Created "${created?.division_name || payload.code}"`);
      if (parent) setExpanded(prev => new Set(prev).add(parent.code));
      setNewChildModal({ open: false, parent: null });
      queryClient.invalidateQueries({ queryKey: ['admin', 'divisions-tree'] });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create'));
    }
  };

  const submitDelete = async () => {
    const node = deleteModal.node;
    if (!node) return;
    try {
      await api.delete(`/admin/divisions/${encodeURIComponent(node.code)}`);
      toast.success(`Deleted "${node.code}"`);
      setDeleteModal({ open: false, node: null });
      queryClient.invalidateQueries({ queryKey: ['admin', 'divisions-tree'] });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete');
      setDeleteModal({ open: false, node: null });
    }
  };

  // ── Bulk actions ─────────────────────────────────────────────
  // Each call PATCHes / DELETEs the rows in parallel and aggregates the
  // success/failure counts into a single toast so the user gets one
  // message per bulk action instead of N.
  const runBulk = async (label, fn) => {
    const codes = Array.from(selected);
    if (codes.length === 0) return;
    const results = await Promise.allSettled(codes.map(c => fn(c)));
    const ok = results.filter(r => r.status === 'fulfilled').length;
    const failed = codes.length - ok;
    if (ok && !failed) toast.success(`${label}: ${ok} division${ok > 1 ? 's' : ''}`);
    else if (ok && failed) toast(`${label}: ${ok} ok, ${failed} failed`);
    else toast.error(`${label}: all ${failed} failed`);
    clearSelection();
    queryClient.invalidateQueries({ queryKey: ['admin', 'divisions-tree'] });
  };

  const bulkSetLevel = (level) => runBulk(
    level ? `Marked as ${level}` : 'Cleared level',
    (code) => api.patch(`/admin/divisions/${encodeURIComponent(code)}`, { level_type: level || null })
  );

  const bulkMove = (newParent) => {
    setBulkMoveOpen(false);
    runBulk(
      newParent ? `Moved under ${newParent}` : 'Moved to top level',
      (code) => api.patch(`/admin/divisions/${encodeURIComponent(code)}`, { parent_code: newParent })
    );
  };

  const bulkDelete = () => {
    setBulkDeleteOpen(false);
    runBulk('Deleted', (code) => api.delete(`/admin/divisions/${encodeURIComponent(code)}`));
  };

  const handleMove = async (node, newParentCode) => {
    if (node.parent_code === newParentCode) return;
    try {
      await api.patch(`/admin/divisions/${node.code}`, { parent_code: newParentCode });
      toast.success(newParentCode ? `Moved under ${newParentCode}` : 'Moved to top level');
      // Auto-expand the new parent so the moved row stays visible
      if (newParentCode) setExpanded(prev => new Set(prev).add(newParentCode));
      queryClient.invalidateQueries({ queryKey: ['admin', 'divisions-tree'] });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Move failed');
    }
  };

  if (loading) return (
    <DashboardLayout breadcrumbs={[{ label: 'Reference' }, { label: 'Org Structure' }]}>
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" />
      </div>
    </DashboardLayout>
  );

  const totalUsers = rows.reduce((s, r) => s + (r.user_count || 0), 0);
  const populated = rows.filter(r => r.user_count > 0).length;
  const directorates = rows.filter(r => !r.parent_code && !r.alias_of).length;
  const aliasCount = rows.filter(r => r.alias_of).length;

  const expandAll = () => setExpanded(new Set(rows.map(r => r.code)));
  const collapseAll = () => setExpanded(new Set());

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Reference' }, { label: 'Org Structure' }]}>
      <div className="space-y-0">
        <div className="bg-[#1A5632] text-white">
          <div className="px-6 py-5">
            <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">Organigramme</span>
            <h1 className="text-[20px] font-semibold mt-2">Africa CDC — Division Hierarchy</h1>
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex flex-wrap items-center gap-6 text-[12px] text-white/70">
            <span><strong className="text-white">{rows.length - aliasCount}</strong> Divisions</span>
            <span><strong className="text-white">{directorates}</strong> Top-level</span>
            <span><strong className="text-white">{populated}</strong> With users</span>
            <span><strong className="text-white">{totalUsers}</strong> Total assignments</span>
            {showAliases && aliasCount > 0 && (
              <span className="text-amber-200"><strong className="text-amber-100">{aliasCount}</strong> Aliases shown</span>
            )}
          </div>
        </div>

        {!canEdit && (
          <div className="bg-amber-50 border border-amber-200 border-t-0 px-5 py-2 flex items-center gap-2 text-[11px] text-amber-800">
            <Lock className="w-3.5 h-3.5" />
            Read-only — only the System Administrator can change the hierarchy.
          </div>
        )}

        <div className="bg-white border border-gray-200 border-t-0 px-5 py-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 max-w-[300px]">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search divisions..."
              className="w-full text-[12px] border border-gray-200 pl-8 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1A5632]"
            />
          </div>
          <button onClick={expandAll} className="text-[10px] px-2 py-1 border border-gray-300 text-gray-600 hover:bg-gray-50">Expand all</button>
          <button onClick={collapseAll} className="text-[10px] px-2 py-1 border border-gray-300 text-gray-600 hover:bg-gray-50">Collapse all</button>
          {canEdit && (
            <button
              onClick={() => setSelected(new Set(rows.map(r => r.code)))}
              className="text-[10px] px-2 py-1 border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              Select all
            </button>
          )}
          <label className="text-[10px] text-gray-600 flex items-center gap-1.5 cursor-pointer ml-2">
            <input
              type="checkbox"
              checked={showAliases}
              onChange={e => setShowAliases(e.target.checked)}
              className="w-3 h-3"
            />
            Show aliases
          </label>
          {canEdit && (
            <button
              onClick={() => handleAddChild(null)}
              className="ml-auto text-[11px] px-3 py-1.5 bg-[#1A5632] text-white hover:bg-[#14442A] flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              New top-level division
            </button>
          )}
        </div>

        {/* Legend — quick key for the icons and chips shown on each row. */}
        <div className="bg-gray-50 border border-gray-200 border-t-0 px-5 py-2 flex items-center gap-4 text-[10px] text-gray-600 flex-wrap">
          <span className="font-semibold text-gray-500 uppercase tracking-wide text-[9px]">Legend</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
              <UserCheck className="w-2.5 h-2.5" />
              Name
            </span>
            <span className="text-gray-500">Focal person — creates and submits specific activities</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200">
              <ShieldCheck className="w-2.5 h-2.5" />
              Name
            </span>
            <span className="text-gray-500">Responsible (approver) — approves / rejects submissions</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center text-[10px] font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 border border-blue-100">
              <Users className="w-3 h-3 mr-0.5" />
              N
            </span>
            <span className="text-gray-500">Users assigned to this division</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 bg-[#1A5632]/10 text-[#1A5632]">DIR</span>
            <span className="text-gray-500">Directorate (top-level)</span>
          </span>
        </div>

        {/* Bulk action bar — only visible when at least 1 row is selected */}
        {canEdit && selected.size > 0 && (
          <div className="bg-[#1A5632] text-white border-t border-[#14442A] px-5 py-2.5 flex items-center gap-3 sticky top-0 z-30 shadow-sm">
            <span className="text-[11px] font-semibold">
              {selected.size} selected
            </span>
            <span className="text-white/40">|</span>
            <span className="text-[10px] text-white/70">Set level:</span>
            <select
              value=""
              onChange={e => { if (e.target.value) bulkSetLevel(e.target.value === '__clear__' ? null : e.target.value); }}
              className="text-[11px] bg-white/10 text-white border border-white/30 px-2 py-1 outline-none hover:bg-white/20 cursor-pointer"
            >
              <option value="" className="text-gray-800">— Choose —</option>
              <option value="directorate" className="text-gray-800">Directorate</option>
              <option value="division" className="text-gray-800">Division</option>
              <option value="unit" className="text-gray-800">Unit</option>
              <option value="__clear__" className="text-gray-800">Clear (unclassified)</option>
            </select>
            <button
              onClick={() => setBulkMoveOpen(true)}
              className="text-[11px] px-3 py-1 bg-white/10 hover:bg-white/20 border border-white/30 flex items-center gap-1.5"
            >
              <Move className="w-3 h-3" />
              Move under…
            </button>
            <button
              onClick={() => setBulkDeleteOpen(true)}
              className="text-[11px] px-3 py-1 bg-red-600 hover:bg-red-700 border border-red-700 flex items-center gap-1.5"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
            <button
              onClick={clearSelection}
              className="ml-auto text-[10px] px-2 py-1 text-white/70 hover:text-white"
            >
              Clear selection
            </button>
          </div>
        )}

        <div className="bg-white border border-gray-200 border-t-0">
          {rows.length === 0 ? (
            <div className="px-5 py-10 text-center text-[12px] text-gray-400">No divisions.</div>
          ) : (
            <TreeBranch
              parentCode={null}
              depth={0}
              byParent={visibleByParent}
              expanded={effectiveExpanded}
              selectedCodes={selected}
              onToggleSelect={toggleSelect}
              onToggle={handleToggle}
              canEdit={canEdit}
              onEdit={handleEdit}
              onAddChild={handleAddChild}
              onDelete={handleDelete}
              onMove={handleMove}
              allRows={rows}
              usersById={usersById}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      <RenameModal
        open={renameModal.open}
        title={renameModal.node ? `Rename "${renameModal.node.code}"` : 'Rename'}
        label="New division name"
        defaultValue={renameModal.node?.division_name || ''}
        onClose={() => setRenameModal({ open: false, node: null })}
        onSave={submitRename}
      />
      <NewDivisionModal
        open={newChildModal.open}
        parentNode={newChildModal.parent}
        onClose={() => setNewChildModal({ open: false, parent: null })}
        onSave={submitNewChild}
      />
      <ConfirmModal
        open={deleteModal.open}
        danger
        title="Delete division"
        message={deleteModal.node ? (
          <>
            Are you sure you want to delete{' '}
            <strong className="text-gray-900">{deleteModal.node.division_name}</strong>{' '}
            <span className="font-mono text-[10px] text-gray-500">({deleteModal.node.code})</span> ?
            <br />
            This cannot be undone.
          </>
        ) : ''}
        confirmLabel="Delete"
        onClose={() => setDeleteModal({ open: false, node: null })}
        onConfirm={submitDelete}
      />

      {/* Bulk move picker — reuses MovePicker with the first selected code
          as the displayed "node" so the picker title and cycle protection
          stay correct, then bulkMove() PATCHes every selected row. */}
      {bulkMoveOpen && selected.size > 0 && (
        <MovePicker
          node={{
            code: `${selected.size} selected`,
            division_name: `${selected.size} divisions`,
            parent_code: null,
          }}
          allRows={rows.filter(r => !selected.has(r.code))}
          onClose={() => setBulkMoveOpen(false)}
          onSave={bulkMove}
        />
      )}

      <ConfirmModal
        open={bulkDeleteOpen}
        danger
        title={`Delete ${selected.size} division${selected.size > 1 ? 's' : ''}`}
        message={
          <>
            Are you sure you want to delete{' '}
            <strong className="text-gray-900">{selected.size}</strong> division{selected.size > 1 ? 's' : ''}?
            <br />
            <span className="text-[10px] text-gray-500 font-mono">
              {Array.from(selected).slice(0, 8).join(', ')}{selected.size > 8 ? `, +${selected.size - 8} more` : ''}
            </span>
            <br />
            This cannot be undone. Rows that still have users or children will be skipped.
          </>
        }
        confirmLabel={`Delete ${selected.size}`}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={bulkDelete}
      />
    </DashboardLayout>
  );
}
