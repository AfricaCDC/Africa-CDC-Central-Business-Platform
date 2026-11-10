import { APPROVAL_ENTITIES } from '@rbm/lib/enums';

const STEP_OPTIONS = [
  { value: 'all', label: 'All steps' },
  { value: '1', label: 'Step 1 — Contributing HOD' },
  { value: '2', label: 'Step 2 — Accountable HOD' },
  { value: '3', label: 'Step 3 — M&E final' },
];

const ENTITY_OPTIONS = [
  { value: 'all', label: 'All report types' },
  { value: APPROVAL_ENTITIES.ACTIVITY_REPORT, label: 'Activity report' },
  { value: APPROVAL_ENTITIES.INDICATOR_ACTUAL, label: 'Indicator actual' },
];

/**
 * Filter bar for the approval inbox. Dumb component — reads from
 * `filters` and fires `onChange(key, value)` per spec §9.2.
 *
 * @param {object} props
 * @param {object} props.filters
 * @param {(key: string, value: unknown) => void} props.onChange
 * @param {() => void} props.onClear
 * @param {number} props.activeFilterCount
 * @returns {JSX.Element}
 */
export default function ApprovalInboxFilters({ filters, onChange, onClear, activeFilterCount }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border border-gray-200 bg-white p-2 text-[11px]">
      <label className="flex items-center gap-1">
        <span className="font-semibold text-gray-600">Step</span>
        <select
          aria-label="Filter by approval step"
          className="border border-gray-300 bg-white px-2 py-1 text-[11px]"
          value={filters.step}
          onChange={(e) => onChange('step', e.target.value)}
        >
          {STEP_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1">
        <span className="font-semibold text-gray-600">Type</span>
        <select
          aria-label="Filter by report type"
          className="border border-gray-300 bg-white px-2 py-1 text-[11px]"
          value={filters.entityType}
          onChange={(e) => onChange('entityType', e.target.value)}
        >
          {ENTITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1">
        <span className="font-semibold text-gray-600">Div. code</span>
        <input
          aria-label="Filter by division code"
          type="text"
          className="w-32 border border-gray-300 bg-white px-2 py-1 text-[11px]"
          placeholder="e.g. SRH"
          value={filters.divisionCode === 'all' ? '' : filters.divisionCode}
          onChange={(e) => onChange('divisionCode', e.target.value || 'all')}
        />
      </label>
      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="border border-gray-300 bg-gray-50 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100"
        >
          Clear ({activeFilterCount})
        </button>
      )}
    </div>
  );
}
