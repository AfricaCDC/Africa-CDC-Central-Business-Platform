/**
 * UserFormFields — presentational fields for the admin user form.
 *
 * Renders controlled inputs only; all state lives in UserFormModal. Edit mode
 * also mounts the division assignment editor, which saves on its own.
 *
 * @param {{
 *   form: object, mode: 'create'|'edit'|'duplicate', user: object|null,
 *   roles: Array<{id:number, code:string, name:string}>,
 *   divisions: Array<{code:string, division_name:string}>,
 *   onChange: (key: string, value: string) => void,
 *   onToggleRole: (roleId: number) => void,
 * }} props
 * @returns {JSX.Element}
 * @example <UserFormFields form={form} mode="edit" user={row} roles={roles} divisions={divisions} onChange={set} onToggleRole={toggle} />
 */

import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import { ROLES } from '@rbm/lib/roles';
import DivisionAssignmentEditor from '@/components/admin/DivisionAssignmentEditor';
import { titleOptionsFor } from './userFormState';

// Role codes AUTO-managed via the division-centric model (see the org page).
const AUTO_MANAGED_ROLE_CODES = new Set([ROLES.FOCAL_PERSON, ROLES.HEAD_OF_DIVISION, ROLES.DIRECTOR, ROLES.ME_OFFICER]);

const INPUT_CLASS = 'w-full text-[12px] border border-gray-200 px-3 py-2 outline-none focus:border-[#1A5632]';
const LABEL_CLASS = 'block text-[11px] font-semibold text-gray-700 mb-1';

export default function UserFormFields({ form, mode, user, roles, divisions, onChange, onToggleRole }) {
  const isEdit = mode === 'edit';
  return (
    <>
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-3">
          <label htmlFor="user-title" className={LABEL_CLASS}>Title</label>
          <select
            id="user-title"
            value={form.title}
            onChange={(e) => onChange('title', e.target.value)}
            className={`${INPUT_CLASS} bg-white`}
          >
            {titleOptionsFor(form.title).map((t) => (
              <option key={t} value={t}>{t || '—'}</option>
            ))}
          </select>
        </div>
        <div className="col-span-9">
          <label htmlFor="user-first-name" className={LABEL_CLASS}>First name *</label>
          <input
            id="user-first-name"
            value={form.first_name}
            onChange={(e) => onChange('first_name', e.target.value)}
            aria-required="true"
            className={INPUT_CLASS}
            placeholder="John"
          />
        </div>
        <div className="col-span-6">
          <label htmlFor="user-middle-name" className={LABEL_CLASS}>Middle name</label>
          <input
            id="user-middle-name"
            value={form.middle_name}
            onChange={(e) => onChange('middle_name', e.target.value)}
            className={INPUT_CLASS}
            placeholder="(optional)"
          />
        </div>
        <div className="col-span-6">
          <label htmlFor="user-last-name" className={LABEL_CLASS}>Last name *</label>
          <input
            id="user-last-name"
            value={form.last_name}
            onChange={(e) => onChange('last_name', e.target.value)}
            aria-required="true"
            className={INPUT_CLASS}
            placeholder="Doe"
          />
        </div>
      </div>

      <div>
        <label htmlFor="user-email" className={LABEL_CLASS}>Email *</label>
        <input
          id="user-email"
          type="email"
          value={form.email}
          onChange={(e) => onChange('email', e.target.value)}
          aria-required="true"
          className={INPUT_CLASS}
          placeholder="user@africacdc.org"
        />
      </div>

      <p className="text-[10px] text-gray-500">
        The user signs in with their Africa CDC Microsoft account matching this email. There is no password to set.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {!isEdit && (
          <div>
            <label htmlFor="user-division" className={LABEL_CLASS}>Initial primary division</label>
            <select
              id="user-division"
              value={form.division_code}
              onChange={(e) => onChange('division_code', e.target.value)}
              className={`${INPUT_CLASS} bg-white`}
            >
              <option value="">— None —</option>
              {divisions.map((d) => (
                <option key={d.code} value={d.code}>{d.code} — {d.division_name}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">
              Saved as the primary division. You can add more divisions after creating the user.
            </p>
          </div>
        )}

        <div className={isEdit ? 'col-span-2' : ''}>
          <label htmlFor="user-status" className={LABEL_CLASS}>Status</label>
          <select
            id="user-status"
            value={form.status}
            onChange={(e) => onChange('status', e.target.value)}
            className={`${INPUT_CLASS} bg-white max-w-[200px]`}
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="DISABLED">Disabled</option>
          </select>
        </div>
      </div>

      {isEdit && user && (
        <DivisionAssignmentEditor userId={user.id} allDivisions={divisions} />
      )}

      <div>
        <div className={`${LABEL_CLASS} mb-2`}>Roles</div>

        {/* Division-centric workflow banner: explains auto-assigned roles */}
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 px-3 py-2 mb-2 text-[10px] text-blue-800">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <div>
            <strong>FOCAL_PERSON</strong>, <strong>HEAD_OF_DIVISION</strong>, <strong>DIRECTOR</strong> and{' '}
            <strong>ME_OFFICER</strong> are auto-assigned when you set this user as focal, responsible
            or M&E on a division via the{' '}
            <Link to="/reference/org" target="_blank" className="underline font-semibold">org page</Link>.
            Check them here only if you want a manual override.
          </div>
        </div>

        <div className="border border-gray-200 max-h-[180px] overflow-y-auto">
          {roles.map((role) => {
            const checked = form.role_ids.includes(role.id);
            const isAuto = AUTO_MANAGED_ROLE_CODES.has(role.code);
            return (
              <label key={role.id} className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-[11px] hover:bg-gray-50 border-b border-gray-50 last:border-b-0 ${checked ? 'bg-green-50/50' : ''}`}>
                <input type="checkbox" checked={checked} onChange={() => onToggleRole(role.id)} className="w-3 h-3" />
                <span className="font-medium text-gray-800">{role.code}</span>
                <span className="text-[10px] text-gray-400">{role.name}</span>
                {isAuto && (
                  <span className="ml-auto text-[9px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5" title="Assigned automatically via the org page">
                    auto
                  </span>
                )}
              </label>
            );
          })}
        </div>
        <p className="text-[10px] text-gray-400 mt-1">You can add or remove roles later from the table.</p>
      </div>
    </>
  );
}
