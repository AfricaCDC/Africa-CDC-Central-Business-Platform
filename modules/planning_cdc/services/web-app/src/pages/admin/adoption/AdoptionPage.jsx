import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/QueryStates';
import { useDivisionCodes } from '@/hooks/useMiscQueries';
import { useAdoption } from './hooks/useAdoptionQueries';
import { useAdoptionFilters } from './hooks/useAdoptionFilters';
import AdoptionSummary from './AdoptionSummary';
import AdoptionFilters from './AdoptionFilters';
import AdoptionTable from './AdoptionTable';

const isRefusal = (error) => error?.response?.status === 403;

function AdoptionBody({ query, filters, setFilter, onOpen }) {
  const { data, isLoading, error, refetch } = query;
  if (isLoading) return <LoadingState />;
  if (error) {
    return isRefusal(error)
      ? <ErrorState message="You do not have access to the adoption of the platform." />
      : <ErrorState message="The adoption figures could not be loaded." onRetry={refetch} />;
  }
  if (!data.rows.length) return <EmptyState title="No user matches these filters" hint="Clear a filter to see more users." />;
  return (
    <AdoptionTable rows={data.rows} total={data.total} page={filters.page} pageSize={data.page_size}
      onPage={(p) => setFilter('page', p)} onOpen={onOpen} />
  );
}

/**
 * Adoption of the platform (D-20261106-03): who never signed in, who has not
 * taken or skipped the tour, who never submitted anything, to follow up.
 *
 * @returns {JSX.Element}
 * @example <Route path="/admin/adoption" element={<AdoptionPage />} />
 */
export default function AdoptionPage() {
  const navigate = useNavigate();
  const { filters, queryPayload, setFilter, clearAllFilters, activeFilterCount } = useAdoptionFilters();
  const query = useAdoption(queryPayload);
  const { data: units = [] } = useDivisionCodes();
  const handleOpenUser = (user) => navigate(`/admin/users?q=${encodeURIComponent(user.email)}`);

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/dashboard' }, { label: 'Adoption' }]}>
      <h1 className="text-[15px] font-semibold text-[#1A5632]">Adoption</h1>
      <p className="text-[11px] text-gray-500 mb-4">Active users: last sign-in, onboarding tour and what they submitted. Click a row to open the user.</p>
      {query.data?.summary && (
        <AdoptionSummary summary={query.data.summary} recentDays={query.data.recent_days} activeFilter={filters.filter}
          onFilter={(f) => setFilter('filter', f)} />
      )}
      <AdoptionFilters filters={filters} units={units} onChange={setFilter} onClear={clearAllFilters} activeCount={activeFilterCount} />
      <AdoptionBody query={query} filters={filters} setFilter={setFilter} onOpen={handleOpenUser} />
    </DashboardLayout>
  );
}
