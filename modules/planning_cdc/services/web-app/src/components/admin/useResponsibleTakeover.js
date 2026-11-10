import { useState } from 'react';
import api from '@/services/api';
import { DIVISION_ASSIGNMENT_ROLES as DR } from '@rbm/lib/user-divisions';

// "Responsible person" is stored as HEAD_OF_DIVISION or DIRECTOR (level_type).
export const RESPONSIBLE_ROLES = new Set([DR.HEAD_OF_DIVISION, DR.DIRECTOR]);

const nameOf = (u) => (u && (u.full_name || [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email)) || 'Another user';

/**
 * Ask before making a user the Responsible person of a division that already
 * has one: a division has a single Responsible person, and the server demotes
 * the current one to member (divisionAssignmentService.assignHolder).
 *
 * @param {number} userId — the user being edited
 * @returns {{ guard: (code: string, role: string, run: () => Promise<void>) => Promise<void>, dialogProps: object }}
 *   `guard` runs `run` directly, or after the admin confirms; spread `dialogProps` on ConfirmDialog.
 * @throws {never} a failed lookup falls through to `run` (the server still enforces one holder)
 * @example
 * const { guard, dialogProps } = useResponsibleTakeover(userId);
 * await guard('DPHI', role, () => api.post(...));
 */
export default function useResponsibleTakeover(userId) {
  const [pending, setPending] = useState(null);

  const guard = async (code, role, run) => {
    if (!RESPONSIBLE_ROLES.has(role)) return run();
    let div = null;
    try {
      div = (await api.get(`/admin/divisions/${encodeURIComponent(code)}`)).data;
    } catch {
      div = null; // no org-tree read access: proceed, the server keeps one holder
    }
    const holderId = Number(div?.responsible_user_id) || null;
    if (!holderId || holderId === Number(userId)) return run();
    setPending({ code, name: nameOf(div.responsible_user), run });
    return undefined;
  };

  const dialogProps = {
    open: !!pending,
    onClose: () => setPending(null),
    onConfirm: () => {
      const { run } = pending;
      setPending(null);
      run();
    },
    title: 'Replace the Responsible person?',
    description: pending
      ? `${pending.name} is already the Responsible person of ${pending.code}. A division has only one. Continuing removes ${pending.name} from that role (they stay a member of ${pending.code}).`
      : '',
    confirmLabel: 'Replace',
    variant: 'danger',
  };

  return { guard, dialogProps };
}
