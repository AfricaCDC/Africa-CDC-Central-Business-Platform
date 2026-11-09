import { Search, X } from 'lucide-react';
import { ADOPTION_FILTERS, ADOPTION_FILTER_LABELS } from '@rbm/lib/enums';
import SearchSelect from '@/components/shared/SearchSelect';

/**
 * Filters of the adoption list: status, Business Unit, name or email.
 *
 * @param {{ filters: object, units: object[], onChange: (key: string, value: unknown) => void, onClear: () => void, activeCount: number }} props
 * @returns {JSX.Element}
 * @example <AdoptionFilters filters={filters} units={units} onChange={setFilter} onClear={clearAllFilters} activeCount={1} />
 */
export default function AdoptionFilters({ filters, units, onChange, onClear, activeCount }) {
  const unitOptions = units.map((u) => ({ value: u.code, label: `${u.code} · ${u.division_name || u.code}` }));
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          value={filters.q}
          onChange={(e) => onChange('q', e.target.value)}
          placeholder="Name or email"
          aria-label="Search by name or email"
          className="pl-8 pr-3 py-1.5 text-[11px] border border-gray-300 bg-white w-[220px] focus:outline-none focus:border-[#1A5632]"
        />
      </div>
      <select
        value={filters.filter}
        onChange={(e) => onChange('filter', e.target.value)}
        aria-label="Show"
        className="px-2 py-1.5 text-[11px] border border-gray-300 bg-white focus:outline-none focus:border-[#1A5632]"
      >
        <option value="">Every active user</option>
        {Object.values(ADOPTION_FILTERS).map((f) => <option key={f} value={f}>{ADOPTION_FILTER_LABELS[f]}</option>)}
      </select>
      <div className="w-[240px]">
        <SearchSelect value={filters.bu || null} options={unitOptions} onChange={(v) => onChange('bu', v)} placeholder="Every Business Unit" allowClear />
      </div>
      {activeCount > 0 && (
        <button type="button" onClick={onClear} className="inline-flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-900">
          <X className="w-3.5 h-3.5" /> Clear filters ({activeCount})
        </button>
      )}
    </div>
  );
}
