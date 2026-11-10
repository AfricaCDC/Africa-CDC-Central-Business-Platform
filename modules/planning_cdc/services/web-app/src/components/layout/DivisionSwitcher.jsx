/* eslint-disable no-unused-vars --
 * Legacy file with baseline debt from pre-guardrails era. Scheduled refactor:
 * T-42..T-49 (TanStack Query migration). Do NOT add new violations; this pragma is a ceiling.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Building2, ChevronDown, Check } from 'lucide-react';
import { useActiveDivision } from '@/contexts/ActiveDivisionContext';
import { ORG_LEVEL_TYPES } from '@rbm/lib/enums';

/**
 * Top-nav division selector. Visible only when the current user has
 * access to more than one division (director, multi-focal, etc.).
 *
 * - Shows the currently active division name.
 * - Click opens a dropdown with every accessible division grouped by
 *   directorate → divisions, plus an "All my divisions" entry that
 *   resets the filter.
 */
export default function DivisionSwitcher() {
  const { divisions, activeDivision, activeCode, setActiveDivision, loaded } = useActiveDivision();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!loaded || divisions.length <= 1) return null;

  const directorates = divisions.filter((d) => d.level_type === ORG_LEVEL_TYPES.DIRECTORATE);
  const plainDivisions = divisions.filter((d) => d.level_type !== ORG_LEVEL_TYPES.DIRECTORATE && !d.alias_of);

  const activeLabel = activeDivision
    ? activeDivision.division_name
    : 'All my divisions';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-white/90 hover:bg-white/10 border border-white/20 rounded-sm"
      >
        <Building2 className="w-3.5 h-3.5" />
        <span className="max-w-[180px] truncate">{activeLabel}</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 bg-white border border-gray-200 shadow-lg py-1 min-w-[280px] max-h-[480px] overflow-y-auto">
          <button
            onClick={() => { setActiveDivision(null); setOpen(false); }}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[11px] text-gray-700 hover:bg-gray-50 text-left border-b border-gray-100"
          >
            <span className="font-semibold">All my divisions</span>
            {activeCode === null && <Check className="w-3.5 h-3.5 text-[#1A5632]" />}
          </button>

          {directorates.length > 0 && (
            <>
              <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-gray-400 font-semibold bg-gray-50">Directorates</div>
              {directorates.map((d) => (
                <button
                  key={d.code}
                  onClick={() => { setActiveDivision(d.code); setOpen(false); }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] text-gray-700 hover:bg-gray-50 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] text-purple-700 bg-purple-50 px-1 py-0.5 font-bold">{d.code}</span>
                    <span className="truncate max-w-[180px]">{d.division_name}</span>
                  </div>
                  {activeCode === d.code && <Check className="w-3.5 h-3.5 text-[#1A5632]" />}
                </button>
              ))}
            </>
          )}

          {plainDivisions.length > 0 && (
            <>
              <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-gray-400 font-semibold bg-gray-50 border-t border-gray-100">Divisions</div>
              {plainDivisions.map((d) => (
                <button
                  key={d.code}
                  onClick={() => { setActiveDivision(d.code); setOpen(false); }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] text-gray-700 hover:bg-gray-50 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] text-gray-500 bg-gray-100 px-1 py-0.5 font-bold">{d.code}</span>
                    <span className="truncate max-w-[180px]">{d.division_name}</span>
                    {d.parent_code && <span className="text-[9px] text-gray-400">↳ {d.parent_code}</span>}
                  </div>
                  {activeCode === d.code && <Check className="w-3.5 h-3.5 text-[#1A5632]" />}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
