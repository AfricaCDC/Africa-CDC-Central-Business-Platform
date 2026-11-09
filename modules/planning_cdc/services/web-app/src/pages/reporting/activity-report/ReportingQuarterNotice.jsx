import { CalendarCheck } from 'lucide-react';
import { fmtDate } from '@rbm/lib/formatters';

/**
 * Tells the reporter which quarter their activity report counts for, from the
 * open reporting window. When the page shows another quarter, says where the
 * open window is. Renders nothing when no window is open.
 *
 * @param {{quarter: string, fiscalYear: string, openPeriod: object|null}} props
 * @returns {JSX.Element|null}
 * @example <ReportingQuarterNotice quarter="Q3" fiscalYear="2026" openPeriod={period} />
 */
export default function ReportingQuarterNotice({ quarter, fiscalYear, openPeriod }) {
  if (!openPeriod) return null;
  const until = openPeriod.end_date ? ` (open until ${fmtDate(openPeriod.end_date)})` : '';
  const isOpenQuarter = quarter === openPeriod.quarter;
  return (
    <div role="status" className={`border border-t-0 px-5 py-2.5 text-[11px] flex items-start gap-2 ${isOpenQuarter ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-300 text-amber-900'}`}>
      <CalendarCheck className="w-4 h-4 flex-shrink-0 mt-px" />
      <span>
        {isOpenQuarter
          ? <>Activity reports written now count for <strong>{openPeriod.quarter} {fiscalYear}</strong>, the open reporting window{until}.</>
          : <>You are viewing <strong>{quarter} {fiscalYear}</strong>. The open reporting window is <strong>{openPeriod.quarter} {fiscalYear}</strong>{until}: report this period's activities under {openPeriod.quarter}.</>}
      </span>
    </div>
  );
}
