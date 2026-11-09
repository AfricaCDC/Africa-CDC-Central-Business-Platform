/* eslint-disable no-restricted-syntax --
 * Scope option values ('DIVISION', 'CONTRIB_DIVISION', 'MAIN_DIVISION',
 * 'GLOBAL') are workflow_template_steps.scope column values, NOT entity
 * types. They cannot be imported from ENTITY_TYPES.
 */
import { ROLE_LABELS } from '@rbm/lib/roles';
import { Trash2, ChevronUp, ChevronDown } from 'lucide-react';

/** Roles that can be assigned as workflow step approvers. */
const STEP_ROLES = [
  'HEAD_OF_DIVISION', 'ME_OFFICER', 'RBM_ADMIN', 'SYSTEM_ADMIN',
  'FOCAL_PERSON', 'FINANCE_OFFICER', 'APPROVER',
];

// A few roles carry an implicit OR-admin rule at approval time (any
// SYSTEM_ADMIN can act in place of the primary role). Surfacing this in
// the dropdown keeps the template editor honest — the admin sees that
// the step is effectively "role OR admin".
const ROLE_LABEL_OVERRIDES = {
  ME_OFFICER: 'M&E Officer (or Admin)',
};

const SCOPE_OPTIONS = [
  { value: 'DIVISION', label: 'Submitter Division' },
  { value: 'CONTRIB_DIVISION', label: 'Contributor Division (sender)' },
  { value: 'MAIN_DIVISION', label: 'Owner Division (indicator owner)' },
  { value: 'GLOBAL', label: 'Global (org-wide)' },
];

/**
 * Single row in the workflow step editor. Handles reorder, label, role,
 * scope selection and delete for one approval step.
 *
 * @param {{step: object, idx: number, total: number, onUpdate: Function, onMove: Function, onRemove: Function}} props
 * @returns {JSX.Element}
 */
export default function WorkflowStepRow({ step, idx, total, onUpdate, onMove, onRemove }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border border-gray-200 p-2 bg-gray-50">
      {/* Reorder */}
      <div className="flex flex-col gap-0.5">
        <button
          onClick={() => onMove(idx, -1)}
          disabled={idx === 0}
          className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20"
        >
          <ChevronUp className="w-3 h-3" />
        </button>
        <button
          onClick={() => onMove(idx, 1)}
          disabled={idx === total - 1}
          className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20"
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      {/* Step number badge */}
      <span className="flex items-center justify-center w-6 h-6 text-[10px] font-bold bg-[#1A5632] text-white flex-shrink-0">
        {step.step_order}
      </span>

      {/* Label */}
      <input
        type="text"
        value={step.step_label}
        onChange={(e) => onUpdate(idx, 'step_label', e.target.value)}
        placeholder="Step label"
        className="flex-1 px-2 py-1 text-[11px] border border-gray-300 bg-white focus:outline-none focus:border-[#1A5632] min-w-0"
      />

      {/* Role */}
      <select
        value={step.role_code}
        onChange={(e) => onUpdate(idx, 'role_code', e.target.value)}
        className="px-2 py-1 text-[11px] border border-gray-300 bg-white focus:outline-none focus:border-[#1A5632] w-40"
      >
        {STEP_ROLES.map((code) => (
          <option key={code} value={code}>
            {ROLE_LABEL_OVERRIDES[code] || ROLE_LABELS[code] || code}
          </option>
        ))}
      </select>

      {/* Scope */}
      <select
        value={step.scope}
        onChange={(e) => onUpdate(idx, 'scope', e.target.value)}
        className="px-2 py-1 text-[11px] border border-gray-300 bg-white focus:outline-none focus:border-[#1A5632] w-24"
      >
        {SCOPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Delete */}
      <button
        onClick={() => onRemove(idx)}
        className="p-1 text-gray-400 hover:text-red-500"
        title="Remove step"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
