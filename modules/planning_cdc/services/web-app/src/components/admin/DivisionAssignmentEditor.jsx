/**
 * DivisionAssignmentEditor — inline CRUD for user ↔ division assignments.
 *
 * Rendered inside the UserFormModal (edit mode only). Reads and writes
 * directly to /admin/users/:userId/divisions. Each mutation is immediate
 * (not batched on form submit) so the admin sees instant feedback.
 *
 * @param {{ userId: number, allDivisions: Array<{code:string,division_name:string}> }} props
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Star, Trash2, Plus } from 'lucide-react';
import api from '@/services/api';
import { toast } from 'sonner';
import DivisionAssignmentAddForm from './DivisionAssignmentAddForm';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import useResponsibleTakeover, { RESPONSIBLE_ROLES } from './useResponsibleTakeover';
import {
  DIVISION_ASSIGNMENT_ROLES as DR,
  DIVISION_ASSIGNMENT_ROLE_LIST,
  DIVISION_ASSIGNMENT_ROLE_LABELS,
} from '@rbm/lib/user-divisions';

// Every division role from packages/lib, MEMBER first. DIRECTOR and
// HEAD_OF_DIVISION are one "Responsible person" option: the server stores
// the right one for the division's level_type.
const ROLE_OPTIONS = [DR.MEMBER, ...DIVISION_ASSIGNMENT_ROLE_LIST.filter((r) => r !== DR.MEMBER && r !== DR.DIRECTOR)]
  .map((value) => ({ value, label: DIVISION_ASSIGNMENT_ROLE_LABELS[value] }));
const optionValue = (role) => (RESPONSIBLE_ROLES.has(role) ? DR.HEAD_OF_DIVISION : role);

/** Human message from an API error envelope, never the raw object. */
function errorMessage(err, fallback) {
  const msg = err?.response?.data?.message || err?.response?.data?.error;
  return typeof msg === 'string' && msg.trim() ? msg : fallback;
}

export default function DivisionAssignmentEditor({ userId, allDivisions }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [addMode, setAddMode] = useState(false);
  const [newCode, setNewCode] = useState(null);
  const [newRole, setNewRole] = useState(DR.MEMBER);
  const { guard, dialogProps } = useResponsibleTakeover(userId);

  const load = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    api
      .get(`/admin/users/${userId}/divisions`)
      .then((res) => setRows(res.data || []))
      .catch(() => toast.error('Failed to load division assignments'))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const assignedCodes = new Set(rows.map((r) => `${r.division_code}:${optionValue(r.role)}`));
  const divOptions = (allDivisions || []).map((d) => ({
    value: d.code,
    label: `${d.code} \u2014 ${d.division_name || ''}`,
    sub: d.level_type || '',
  }));

  const handleAdd = () => {
    if (!newCode) { toast.error('Select a division'); return; }
    const key = `${newCode}:${newRole}`;
    if (assignedCodes.has(key)) {
      toast.error('This role is already assigned for this division');
      return;
    }
    guard(newCode, newRole, submitAdd);
  };

  const submitAdd = async () => {
    setBusy('add');
    try {
      const isFirst = rows.length === 0;
      await api.post(`/admin/users/${userId}/divisions`, {
        division_code: newCode,
        role: newRole,
        is_primary: isFirst,
      });
      toast.success('Division added');
      setAddMode(false);
      setNewCode(null);
      setNewRole(DR.MEMBER);
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to add'));
    } finally { setBusy(null); }
  };

  const handleRemove = async (row) => {
    setBusy(row.id);
    try {
      await api.delete(`/admin/users/${userId}/divisions/${row.id}`);
      toast.success(`Removed ${row.division_code}`);
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to remove'));
    } finally { setBusy(null); }
  };

  const handleRoleChange = (row, role) => guard(row.division_code, role, () => submitRoleChange(row, role));

  const submitRoleChange = async (row, role) => {
    setBusy(row.id);
    try {
      await api.put(`/admin/users/${userId}/divisions/${row.id}`, { role });
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update role'));
    } finally { setBusy(null); }
  };

  const handleSetPrimary = async (row) => {
    if (row.is_primary) return;
    setBusy(row.id);
    try {
      await api.put(`/admin/users/${userId}/divisions/${row.id}`, { is_primary: true });
      load();
    } catch {
      toast.error('Failed to set primary');
    } finally { setBusy(null); }
  };

  if (loading) {
    return (
      <div className="bg-gray-50 border border-gray-200 px-3 py-3 flex items-center gap-2 text-[10px] text-gray-500">
        <Loader2 className="w-3 h-3 animate-spin" />
        Loading division assignments...
      </div>
    );
  }

  return (
    <div className="bg-gray-50 border border-gray-200">
      <ConfirmDialog {...dialogProps} />
      <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
        <span className="font-semibold text-gray-600 uppercase tracking-wide text-[9px]">
          Division assignments ({rows.length})
        </span>
        {!addMode && (
          <button
            type="button"
            onClick={() => setAddMode(true)}
            className="text-[9px] px-2 py-1 bg-[#1A5632] text-white hover:bg-[#14442A] flex items-center gap-1"
          >
            <Plus className="w-2.5 h-2.5" /> Add
          </button>
        )}
      </div>

      {rows.length === 0 && !addMode && (
        <div className="px-3 py-2 text-[10px] text-gray-400">
          No divisions assigned yet. Click Add to assign one.
        </div>
      )}

      {rows.map((row) => (
        <div
          key={row.id}
          className="px-3 py-2 border-b border-gray-100 flex items-center gap-2 text-[11px]"
        >
          <div className="flex-1 min-w-0">
            <span className="font-mono text-[10px] font-semibold text-gray-700">
              {row.division_code}
            </span>
            {row.division_name && (
              <span className="text-[10px] text-gray-400 ml-1.5">
                {row.division_name}
              </span>
            )}
          </div>

          <select
            value={optionValue(row.role)}
            onChange={(e) => handleRoleChange(row, e.target.value)}
            disabled={busy === row.id}
            className="text-[10px] border border-gray-200 px-1.5 py-1 bg-white outline-none focus:border-[#1A5632]"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => handleSetPrimary(row)}
            disabled={busy === row.id}
            className="p-1"
            title={row.is_primary ? 'Primary division' : 'Set as primary'}
          >
            <Star
              className={`w-3.5 h-3.5 ${
                row.is_primary
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-gray-300 hover:text-amber-300'
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() => handleRemove(row)}
            disabled={busy === row.id}
            className="p-1 text-gray-400 hover:text-red-600"
            title="Remove"
          >
            {busy === row.id
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <Trash2 className="w-3 h-3" />}
          </button>
        </div>
      ))}

      {addMode && (
        <DivisionAssignmentAddForm
          divOptions={divOptions}
          roleOptions={ROLE_OPTIONS}
          code={newCode}
          onCodeChange={setNewCode}
          role={newRole}
          onRoleChange={setNewRole}
          isBusy={busy === 'add'}
          onAssign={handleAdd}
          onCancel={() => { setAddMode(false); setNewCode(null); setNewRole(DR.MEMBER); }}
        />
      )}
    </div>
  );
}
