/**
 * SearchSelect — flat autocomplete combobox with filter-as-you-type.
 *
 * Designed as a drop-in replacement for a native `<select>` on any
 * long list (>20 options) where scrolling is painful. It is fully
 * controlled: the caller owns the selected value and passes the full
 * options list. We render a single-line trigger that shows the
 * currently selected label, and on click open a dropdown with a
 * search input + a scrollable list of matching options.
 *
 * Design (per CLAUDE.md):
 *   - Flat: no rounded corners, no shadows
 *   - Grey border, Africa CDC green on focus/active
 *   - text-[12px] body, text-[9px] secondary
 *   - Keyboard: Enter to open, Escape to close, arrows to navigate,
 *     Enter on a highlighted option to select it
 *
 * Props:
 *   value       string | number | null  — the currently selected option's `value`
 *   options     Array<{ value, label, sub? }>
 *   onChange    (newValue) => void
 *   placeholder string                  — shown when value is empty (default "— Select —")
 *   disabled    bool
 *   allowClear  bool                    — show a small × button to set value=null
 *   filterFn    (option, query) => bool — custom filter (default: case-insensitive substring on label+sub+value)
 *   maxHeight   string                  — tailwind class for dropdown height (default 'max-h-[260px]')
 *   className   string                  — extra classes on the outer container
 *   id          string                  — passed through to the trigger button for <label htmlFor>
 *
 * Each option may carry an optional `sub` string that is rendered
 * under the main label in the dropdown (useful for codes, tiers,
 * division names, etc.) — the trigger still shows `label` only.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';

/**
 * Trigger — the single-line control that mimics a native `<select>`.
 * It is a role="button" <div> (NOT a <button>) so the optional Clear
 * control can be a real <button> child: a <button> nested inside a
 * <button> is invalid HTML and silently breaks the interaction.
 */
function Trigger({ id, disabled, open, selectedOption, placeholder, allowClear, onToggle, onClear }) {
  return (
    <div
      id={id}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      className={`w-full flex items-center gap-2 text-left text-[12px] border border-gray-300 px-3 py-2 bg-white outline-none focus:border-[#1A5632] cursor-pointer ${disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''} ${open ? 'border-[#1A5632]' : ''}`}
    >
      <span className={`flex-1 truncate ${selectedOption ? 'text-gray-900' : 'text-gray-400'}`}>
        {selectedOption ? selectedOption.label : placeholder}
      </span>
      {allowClear && selectedOption && !disabled && (
        <button
          type="button"
          onClick={onClear}
          className="text-gray-400 hover:text-gray-600 flex-shrink-0"
          title="Clear"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      <ChevronDown className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
    </div>
  );
}

/** A single option row inside the dropdown list. */
function SelectOption({ opt, selected, active, onPick, onHover }) {
  return (
    <button
      type="button"
      onClick={onPick}
      onMouseEnter={onHover}
      className={`w-full text-left px-3 py-2 border-b border-gray-50 last:border-b-0 flex items-center gap-2 ${active ? 'bg-[#1A5632]/5' : ''} ${selected ? 'bg-[#1A5632]/10' : ''}`}
    >
      {selected ? (
        <Check className="w-3 h-3 text-[#1A5632] flex-shrink-0" />
      ) : (
        <span className="w-3 h-3 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-gray-800 truncate">{opt.label}</div>
        {opt.sub && <div className="text-[10px] text-gray-400 truncate">{opt.sub}</div>}
      </div>
    </button>
  );
}

/** The dropdown panel: search input + scrollable option list + count footer. */
function OptionsPanel({
  inputRef, query, setQuery, onKeyDown, maxHeight,
  filtered, options, value, highlight, setHighlight, onPick,
}) {
  return (
    <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-gray-200 flex flex-col">
      <div className="relative border-b border-gray-100">
        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type to filter…"
          className="w-full text-[12px] pl-9 pr-3 py-2 bg-white outline-none"
        />
      </div>

      <div className={`${maxHeight} overflow-y-auto`}>
        {filtered.length === 0 ? (
          <div className="px-3 py-3 text-[11px] text-gray-400 italic">
            No matches{query ? ` for "${query}"` : ''}
          </div>
        ) : (
          filtered.map((opt, i) => (
            <SelectOption
              key={opt.value}
              opt={opt}
              selected={String(opt.value) === String(value)}
              active={i === highlight}
              onPick={() => onPick(opt)}
              onHover={() => setHighlight(i)}
            />
          ))
        )}
      </div>

      {filtered.length > 0 && (
        <div className="px-3 py-1.5 border-t border-gray-100 text-[9px] text-gray-400 bg-gray-50/50">
          {filtered.length} of {options.length} option{options.length > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

export default function SearchSelect({
  value,
  options,
  onChange,
  placeholder = '— Select —',
  disabled = false,
  allowClear = false,
  filterFn,
  maxHeight = 'max-h-[260px]',
  className = '',
  id,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Memoised lookup of the currently selected option → its label.
  const selectedOption = useMemo(
    () => options.find((o) => String(o.value) === String(value)) || null,
    [options, value]
  );

  // Default filter: case-insensitive substring match across label,
  // sub, and stringified value. Callers can override with `filterFn`.
  const defaultFilter = (opt, q) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    return (
      String(opt.label || '').toLowerCase().includes(needle) ||
      String(opt.sub || '').toLowerCase().includes(needle) ||
      String(opt.value || '').toLowerCase().includes(needle)
    );
  };

  const filtered = useMemo(() => {
    const fn = filterFn || defaultFilter;
    return options.filter((o) => fn(o, query));
  }, [options, query, filterFn]);

  // Reset highlight whenever the filtered list changes so the first
  // visible option is always the active one.
  useEffect(() => { setHighlight(0); }, [query, open]);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  // Auto-focus the search input when the dropdown opens.
  useEffect(() => {
    if (open) {
      // Slight delay so the DOM has mounted the input before focus.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  const pick = (opt) => {
    onChange?.(opt.value);
    setOpen(false);
    setQuery('');
  };

  const handleKey = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt) pick(opt);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <Trigger
        id={id}
        disabled={disabled}
        open={open}
        selectedOption={selectedOption}
        placeholder={placeholder}
        allowClear={allowClear}
        onToggle={() => !disabled && setOpen((v) => !v)}
        onClear={(e) => { e.stopPropagation(); onChange?.(null); }}
      />

      {open && (
        <OptionsPanel
          inputRef={inputRef}
          query={query}
          setQuery={setQuery}
          onKeyDown={handleKey}
          maxHeight={maxHeight}
          filtered={filtered}
          options={options}
          value={value}
          highlight={highlight}
          setHighlight={setHighlight}
          onPick={pick}
        />
      )}
    </div>
  );
}
