import { Navigate, useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/QueryStates';
import Pagination from '@/components/shared/Pagination';
import { usePlanningYear } from '@/contexts/PlanningYearContext';
import { useBudgetCodes } from '@/hooks/useBudgetQueries';
import { fmtBudget as fmt } from '@rbm/lib/formatters';
import { fundingByUnit, shareOf, DONOR_PAGE_SIZE } from './donorFunding';
import { usePageParam } from './usePageParam';

function UnitBars({ units, total }) {
  return (
    <div className="bg-white border border-gray-200 border-t-0 px-5 py-4">
      <h3 className="text-[12px] font-semibold text-gray-800 mb-3">Funding by Business Unit</h3>
      <div className="space-y-2">
        {units.map((u) => (
          <div key={u.unit} className="flex items-center gap-3 text-[11px]">
            <span className="w-[220px] truncate text-gray-700" title={u.unit}>{u.unit}</span>
            <div className="flex-1 h-[8px] bg-gray-100"><div className="h-full bg-[#1A5632]" style={{ width: `${shareOf(u.amount, total)}%` }} /></div>
            <span className="w-[110px] text-right font-semibold">{fmt(u.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CodesTable({ codes, onOpen }) {
  return (
    <table className="w-full text-[11px]">
      <thead className="bg-gray-50 text-[10px] uppercase text-gray-500">
        <tr>
          <th className="text-left px-5 py-2">Budget code</th>
          <th className="text-left px-3 py-2">Broad activity</th>
          <th className="text-left px-3 py-2">Business Unit</th>
          <th className="text-right px-5 py-2">Amount</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {codes.map((c) => (
          <tr key={c.id} onClick={() => onOpen(c)} className="cursor-pointer hover:bg-gray-50">
            <td className="px-5 py-2 font-mono">{c.budget_code || '—'}</td>
            <td className="px-3 py-2"><span className="font-mono text-[#1A5632] mr-1.5">{c.broad_code}</span>{c.broad_title}</td>
            <td className="px-3 py-2 text-gray-600">{c.division_name || '—'}</td>
            <td className="px-5 py-2 text-right font-semibold">{fmt(Number(c.amount || 0))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * What one funding source pays for in the plan year: its budget codes, by
 * Business Unit and one by one. A row opens the broad activity.
 *
 * @returns {JSX.Element}
 */
export default function DonorDetailPage() {
  const { sourceId } = useParams();
  const navigate = useNavigate();
  const { planningYear } = usePlanningYear();
  const [page, setPage] = usePageParam();
  const id = Number(sourceId);
  const { data: all = [], isLoading, isError, refetch } = useBudgetCodes(planningYear);
  // Old links used donor names (« worldbank »): send them to the list.
  if (!Number.isInteger(id)) return <Navigate to="/reporting/donors" replace />;

  const codes = all.filter((c) => Number(c.funding_source_id) === id);
  const name = codes[0]?.funding_source_name || 'Funding source';
  const total = codes.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const totalPages = Math.max(1, Math.ceil(codes.length / DONOR_PAGE_SIZE));
  const shown = codes.slice((page - 1) * DONOR_PAGE_SIZE, page * DONOR_PAGE_SIZE);
  const breadcrumbs = [{ label: 'Reporting' }, { label: 'Donors & Reports', path: '/reporting/donors' }, { label: name }];

  let body;
  if (isLoading) body = <LoadingState />;
  else if (isError) body = <ErrorState message="This funding source could not be loaded." onRetry={refetch} />;
  else if (!codes.length) body = <EmptyState title={`No budget code of ${planningYear} is funded by this source`} hint="Pick another plan year or another funding source." />;
  else {
    body = (
      <>
        <UnitBars units={fundingByUnit(codes)} total={total} />
        <div className="bg-white border border-gray-200 border-t-0">
          <CodesTable codes={shown} onOpen={(c) => navigate(`/plan/node/${c.plan_node_id}`)} />
          {codes.length > DONOR_PAGE_SIZE && <Pagination page={page} totalPages={totalPages} onPage={setPage} />}
        </div>
      </>
    );
  }

  return (
    <DashboardLayout breadcrumbs={breadcrumbs}>
      <div className="bg-[#1A5632] text-white px-6 py-5">
        <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">Plan {planningYear}</span>
        <h1 className="text-[20px] font-semibold mt-2">{name}</h1>
        <p className="text-[12px] text-white/70 mt-1">{codes.length} budget codes · {fmt(total)}</p>
      </div>
      {body}
    </DashboardLayout>
  );
}
