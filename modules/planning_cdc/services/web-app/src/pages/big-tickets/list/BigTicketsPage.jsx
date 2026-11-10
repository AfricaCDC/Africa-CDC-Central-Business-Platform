import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { RBAC_MODULES, RBAC_ACTIONS } from '@rbm/lib/rbac';
import { usePermissions } from '@/hooks/usePermissions';
import { usePillars } from '@/hooks/usePillars';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/QueryStates';
import { getErrorMessage } from '@/utils/errorMessage';
import { useBigTicketFilters } from '../hooks/useBigTicketFilters';
import { useBigTickets } from '../hooks/useBigTicketQueries';
import BigTicketsFilters from './BigTicketsFilters';
import BigTicketsKpis from './BigTicketsKpis';
import BigTicketsTable from './BigTicketsTable';
import BigTicketsLayout from '../BigTicketsLayout';
import ExportButton from './ExportButton';

const SCOPE_ALL = 'all';

function ListBody({ query, fiscalYear, quarter, isFiltered }) {
  const { data, isLoading, isError, error, refetch } = query;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState message={getErrorMessage(error, 'Could not load the Big Tickets.')} onRetry={refetch} />;
  const items = data?.items || [];
  if (!items.length) {
    return (
      <EmptyState
        title={isFiltered ? 'No Big Ticket matches these filters' : `No Big Ticket runs in ${fiscalYear}`}
        hint={isFiltered ? 'Clear the filters to see every ticket.' : 'Create one, or pick another year.'}
      />
    );
  }
  return (
    <>
      <BigTicketsKpis items={items} quarter={quarter} />
      <BigTicketsTable items={items} fiscalYear={fiscalYear} />
    </>
  );
}

/**
 * Big Tickets list (D-20261015-02): leadership priorities grouped by AHSS
 * pillar, with the status and performance of the chosen quarter.
 *
 * Route: /big-tickets
 *
 * @returns {JSX.Element}
 * @example <Route path="/big-tickets" element={<BigTicketsPage />} />
 */
export default function BigTicketsPage() {
  const { filters, queryPayload, setFilter, clearAllFilters, activeFilterCount } = useBigTicketFilters();
  const query = useBigTickets(queryPayload);
  const { data: pillars = [] } = usePillars();
  const { getScope } = usePermissions();
  const canManage = getScope(RBAC_MODULES.BIG_TICKET, RBAC_ACTIONS.CREATE) === SCOPE_ALL;
  const canExport = !!getScope(RBAC_MODULES.BIG_TICKET, RBAC_ACTIONS.EXPORT);
  const quarter = query.data?.quarter || filters.quarter;

  return (
    <BigTicketsLayout>
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Leadership priorities · AHSS</p>
          <h1 className="text-[18px] font-semibold text-gray-900">Big Tickets {filters.fy}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canExport && <ExportButton fiscalYear={filters.fy} quarter={quarter} />}
          {canManage && (
            <Link to="/big-tickets/new" className="flex items-center gap-1.5 bg-[#1A5632] px-3 py-2 text-[12px] text-white hover:bg-[#15472a]">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> New Big Ticket
            </Link>
          )}
        </div>
      </header>

      <BigTicketsFilters
        filters={filters}
        quarter={quarter}
        pillars={pillars}
        onChange={setFilter}
        onClear={clearAllFilters}
        activeFilterCount={activeFilterCount}
      />

      <ListBody query={query} fiscalYear={filters.fy} quarter={quarter} isFiltered={activeFilterCount > 0} />
    </div>
    </BigTicketsLayout>
  );
}
