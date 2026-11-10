import { YEAR_OPTIONS, QUARTER_OPTIONS, PROGRESS_OPTIONS, pillarShort } from '../config';

const SELECT = 'text-[11px] border border-gray-300 bg-white px-2 py-1.5 focus:outline-none focus:border-[#1A5632]';

/**
 * Filters of the Big Tickets list: year, quarter, pillar, progress, search.
 *
 * @param {{ filters: object, quarter: string, pillars: Array<{ id: number, name: string }>,
 *   onChange: (key: string, value: string) => void, onClear: () => void, activeFilterCount: number }} props
 * @returns {JSX.Element}
 * @example <BigTicketsFilters filters={filters} quarter="Q2" pillars={pillars} onChange={setFilter} onClear={clear} activeFilterCount={0} />
 */
export default function BigTicketsFilters({ filters, quarter, pillars, onChange, onClear, activeFilterCount }) {
  return (
    <div className="flex flex-wrap items-end gap-3 border border-gray-200 bg-white px-4 py-3">
      <label className="flex flex-col gap-1 text-[10px] text-gray-500">Year
        <select value={filters.fy} onChange={(e) => onChange('fy', e.target.value)} className={SELECT}>
          {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </label>
      <div className="flex flex-col gap-1 text-[10px] text-gray-500">
        <span>Quarter</span>
        <div className="flex" role="group" aria-label="Quarter">
          {QUARTER_OPTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onChange('quarter', q)}
              aria-pressed={quarter === q}
              className={`border px-3 py-1.5 text-[11px] -ml-px first:ml-0 ${quarter === q ? 'border-[#1A5632] bg-[#1A5632] text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1 text-[10px] text-gray-500">Pillar
        <select value={filters.pillar} onChange={(e) => onChange('pillar', e.target.value)} className={SELECT}>
          <option value="all">All pillars</option>
          {pillars.map((p) => <option key={p.id} value={String(p.id)}>{pillarShort(p.name)}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[10px] text-gray-500">Status
        <select value={filters.progress} onChange={(e) => onChange('progress', e.target.value)} className={SELECT}>
          <option value="all">All statuses</option>
          {PROGRESS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-[10px] text-gray-500">Search
        <input
          type="search"
          defaultValue={filters.q}
          placeholder="Code or title"
          onKeyDown={(e) => { if (e.key === 'Enter') onChange('q', e.currentTarget.value.trim()); }}
          onBlur={(e) => onChange('q', e.currentTarget.value.trim())}
          className={SELECT}
        />
      </label>
      {activeFilterCount > 0 && (
        <button type="button" onClick={onClear} className="px-2 py-1.5 text-[11px] text-[#1A5632] underline">
          Clear filters ({activeFilterCount})
        </button>
      )}
    </div>
  );
}
