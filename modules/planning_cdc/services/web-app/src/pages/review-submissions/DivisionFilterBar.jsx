import DirectorateDivisionFilter from './DirectorateDivisionFilter';

/**
 * Filter strip of a review-submissions tab: directorate → division pickers,
 * "N of M" count and a Clear link while a filter is set.
 *
 * @param {{ filter: ReturnType<import('./useDivisionFilter').default>, shown: number, total: number }} props
 * @returns {JSX.Element}
 * @throws {never}
 * @example <DivisionFilterBar filter={f} shown={rows.length} total={all.length} />
 */
export default function DivisionFilterBar({ filter, shown, total }) {
  return (
    <div className="bg-white border border-gray-200 border-t-0 px-3 py-2 flex items-center gap-2 flex-wrap">
      <DirectorateDivisionFilter {...filter.filterProps} />
      <span className="text-[10px] text-gray-500 ml-auto"><strong>{shown}</strong> of {total}</span>
      {filter.isActive && (
        <button type="button" onClick={filter.clear} className="text-[10px] text-gray-500 hover:text-[#1A5632] underline">Clear</button>
      )}
    </div>
  );
}
