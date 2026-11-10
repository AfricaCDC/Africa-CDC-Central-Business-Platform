import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/QueryStates';
import Pagination from '@/components/shared/Pagination';
import { usePlanningYear } from '@/contexts/PlanningYearContext';
import { useBudgetCodes } from '@/hooks/useBudgetQueries';
import { fmtBudget as fmt } from '@rbm/lib/formatters';
import { fundingBySource, shareOf, DONOR_PAGE_SIZE } from './donorFunding';
import { usePageParam } from './usePageParam';

const BREADCRUMBS = [{ label: 'Reporting' }, { label: 'Donors & Reports' }];

function SourcesTable({ sources, total, onOpen }) {
  return (
    <table className="w-full text-[11px]">
      <thead className="bg-gray-50 text-[10px] uppercase text-gray-500">
        <tr>
          <th className="text-left px-5 py-2">Funding source</th>
          <th className="text-right px-3 py-2">Broad activities</th>
          <th className="text-right px-3 py-2">Budget codes</th>
          <th className="text-right px-5 py-2">Amount</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {sources.map((s) => (
          <tr key={s.id} onClick={() => onOpen(s)} className="cursor-pointer hover:bg-gray-50">
            <td className="px-5 py-2.5">
              <div className="text-[12px] font-semibold text-gray-900">{s.name}</div>
              <div className="mt-1 h-[6px] max-w-[300px] bg-gray-100"><div className="h-full bg-[#1A5632]" style={{ width: `${shareOf(s.amount, total)}%` }} /></div>
            </td>
            <td className="px-3 py-2.5 text-right">{s.activities}</td>
            <td className="px-3 py-2.5 text-right">{s.codes}</td>
            <td className="px-5 py-2.5 text-right font-semibold">{fmt(s.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Donors & Reports: the funding sources of the plan year, from its budget
 * codes. A row opens what the source funds.
 *
 * @returns {JSX.Element}
 */
export default function DonorsPage() {
  const navigate = useNavigate();
  const { planningYear } = usePlanningYear();
  const [page, setPage] = usePageParam();
  const { data: codes = [], isLoading, isError, refetch } = useBudgetCodes(planningYear);
  const sources = fundingBySource(codes);
  const total = sources.reduce((sum, s) => sum + s.amount, 0);
  const totalPages = Math.max(1, Math.ceil(sources.length / DONOR_PAGE_SIZE));
  const shown = sources.slice((page - 1) * DONOR_PAGE_SIZE, page * DONOR_PAGE_SIZE);

  let body;
  if (isLoading) body = <LoadingState />;
  else if (isError) body = <ErrorState message="The funding sources could not be loaded." onRetry={refetch} />;
  else if (!sources.length) body = <EmptyState title={`No budget code of ${planningYear} has a funding source yet`} hint="Funding sources are set on the budget codes of the broad activities." />;
  else {
    body = (
      <div className="bg-white border border-gray-200 border-t-0">
        <SourcesTable sources={shown} total={total} onOpen={(s) => navigate(`/reporting/donors/${s.id}`)} />
        {sources.length > DONOR_PAGE_SIZE && <Pagination page={page} totalPages={totalPages} onPage={setPage} />}
      </div>
    );
  }

  return (
    <DashboardLayout breadcrumbs={BREADCRUMBS}>
      <div className="bg-[#1A5632] text-white px-6 py-5">
        <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">Plan {planningYear}</span>
        <h1 className="text-[20px] font-semibold mt-2">Donors &amp; Reports</h1>
        <p className="text-[12px] text-white/70 mt-1">{sources.length} funding sources · {fmt(total)} on the budget codes</p>
      </div>
      {body}
    </DashboardLayout>
  );
}
