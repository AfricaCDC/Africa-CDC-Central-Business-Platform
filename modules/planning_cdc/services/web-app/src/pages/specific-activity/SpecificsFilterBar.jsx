import { Search } from 'lucide-react';
import { ACTIVITY_TYPE_OPTIONS, ACTIVITY_RISK_OPTIONS, BUDGETING_ARRANGEMENT_OPTIONS } from '@rbm/lib/enums';

const SELECT = 'text-[11px] border border-gray-200 px-2 py-1.5 outline-none focus:border-[#D97706] bg-white';

function FilterSelect({ label, value, options, onChange }) {
  return (
    <label className="flex items-center gap-1.5 text-[10px] text-gray-500">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={SELECT} aria-label={label}>
        <option value="">All</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/**
 * Search, status tabs and the type / funding / arrangement / risk filters of
 * the Specific Activities list (D-20261105-05). Presentational: the URL state
 * comes from useSpecificsFilters.
 *
 * @param {{ filters: Record<string, string>, setFilter: Function, clearAllFilters: Function,
 *   activeFilterCount: number, tabs: Array<{ key: string, label: string }>, counts: Record<string, number>,
 *   fundingOptions: Array<{ value: string, label: string }> }} props
 * @returns {JSX.Element}
 * @example <SpecificsFilterBar filters={filters} setFilter={setFilter} tabs={TABS} counts={counts} fundingOptions={[]} />
 */
export default function SpecificsFilterBar({ filters, setFilter, clearAllFilters, activeFilterCount, tabs, counts, fundingOptions }) {
  const status = filters.status || 'ALL';
  return (
    <div className="space-y-2.5 border border-t-0 border-gray-200 bg-white px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-[340px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input value={filters.q} onChange={(e) => setFilter('q', e.target.value)} placeholder="Search by code, title, indicator..."
            className="w-full border border-gray-200 py-1.5 pl-8 pr-3 text-[11px] outline-none focus:border-[#D97706]" />
        </div>
        <div className="flex border border-gray-200">
          {tabs.map((t) => (
            <button key={t.key} type="button" onClick={() => setFilter('status', t.key)}
              className={`border-r border-gray-200 px-3 py-1.5 text-[10px] last:border-r-0 ${status === t.key ? 'bg-[#D97706] font-semibold text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {t.label} <span className="opacity-60">({counts[t.key] ?? 0})</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect label="Type" value={filters.type} options={ACTIVITY_TYPE_OPTIONS} onChange={(v) => setFilter('type', v)} />
        <FilterSelect label="Funding source" value={filters.funding} options={fundingOptions} onChange={(v) => setFilter('funding', v)} />
        <FilterSelect label="Budgeting arrangement" value={filters.arrangement} options={BUDGETING_ARRANGEMENT_OPTIONS} onChange={(v) => setFilter('arrangement', v)} />
        <FilterSelect label="Risk" value={filters.risk} options={ACTIVITY_RISK_OPTIONS} onChange={(v) => setFilter('risk', v)} />
        {activeFilterCount > 0 && (
          <button type="button" onClick={clearAllFilters} className="text-[10px] text-[#D97706] hover:underline">
            Clear filters ({activeFilterCount})
          </button>
        )}
      </div>
    </div>
  );
}
