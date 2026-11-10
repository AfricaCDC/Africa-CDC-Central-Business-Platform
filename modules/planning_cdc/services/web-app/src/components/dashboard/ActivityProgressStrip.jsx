import { Link } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { useActivityProgress } from '@/hooks/useDashboardQueries';

/** The four report states, in reading order. */
export const PROGRESS_STATES = [
  { key: 'approved', label: 'Reported, approved', color: 'bg-[#1A5632]' },
  { key: 'in_review', label: 'Reported, in review', color: 'bg-[#348F41]' },
  { key: 'draft', label: 'Draft or returned', color: 'bg-[#E8A838]' },
  { key: 'not_reported', label: 'No report yet', color: 'bg-gray-300' },
];

/**
 * Implementation of the specific activities from their activity reports:
 * share reported, and the split approved / in review / draft / no report.
 *
 * @param {{ fiscalYear: string, division?: string }} props
 * @returns {JSX.Element|null}
 * @example <ActivityProgressStrip fiscalYear="2026" division="EPR" />
 */
export default function ActivityProgressStrip({ fiscalYear, division }) {
  const { data: p, isLoading, isError } = useActivityProgress(fiscalYear, division);
  if (isError) return null;
  return (
    <section className="border border-gray-200 border-t-0 bg-white">
      <header className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
        <ClipboardList className="h-3.5 w-3.5 text-[#1A5632]" />
        <h3 className="text-[12px] font-semibold text-gray-800">Activity implementation</h3>
        <span className="text-[10px] text-gray-500">from the activity reports</span>
        <Link to="/activity-report" className="ml-auto text-[10px] font-medium text-[#1A5632] hover:underline">Activity reports</Link>
      </header>
      {isLoading || !p ? <div className="m-4 h-12 animate-pulse bg-gray-100" aria-label="Loading activity implementation" /> : (
        <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
          <div className="md:w-48">
            <div className="text-[26px] font-bold leading-none text-[#1A5632]">{p.reported_pct ?? 0}%</div>
            <div className="mt-1 text-[10px] text-gray-500">{p.approved + p.in_review} of {p.total} specific activities reported</div>
          </div>
          <div className="flex-1">
            <div className="flex h-2.5 w-full overflow-hidden bg-gray-100">
              {PROGRESS_STATES.map((s) => <div key={s.key} className={s.color} style={{ width: `${p.total ? (p[s.key] / p.total) * 100 : 0}%` }} />)}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-gray-600">
              {PROGRESS_STATES.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5"><span className={`inline-block h-2 w-2 ${s.color}`} />{s.label} <strong className="text-gray-900">{p[s.key]}</strong></span>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
