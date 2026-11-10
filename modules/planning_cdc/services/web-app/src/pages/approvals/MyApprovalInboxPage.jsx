import { useApprovalInboxFilters } from './hooks/useApprovalInboxFilters';
import { useApprovalInbox } from './hooks/useApprovalQueries';
import ApprovalInboxFilters from './ApprovalInboxFilters';
import ApprovalInboxTable from './ApprovalInboxTable';

const DEFAULT_ERROR = 'Could not load the approval inbox.';

function getErrorMessage(error) {
  if (!error) return DEFAULT_ERROR;
  const apiMessage = error.response?.data?.message;
  if (apiMessage) return apiMessage;
  return error.message || DEFAULT_ERROR;
}

function extractRows(data) {
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data?.items)) return data.data.items;
  return [];
}

function extractTotal(data, fallback) {
  if (typeof data?.total === 'number') return data.total;
  if (typeof data?.data?.total === 'number') return data.data.total;
  return fallback;
}

function filterCountSuffix(count) {
  return count > 0 ? `${count} filter(s) active.` : '';
}

function LoadingRow() {
  return (
    <div className="border border-gray-200 bg-white p-6 text-center text-[12px] text-gray-500">
      Loading…
    </div>
  );
}

function ErrorRow({ error, onRetry }) {
  return (
    <div className="border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
      {getErrorMessage(error)}{' '}
      <button type="button" onClick={onRetry} className="ml-2 underline">Retry</button>
    </div>
  );
}

function Pagination({ page, totalPages, onPage }) {
  return (
    <nav className="mt-2 flex items-center justify-end gap-2 text-[11px]">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="border border-gray-300 bg-white px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Prev
      </button>
      <span className="text-gray-600">Page {page} of {totalPages}</span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        className="border border-gray-300 bg-white px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Next
      </button>
    </nav>
  );
}

/**
 * Container page for the approval inbox. All data fetching goes through the
 * `useApprovalInbox` hook (CHARTER §3); filters live on `useSearchParams`
 * via `useApprovalInboxFilters` (§4).
 *
 * Route: `/approvals/inbox` (spec §9.1).
 *
 * @returns {JSX.Element}
 */
export default function MyApprovalInboxPage() {
  const { filters, queryPayload, setFilter, clearAllFilters, activeFilterCount } = useApprovalInboxFilters();
  const { data, isLoading, isError, error, refetch } = useApprovalInbox(queryPayload);

  const rows = extractRows(data);
  const total = extractTotal(data, rows.length);
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));

  return (
    <div className="mx-auto max-w-6xl p-4">
      <header className="mb-3">
        <h1 className="text-[14px] font-semibold text-gray-800">My approval inbox</h1>
        <p className="text-[11px] text-gray-500">
          Contributor reports awaiting your decision. {filterCountSuffix(activeFilterCount)}
        </p>
      </header>

      <ApprovalInboxFilters
        filters={filters}
        onChange={setFilter}
        onClear={clearAllFilters}
        activeFilterCount={activeFilterCount}
      />

      <div className="mt-3">
        {isLoading && <LoadingRow />}
        {isError && <ErrorRow error={error} onRetry={refetch} />}
        {!isLoading && !isError && <ApprovalInboxTable rows={rows} />}
      </div>

      {total > filters.pageSize && (
        <Pagination
          page={filters.page}
          totalPages={totalPages}
          onPage={(p) => setFilter('page', p)}
        />
      )}
    </div>
  );
}
