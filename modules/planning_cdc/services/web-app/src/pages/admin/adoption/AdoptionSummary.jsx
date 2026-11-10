import { ADOPTION_FILTERS } from '@rbm/lib/enums';

/**
 * Adoption counters over every active user. The counters that match a
 * filter apply it when clicked.
 *
 * @param {{ summary: object, recentDays: number, activeFilter: string, onFilter: (filter: string) => void }} props
 * @returns {JSX.Element}
 * @example <AdoptionSummary summary={data.summary} recentDays={30} activeFilter="" onFilter={setStatus} />
 */
export default function AdoptionSummary({ summary, recentDays, activeFilter, onFilter }) {
  const tiles = [
    { label: 'Active users', value: summary.users },
    { label: `Signed in, last ${recentDays} days`, value: summary.signed_in_recently },
    { label: 'Never signed in', value: summary.never_signed_in, filter: ADOPTION_FILTERS.NEVER_SIGNED_IN },
    { label: 'Tour not taken', value: summary.users - summary.tour_taken, filter: ADOPTION_FILTERS.NO_TOUR },
    { label: 'Tour skipped', value: summary.tour_skipped, filter: ADOPTION_FILTERS.TOUR_SKIPPED },
    { label: 'Never submitted', value: summary.never_submitted, filter: ADOPTION_FILTERS.NEVER_SUBMITTED },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border border-gray-200 bg-white mb-4">
      {tiles.map((t) => {
        const isActive = t.filter && t.filter === activeFilter;
        const body = (
          <>
            <div className="text-[10px] uppercase tracking-wide text-gray-500">{t.label}</div>
            <div className={`text-[20px] font-semibold ${isActive ? 'text-[#1A5632]' : 'text-gray-900'}`}>{t.value}</div>
          </>
        );
        const cls = `text-left px-4 py-3 border-gray-100 border-r border-b ${isActive ? 'bg-[#1A5632]/5' : ''}`;
        return t.filter ? (
          <button key={t.label} type="button" onClick={() => onFilter(isActive ? '' : t.filter)} className={`${cls} hover:bg-[#F5F7FA]`} aria-pressed={isActive}>
            {body}
          </button>
        ) : <div key={t.label} className={cls}>{body}</div>;
      })}
    </div>
  );
}
