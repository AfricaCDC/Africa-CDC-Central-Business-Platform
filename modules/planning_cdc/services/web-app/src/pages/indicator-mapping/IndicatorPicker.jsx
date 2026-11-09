import { X } from 'lucide-react';
import SearchSelect from '@/components/shared/SearchSelect';

/**
 * Indicators of one activity: chips with a remove button and an
 * autocomplete to add one. `isSingle` (specific activity) replaces the
 * indicator instead of adding.
 *
 * @param {{ ids: number[], options: Array<{ value: number, label: string, sub?: string }>, isSingle: boolean, canEdit: boolean, isSaving: boolean, onChange: (ids: number[]) => void }} props
 * @returns {JSX.Element}
 * @example <IndicatorPicker ids={[412]} options={options} isSingle={false} canEdit onChange={save} />
 */
export default function IndicatorPicker({ ids, options, isSingle, canEdit, isSaving, onChange }) {
  const byId = new Map(options.map((o) => [o.value, o]));
  const free = options.filter((o) => !ids.includes(o.value));
  const handleAdd = (value) => {
    const id = Number(value);
    if (id) onChange(isSingle ? [id] : [...ids, id]);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {ids.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {ids.map((id) => (
            <li key={id} className="flex items-center gap-1 border border-[#B4A269]/60 bg-[#B4A269]/10 px-1.5 py-0.5 text-[10px] text-gray-800" title={byId.get(id)?.sub}>
              <span>{byId.get(id)?.label || `#${id}`}</span>
              {canEdit && (
                <button type="button" disabled={isSaving} onClick={() => onChange(ids.filter((x) => x !== id))}
                  className="text-gray-500 hover:text-red-700 disabled:opacity-50" aria-label={`Remove ${byId.get(id)?.label || id}`}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!ids.length && !canEdit && <span className="text-[11px] text-gray-400">Not linked</span>}
      {canEdit && (isSingle || free.length > 0) && (
        <SearchSelect
          value=""
          options={free}
          onChange={handleAdd}
          disabled={isSaving}
          placeholder={isSingle && ids.length ? 'Change indicator…' : 'Add a T3/T4 indicator…'}
        />
      )}
    </div>
  );
}
