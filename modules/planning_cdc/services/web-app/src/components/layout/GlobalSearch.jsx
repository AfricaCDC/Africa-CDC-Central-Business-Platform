import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useSearchSections } from '@/hooks/useSearchQueries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { SEARCH_BAR_LIMIT, SEARCH_DEBOUNCE_MS, SEARCH_MAX_CHARS, searchPageUrl } from '@/config/globalSearch';
import SearchDropdown, { SEARCH_LIST_ID, optionId } from './SearchDropdown';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
const SHORTCUT = IS_MAC ? '⌘K' : 'Ctrl K';
const KEY_STEPS = Object.freeze({ ArrowDown: 1, ArrowUp: -1 });

/** Next highlighted option, wrapping around; from none, Down = first, Up = last. */
export function nextIndex(current, step, count) {
  if (current < 0) return step > 0 ? 0 : count - 1;
  return (current + step + count) % count;
}

/** Ctrl+K (⌘K on a Mac) puts the cursor in the search box, from anywhere. */
function useFocusShortcut(inputRef) {
  useEffect(() => {
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [inputRef]);
}

/**
 * Search box of the top bar (D-20261106-05): pages of the user's menu, then
 * plan items of the selected year, Business Units and member states, from 2
 * characters after a short typing pause. Arrows move, Enter opens the
 * highlighted result (or all results), Escape closes.
 *
 * @returns {JSX.Element}
 * @example <GlobalSearch />
 */
export default function GlobalSearch() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const term = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const { sections, hasTerm, ...state } = useSearchSections(term, { limit: SEARCH_BAR_LIMIT, withPages: true });
  const rows = sections.flatMap((s) => s.rows);
  const optionCount = rows.length + (hasTerm ? 1 : 0);
  const isDropdownOpen = isOpen && !!term && (hasTerm || rows.length > 0);
  useFocusShortcut(inputRef);

  const handleOpen = (path) => {
    navigate(path);
    setQuery('');
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleChange = (e) => {
    setQuery(e.target.value);
    setActiveIndex(-1);
    setIsOpen(true);
  };

  const handleKeyDown = (e) => {
    const step = KEY_STEPS[e.key];
    if (step && optionCount) {
      e.preventDefault();
      setIsOpen(true);
      setActiveIndex((i) => nextIndex(i, step, optionCount));
    } else if (e.key === 'Enter' && query.trim()) {
      e.preventDefault();
      handleOpen(rows[activeIndex]?.path || searchPageUrl(query));
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="hidden md:block relative mx-4" data-tour="search">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
      <input ref={inputRef} role="combobox" aria-label="Search" aria-autocomplete="list"
        aria-expanded={isDropdownOpen} aria-controls={SEARCH_LIST_ID}
        aria-activedescendant={isDropdownOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        placeholder="Search activities, indicators, Business Units..." maxLength={SEARCH_MAX_CHARS}
        value={query} onChange={handleChange} onKeyDown={handleKeyDown}
        onFocus={() => setIsOpen(true)} onBlur={() => setIsOpen(false)}
        className="w-[360px] h-8 pl-9 pr-14 text-[12px] bg-white/10 border border-white/20 text-white outline-none focus:border-[#B4A269] focus:bg-white/15 transition-all placeholder:text-white/50" />
      <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-white/50 bg-white/10 border border-white/20 px-1.5 py-0.5 font-mono">{SHORTCUT}</kbd>
      {isDropdownOpen && (
        <SearchDropdown sections={sections} activeIndex={activeIndex} term={term} hasTerm={hasTerm}
          planningYear={state.planningYear} isSearching={state.isSearching} isError={state.isError}
          onOpen={handleOpen} onHover={setActiveIndex} seeAllPath={searchPageUrl(term)} />
      )}
    </div>
  );
}
