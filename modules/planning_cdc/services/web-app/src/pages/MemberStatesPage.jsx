import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, MapPin, Search } from 'lucide-react';
import { AU_MEMBER_STATES, AU_REGIONS } from '@rbm/lib/countries';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useMemberStateFilters } from '@/hooks/filters/useMemberStateFilters';
import { useViewableCountries } from '@/pages/country-workplan/hooks/useCountryWorkplanQueries';

const REGION_COLORS = Object.freeze({ Northern: '#2563EB', Eastern: '#059669', Western: '#E8A838', Central: '#9F2241', Southern: '#7C3AED' });
const BY_NAME = [...AU_MEMBER_STATES].sort((a, b) => a.name.localeCompare(b.name));
const REGION_COUNTS = AU_REGIONS
  .map((region) => [region, AU_MEMBER_STATES.filter((s) => s.region === region).length])
  .sort((a, b) => b[1] - a[1]);
const CARD = 'flex items-center gap-2.5 px-4 py-2.5 border-r border-b border-gray-100';

function StateCard({ state, hasWorkplan }) {
  const body = (
    <>
      <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: REGION_COLORS[state.region] }} />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-gray-900 truncate">{state.name}</div>
        <div className="text-[10px] text-gray-400">{state.code} · {state.region}</div>
      </div>
      {hasWorkplan && <span className="flex items-center text-[10px] font-medium text-[#1A5632]">Workplan<ChevronRight className="w-3 h-3" /></span>}
    </>
  );
  if (!hasWorkplan) return <div className={CARD}>{body}</div>;
  return <Link to={`/country-workplan?country=${state.code}`} className={`${CARD} hover:bg-[#F5F7FA]`}>{body}</Link>;
}

/**
 * The 55 African Union member states (`@rbm/lib/countries`) by region, with
 * a search on name or ISO code. A country with activities the user can see
 * opens its Country Workplan. Filters live in the URL (`q`, `region`).
 *
 * @returns {JSX.Element}
 * @example <Route path="/reference/member-states" element={<MemberStatesPage />} />
 */
export default function MemberStatesPage() {
  const { filters, setFilter, clearAllFilters, activeFilterCount } = useMemberStateFilters();
  const { data: countries = [] } = useViewableCountries(true);
  const withWorkplan = useMemo(() => new Set(countries.map((c) => c.code)), [countries]);

  const shown = useMemo(() => {
    const needle = filters.q.trim().toLowerCase();
    return BY_NAME.filter((s) => (!filters.region || s.region === filters.region)
      && (!needle || s.name.toLowerCase().includes(needle) || s.code.toLowerCase() === needle));
  }, [filters]);

  const handleRegion = (region) => setFilter('region', filters.region === region ? '' : region);

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Reference' }, { label: 'Member States' }]}>
      <div className="bg-[#1A5632] text-white">
        <div className="px-6 py-5">
          <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">African Union</span>
          <h1 className="text-[20px] font-semibold mt-2">Member States</h1>
        </div>
        <div className="border-t border-white/15 px-6 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px] text-white/70">
          <span><strong className="text-white">{AU_MEMBER_STATES.length}</strong> Member States</span>
          <span><strong className="text-white">{REGION_COUNTS.length}</strong> RCC regions</span>
          <span><strong className="text-white">{withWorkplan.size}</strong> with a Country Workplan</span>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 border border-gray-200 border-t-0 bg-white">
        {REGION_COUNTS.map(([region, count]) => (
          <button key={region} type="button" onClick={() => handleRegion(region)} aria-pressed={filters.region === region}
            className={`px-4 py-3 text-center border-r border-b border-gray-200 ${filters.region === region ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
            <div className="text-[22px] font-bold text-gray-900">{count}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: REGION_COLORS[region] }}>{region} RCC</div>
          </button>
        ))}
      </div>
      <div className="bg-white border border-gray-200 border-t-0">
        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-3">
          <div className="relative flex-1 max-w-[300px]">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={filters.q} onChange={(e) => setFilter('q', e.target.value)} placeholder="Country or ISO code" aria-label="Search member states"
              className="w-full text-[12px] border border-gray-200 pl-8 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1A5632]" />
          </div>
          {activeFilterCount > 0 && <button type="button" onClick={clearAllFilters} className="text-[10px] text-[#1A5632] hover:underline font-medium">Clear</button>}
          <span className="text-[11px] text-gray-400 ml-auto">{shown.length} {shown.length === 1 ? 'country' : 'countries'}</span>
        </div>
        {shown.length === 0 ? (
          <div className="py-10 text-center text-[12px] text-gray-500">No member state matches &quot;{filters.q}&quot;.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {shown.map((s) => <StateCard key={s.code} state={s} hasWorkplan={withWorkplan.has(s.code)} />)}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
