import { Loader2 } from 'lucide-react';
import { PAGES_GROUP, SEARCH_GROUP_VIEW } from '@/config/globalSearch';

export const SEARCH_LIST_ID = 'global-search-list';
export const optionId = (index) => `global-search-option-${index}`;

function Row({ row, index, isActive, onOpen, onHover }) {
  const view = SEARCH_GROUP_VIEW[row.group] || SEARCH_GROUP_VIEW[PAGES_GROUP];
  return (
    <li id={optionId(index)} role="option" aria-selected={isActive}
      onMouseDown={(e) => { e.preventDefault(); onOpen(row.path); }} onMouseEnter={() => onHover(index)}
      className={`px-3 py-1.5 flex items-center gap-2.5 cursor-pointer border-b border-gray-50 last:border-0 ${isActive ? 'bg-[#1A5632]/[0.07]' : ''}`}>
      <view.Icon className={`w-3.5 h-3.5 flex-shrink-0 ${view.color}`} />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-gray-800 truncate">
          {row.code && <span className={`font-mono font-semibold mr-1.5 ${view.color}`}>{row.code}</span>}
          {row.label}
        </div>
        {row.sub && <div className="text-[10px] text-gray-400 truncate">{row.sub}</div>}
      </div>
    </li>
  );
}

function Status({ isSearching, isError, isEmpty, term, planningYear }) {
  if (isSearching) {
    return <div className="px-3 py-3 flex items-center justify-center gap-2 text-[11px] text-gray-400"><Loader2 className="w-3 h-3 animate-spin" /> Searching...</div>;
  }
  if (isError) return <div className="px-3 py-3 text-[11px] text-[#9F2241]">Search is unavailable right now. Try again in a moment.</div>;
  if (isEmpty) return <div className="px-3 py-3 text-[11px] text-gray-500">Nothing matches &quot;{term}&quot; in the {planningYear} plan.</div>;
  return null;
}

/**
 * Results of the top-bar search, grouped by type, with « See all results »
 * as the last option. Rows open on mouse down so the input keeps focus.
 *
 * @param {{ sections: object[], activeIndex: number, term: string, planningYear: string, isSearching: boolean, isError: boolean, hasTerm: boolean, onOpen: (path: string) => void, onHover: (index: number) => void, seeAllPath: string }} props
 * @returns {JSX.Element}
 * @example <SearchDropdown sections={sections} activeIndex={0} term="sdi" onOpen={go} ... />
 */
export default function SearchDropdown({ sections, activeIndex, term, planningYear, isSearching, isError, hasTerm, onOpen, onHover, seeAllPath }) {
  let index = -1;
  const rowCount = sections.reduce((n, s) => n + s.rows.length, 0);
  return (
    <div className="absolute left-0 top-full mt-1 w-[480px] bg-white border border-gray-200 z-50 max-h-[440px] overflow-y-auto">
      <ul id={SEARCH_LIST_ID} role="listbox" aria-label="Search results">
        {sections.map((section) => (
          <li key={section.group} role="presentation">
            <div className="px-3 py-1 text-[9px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">{section.label}</div>
            <ul role="group" aria-label={section.label}>
              {section.rows.map((row) => {
                index += 1;
                return <Row key={row.key} row={row} index={index} isActive={index === activeIndex} onOpen={onOpen} onHover={onHover} />;
              })}
            </ul>
          </li>
        ))}
        {hasTerm && (
          <li id={optionId(rowCount)} role="option" aria-selected={activeIndex === rowCount}
            onMouseDown={(e) => { e.preventDefault(); onOpen(seeAllPath); }} onMouseEnter={() => onHover(rowCount)}
            className={`px-3 py-2 text-[12px] text-[#1A5632] font-medium cursor-pointer border-t border-gray-100 ${activeIndex === rowCount ? 'bg-[#1A5632]/[0.07]' : ''}`}>
            See all results for &quot;{term}&quot;
          </li>
        )}
      </ul>
      <Status isSearching={isSearching && !rowCount} isError={isError} isEmpty={hasTerm && !isSearching && !isError && !rowCount} term={term} planningYear={planningYear} />
    </div>
  );
}
