import { useEffect, useRef, useState } from 'react';
import { CalendarRange, ChevronDown, Check } from 'lucide-react';
import { usePlanningYear } from '@/contexts/PlanningYearContext';

/**
 * Top-nav fiscal year selector, sitting next to the division switcher.
 *
 * Offers exactly the years that hold a plan, as reported by the server, so a
 * newly loaded generation becomes selectable with no front-end change. Hidden
 * when only one year exists: a switcher with a single option is noise.
 *
 * A year that has not started is labelled as such. The user can still open it
 * to prepare the plan; what they cannot do is report on it, and the reporting
 * screens say so rather than showing empty tables.
 *
 * @returns {JSX.Element|null}
 * @example <FiscalYearSwitcher />
 */
export default function FiscalYearSwitcher() {
  const { planningYear, setPlanningYear, years, reportableYear, isLoading } = usePlanningYear();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // One generation is not a choice, but the year must still be visible: render
  // the same chip the nav used to carry, without the dropdown.
  if (isLoading || years.length <= 1) {
    return (
      <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 bg-white/10 border border-white/20 text-[12px] font-semibold text-white">
        FY {planningYear}
      </div>
    );
  }

  const isFuture = (year) => Number(year) > Number(reportableYear);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Fiscal year ${planningYear}, change`}
        className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-white/90 hover:bg-white/10 border border-white/20 rounded-sm"
      >
        <CalendarRange size={13} />
        <span>FY {planningYear}</span>
        {isFuture(planningYear) && (
          <span className="px-1 text-[9px] uppercase tracking-wide bg-white/20 rounded-sm">Planning</span>
        )}
        <ChevronDown size={12} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 shadow-sm z-50"
        >
          {years.map((year) => (
            <button
              key={year}
              type="button"
              role="option"
              aria-selected={year === planningYear}
              onClick={() => { setPlanningYear(year); setOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-2 text-[11px] text-left text-[#58595B] hover:bg-gray-50"
            >
              <span className="flex flex-col">
                <span className={year === planningYear ? 'font-semibold text-[#1A5632]' : ''}>
                  FY {year}
                </span>
                {isFuture(year) && (
                  <span className="text-[9px] text-gray-400">Not started, planning only</span>
                )}
              </span>
              {year === planningYear && <Check size={13} className="text-[#1A5632]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
