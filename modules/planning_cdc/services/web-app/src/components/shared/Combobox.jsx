/**
 * Combobox — a free-text input with a filter-as-you-type suggestion list.
 *
 * Unlike {@link SearchSelect} (which only lets you pick from a fixed list), a
 * Combobox lets the user type ANY value AND offers suggestions. Used for
 * funding source / grant name (H-3), where the backend returns curated +
 * already-used values but new values are always allowed.
 *
 * Fully controlled: the caller owns `value` (a string) and `onChange(string)`.
 * Typing fires `onChange` with the raw text; clicking a suggestion fires it
 * with that suggestion. The list is just a convenience — the saved value is
 * whatever `value` holds.
 *
 * Design (per CLAUDE.md): flat, grey border, Africa CDC green on focus,
 * text-[12px] body. No rounded corners, no shadows.
 *
 * Props:
 *   value       string                  — current text value
 *   onChange    (next: string) => void
 *   options     string[]                — suggestion list
 *   placeholder string
 *   disabled    bool
 *   id          string                  — passed to the input for <label htmlFor>
 *   maxHeight   string                  — tailwind class for the dropdown height
 *   className   string                  — extra classes on the outer container
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function Combobox({
  value,
  onChange,
  options = [],
  placeholder = '',
  disabled = false,
  id,
  maxHeight = 'max-h-[220px]',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef(null);
  const text = value || '';

  // Substring filter on the suggestions; empty input shows the full list.
  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    const base = options.filter(Boolean);
    return q ? base.filter((o) => o.toLowerCase().includes(q)) : base;
  }, [options, text]);

  // Reset the active row whenever the list or open-state changes.
  useEffect(() => { setHighlight(0); }, [text, open]);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    const onDocKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onDocKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onDocKey);
    };
  }, [open]);

  const pick = (v) => { onChange?.(v); setOpen(false); };

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && open && filtered[highlight]) {
      e.preventDefault();
      pick(filtered[highlight]);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          id={id}
          type="text"
          value={text}
          disabled={disabled}
          onChange={(e) => { onChange?.(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full text-[12px] border border-gray-300 px-3 py-2 pr-8 bg-white outline-none focus:border-[#1A5632] disabled:bg-gray-50 disabled:text-gray-400"
        />
        <ChevronDown
          onClick={() => !disabled && setOpen((v) => !v)}
          className={`w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </div>

      {open && filtered.length > 0 && (
        <div className={`absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-gray-200 overflow-y-auto ${maxHeight}`}>
          {filtered.map((o, i) => (
            <button
              key={o}
              type="button"
              onClick={() => pick(o)}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full text-left px-3 py-2 text-[12px] border-b border-gray-50 last:border-b-0 ${i === highlight ? 'bg-[#1A5632]/5' : ''} ${o === text ? 'bg-[#1A5632]/10 text-[#1A5632]' : 'text-gray-800'}`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
