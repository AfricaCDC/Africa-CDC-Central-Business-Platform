import DashboardLayout from '@/components/layout/DashboardLayout';
import SearchSelect from '@/components/shared/SearchSelect';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/QueryStates';
import { usePlanningYear } from '@/contexts/PlanningYearContext';
import { getErrorMessage } from '@/utils/errorMessage';
import { useViewableCountries, useCountryWorkplan } from './hooks/useCountryWorkplanQueries';
import { useCountryWorkplanFilters } from './hooks/useCountryWorkplanFilters';
import CountryWorkplanTable from './CountryWorkplanTable';

function Body({ countryName, country, fiscalYear, page, setPage }) {
  const { data, isLoading, isError, error, refetch } = useCountryWorkplan(country, fiscalYear);
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState message={getErrorMessage(error, 'Could not load the country workplan.')} onRetry={refetch} />;
  const activities = data?.activities || [];
  if (!activities.length) {
    return (
      <EmptyState
        title={`No activity planned in ${countryName} for ${fiscalYear}`}
        hint="Activities appear here when their location is this country (submitted, approved, in execution or closed)."
      />
    );
  }
  return <CountryWorkplanTable activities={activities} page={page} onPage={setPage} />;
}

// No country to offer: the reader of every country has none with activities this year,
// anyone else is outside any country office (the full access list tells them apart).
function NoCountry({ fiscalYear }) {
  const { data: access = [] } = useViewableCountries();
  if (access.length) {
    return <EmptyState title={`No country has activities planned for ${fiscalYear}`} hint="A country appears here once an activity located in it is submitted." />;
  }
  return <EmptyState title="You are not part of a country office" hint="The country workplan is open to the members of a country office." />;
}

/**
 * Country workplan (D-20261028-01): the specific activities planned in a
 * country, whichever unit carries them, for the country office's members and
 * for whoever reads the workplan at scope « all ».
 *
 * @returns {JSX.Element}
 * @example <Route path="/country-workplan" element={<CountryWorkplanPage />} />
 */
export default function CountryWorkplanPage() {
  const { planningYear: fiscalYear } = usePlanningYear();
  // Picker: only the countries with activities this year (a country office member keeps theirs).
  const { data: countries = [], isLoading, isError, error, refetch } = useViewableCountries(true, fiscalYear);
  const { country, page, setCountry, setPage } = useCountryWorkplanFilters(countries.map((c) => c.code));
  const countryName = countries.find((c) => c.code === country)?.name || country;

  let body;
  if (isLoading) body = <LoadingState />;
  else if (isError) body = <ErrorState message={getErrorMessage(error, 'Could not load your countries.')} onRetry={refetch} />;
  else if (!countries.length) body = <NoCountry fiscalYear={fiscalYear} />;
  else body = <Body countryName={countryName} country={country} fiscalYear={fiscalYear} page={page} setPage={setPage} />;

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Country Workplan' }]}>
      <div className="mx-auto max-w-6xl space-y-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[16px] font-semibold text-[#1A5632]">
              Country Workplan{countries.length ? ` · ${countryName}` : ''} · {fiscalYear}
            </h1>
            <p className="text-[11px] text-gray-500">Activities planned in the country by every Africa CDC unit (submitted, approved, in execution or closed).</p>
          </div>
          {countries.length > 1 && (
            <div className="w-72">
              <SearchSelect
                value={country}
                onChange={(v) => v && setCountry(v)}
                options={countries.map((c) => ({ value: c.code, label: c.name }))}
                placeholder="— Country —"
              />
            </div>
          )}
        </div>
        {body}
      </div>
    </DashboardLayout>
  );
}
