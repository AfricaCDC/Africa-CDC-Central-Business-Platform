import { Loader2 } from 'lucide-react';
import SearchSelect from '@/components/shared/SearchSelect';

/**
 * Add row of DivisionAssignmentEditor: division search + role select.
 *
 * @param {{ divOptions: Array<object>, roleOptions: Array<{value:string,label:string}>, code: string|null,
 *   onCodeChange: Function, role: string, onRoleChange: Function, isBusy: boolean, onAssign: Function, onCancel: Function }} props
 * @returns {JSX.Element}
 * @throws {never}
 * @example <DivisionAssignmentAddForm divOptions={opts} roleOptions={roles} code={c} onCodeChange={setC} role={r} onRoleChange={setR} isBusy={false} onAssign={add} onCancel={close} />
 */
export default function DivisionAssignmentAddForm({
  divOptions, roleOptions, code, onCodeChange, role, onRoleChange, isBusy, onAssign, onCancel,
}) {
  return (
    <div className="px-3 py-2 border-t border-gray-200 space-y-2">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-[9px] font-semibold text-gray-500 mb-1">Division</label>
          <SearchSelect
            value={code}
            options={divOptions}
            onChange={onCodeChange}
            placeholder="Search division..."
            maxHeight="max-h-[180px]"
          />
        </div>
        <div className="w-[140px]">
          <label className="block text-[9px] font-semibold text-gray-500 mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => onRoleChange(e.target.value)}
            className="w-full text-[11px] border border-gray-200 px-2 py-[7px] bg-white outline-none focus:border-[#1A5632]"
          >
            {roleOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAssign}
          disabled={isBusy}
          className="text-[10px] px-3 py-1.5 bg-[#1A5632] text-white hover:bg-[#14442A] flex items-center gap-1"
        >
          {isBusy && <Loader2 className="w-3 h-3 animate-spin" />}
          Assign
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[10px] px-3 py-1.5 border border-gray-300 text-gray-600 hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
