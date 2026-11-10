import SearchSelect from '@/components/shared/SearchSelect';
import { AU_MEMBER_STATES } from '@/data/auMemberStates';

const MEMBER_STATE_OPTIONS = AU_MEMBER_STATES.map((c) => ({ value: c.name, label: c.name, sub: c.region }));

const splitNames = (csv) => (csv ? csv.split(',').map((s) => s.trim()).filter(Boolean) : []);

/**
 * Template item 8, other team members: picked from the staff list, never
 * typed. Stored as a comma-separated list, as before.
 * @param {{ value: string, lead: string, options: object[], onChange: Function }} props
 * @returns {JSX.Element}
 * @example <OtherStaffPicker value="A, B" lead="C" options={staffOptions} onChange={v => set('other_staff', v)} />
 */
export function OtherStaffPicker({ value, lead, options, onChange }) {
  const names = splitNames(value);
  const handleAdd = (name) => {
    if (name && !names.includes(name)) onChange([...names, name].join(', '));
  };
  return (
    <>
      <SearchSelect
        value={null}
        onChange={handleAdd}
        placeholder="— Add staff from CBP —"
        options={options.filter((o) => o.value !== lead && !names.includes(o.value))}
      />
      {names.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {names.map((name) => (
            <span key={name} className="inline-flex items-center gap-1 text-[10px] bg-gray-100 border border-gray-200 px-2 py-0.5 text-gray-700">
              {name}
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => onChange(names.filter((n) => n !== name).join(', '))}
                className="text-gray-400 hover:text-red-500 ml-0.5"
              >×</button>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Template item 10a, Member States covered.
 * @param {{ value: string[], onChange: Function }} props
 * @returns {JSX.Element}
 * @example <MemberStatesPicker value={['Kenya']} onChange={v => set('member_states', v)} />
 */
export function MemberStatesPicker({ value, onChange }) {
  return (
    <div className="border border-gray-300 p-3">
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
        {value.length === 0 && <span className="text-[10px] text-gray-400 py-1">No member states selected</span>}
        {value.map((name) => (
          <span key={name} className="inline-flex items-center gap-1 text-[9px] font-medium bg-[#D97706]/10 text-[#B45309] px-2 py-0.5">
            {name}
            <button
              type="button"
              aria-label={`Remove ${name}`}
              onClick={() => onChange(value.filter((s) => s !== name))}
              className="text-[#B45309] hover:text-red-600"
            >x</button>
          </span>
        ))}
      </div>
      <SearchSelect
        value={null}
        onChange={(v) => { if (v && !value.includes(v)) onChange([...value, v]); }}
        placeholder="Add a member state..."
        options={MEMBER_STATE_OPTIONS.filter((o) => !value.includes(o.value))}
        allowClear={false}
      />
    </div>
  );
}

export { splitNames };
