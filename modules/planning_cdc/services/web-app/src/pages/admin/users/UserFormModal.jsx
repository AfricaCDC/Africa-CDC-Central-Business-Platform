/**
 * UserFormModal — create / edit / duplicate a staff account (admin only).
 *
 * The inner UserForm is keyed by mode and user id and initialises its state
 * once from the row it receives. A background refetch therefore never wipes
 * what the admin is typing, and every open starts from the current row.
 *
 * Close paths (X, Cancel, backdrop, Escape) never run validation. Only Save
 * does, and a failed check shows an inline message without calling the API.
 *
 * @param {{
 *   open: boolean, mode: 'create'|'edit'|'duplicate', user: object|null,
 *   roles: Array, divisions: Array, onClose: () => void, onSaved: () => void,
 * }} props
 * @returns {JSX.Element|null}
 * @example <UserFormModal open mode="edit" user={row} roles={roles} divisions={divisions} onClose={close} onSaved={refresh} />
 */
import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { adminUsersApi } from '@/services/adminUsers.api';
import useEscapeKey from '@/hooks/useEscapeKey';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import UserFormFields from './UserFormFields';
import {
  buildInitialForm,
  buildUserPayload,
  roleIdsOf,
  validateUserForm,
} from './userFormState';

const FALLBACK_ERROR = {
  edit: 'Could not save changes. Please try again.',
  create: 'Could not create the user. Please try again.',
};

/**
 * Pick a readable message from an API failure. Never exposes raw error objects.
 *
 * @param {unknown} err
 * @param {boolean} isEdit
 * @returns {string}
 * @example errorMessageFor({ response: { data: { message: 'Email taken' } } }, false) // 'Email taken'
 */
function errorMessageFor(err, isEdit) {
  const data = err?.response?.data ?? {};
  const candidate = [data.error?.message, data.error, data.message]
    .find((m) => typeof m === 'string' && m);
  return candidate || FALLBACK_ERROR[isEdit ? 'edit' : 'create'];
}

/**
 * Persist the user row and return its id.
 *
 * @param {boolean} isEdit
 * @param {object|null} user — row being edited (edit mode only)
 * @param {object} payload — request body from buildUserPayload
 * @returns {Promise<number|string>}
 * @throws {Error} when the API returns no id for a created user
 * @example const id = await saveUser(true, row, payload);
 */
async function saveUser(isEdit, user, payload) {
  if (isEdit) {
    await adminUsersApi.update(user.id, payload);
    return user.id;
  }
  const { data: created } = await adminUsersApi.create(payload);
  const savedId = created?.id || created?.data?.id;
  if (!savedId) throw new Error('User created but no id returned');
  return savedId;
}

/**
 * Apply the role diff against the row's current roles.
 *
 * @param {number|string} userId
 * @param {number[]} currentRoleIds — roles the row had when the form opened
 * @param {number[]} nextRoleIds — roles selected in the form
 * @returns {Promise<number>} count of role changes that failed
 * @example const failed = await syncRoles(7, [1], [1, 2]);
 */
async function syncRoles(userId, currentRoleIds, nextRoleIds) {
  const toAdd = nextRoleIds.filter((id) => !currentRoleIds.includes(id));
  const toRemove = currentRoleIds.filter((id) => !nextRoleIds.includes(id));
  const results = await Promise.allSettled([
    ...toAdd.map((roleId) => adminUsersApi.addRole(userId, roleId)),
    ...toRemove.map((roleId) => adminUsersApi.removeRole(userId, roleId)),
  ]);
  return results.filter((r) => r.status === 'rejected').length;
}

/**
 * Modal heading for the current mode.
 *
 * @param {'create'|'edit'|'duplicate'} mode
 * @param {object|null} user
 * @returns {string}
 */
function modalTitle(mode, user) {
  if (mode === 'edit') return `Edit User — ${user?.full_name || ''}`;
  if (mode === 'duplicate') return `Duplicate User — based on ${user?.full_name || ''}`;
  return 'Create New User';
}

/**
 * Entry point. Renders nothing when closed, so the form mounts fresh each open.
 *
 * @param {object} props — see the module docblock
 * @returns {JSX.Element|null}
 */
export default function UserFormModal(props) {
  if (!props.open) return null;
  return <UserForm key={`${props.mode}-${props.user?.id ?? 'new'}`} {...props} />;
}

/**
 * Form body. Only mounted while open.
 *
 * @param {object} props — see the module docblock
 * @returns {JSX.Element}
 */
function UserForm({ mode, user, roles, divisions, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState(() => buildInitialForm(mode, user));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // Escape closes at any time, including while a save is in flight.
  useEscapeKey(onClose);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const toggleRole = (roleId) => {
    setForm((f) => ({
      ...f,
      role_ids: f.role_ids.includes(roleId)
        ? f.role_ids.filter((id) => id !== roleId)
        : [...f.role_ids, roleId],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const problem = validateUserForm(form);
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const savedId = await saveUser(isEdit, user, buildUserPayload(form));
      const failedRoleChanges = await syncRoles(savedId, isEdit ? roleIdsOf(user) : [], form.role_ids);
      onSaved();
      if (failedRoleChanges > 0) {
        setFormError(`Saved, but ${failedRoleChanges} role change(s) could not be applied. Re-open the user to retry.`);
        return;
      }
      const displayName = [form.title, form.first_name, form.middle_name, form.last_name].filter(Boolean).join(' ').trim();
      toast.success(isEdit ? `${displayName} updated` : `User ${displayName} created`);
      onClose();
    } catch (err) {
      setFormError(errorMessageFor(err, isEdit));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-form-title"
        className="bg-white border border-gray-200 w-full max-w-[560px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-[#1A5632] text-white">
          <h2 id="user-form-title" className="text-[14px] font-semibold">{modalTitle(mode, user)}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-white/70 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* noValidate: our own messages are shown, not the browser's bubbles */}
        <form noValidate onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <UserFormFields
            form={form}
            mode={mode}
            user={user}
            roles={roles}
            divisions={divisions}
            onChange={setField}
            onToggleRole={toggleRole}
          />

          {formError && (
            <p role="alert" className="text-[11px] text-red-700 bg-red-50 border border-red-200 px-3 py-2">
              {formError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="secondary" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="md" disabled={saving}>
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              {saving ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save changes' : 'Create User')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
