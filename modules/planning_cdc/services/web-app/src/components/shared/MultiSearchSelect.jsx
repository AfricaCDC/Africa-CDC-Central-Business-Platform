import { X } from 'lucide-react';
import SearchSelect from './SearchSelect';

/**
 * Several values picked from a long list: chips with a remove button and an
 * autocomplete that adds one value at a time.
 *
 * @param {{ values: Array<string|number>, options: Array<{ value: string|number, label: string, sub?: string }>, onChange: (values: Array<string|number>) => void, placeholder?: string, disabled?: boolean }} props
 * @returns {JSX.Element}
 * @example <MultiSearchSelect values={['EPR']} options={divOpts} onChange={setCodes} placeholder="— Add a division —" />
 */
export default function MultiSearchSelect({ values, options, onChange, placeholder = '— Add —', disabled = false }) {
  const byValue = new Map(options.map((o) => [String(o.value), o]));
  const free = options.filter((o) => !values.some((v) => String(v) === String(o.value)));
  const handleAdd = (value) => { if (value) onChange([...values, value]); };

  return (
    <div className="space-y-1.5">
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {values.map((v) => {
            const label = byValue.get(String(v))?.label || String(v);
            return (
              <li key={v} className="flex items-center gap-1 border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-800">
                <span>{label}</span>
                {!disabled && (
                  <button type="button" onClick={() => onChange(values.filter((x) => x !== v))}
                    className="text-gray-500 hover:text-red-700" aria-label={`Remove ${label}`}>
                    <X className="h-3 w-3" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <SearchSelect value={null} options={free} onChange={handleAdd} placeholder={placeholder} disabled={disabled || !free.length} />
    </div>
  );
}
