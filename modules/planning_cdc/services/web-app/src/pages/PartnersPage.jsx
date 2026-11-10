import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/QueryStates';
import { usePartners } from '@/hooks/useMiscQueries';

const BREADCRUMBS = [{ label: 'Reference' }, { label: 'Partners' }];

/**
 * Partners page: the implementing and funding partners of Africa CDC. What
 * each source funds is on Donors & Reports, from the budget codes
 * (D-20261106-13).
 *
 * @returns {JSX.Element}
 */
export default function PartnersPage() {
  const { data: partners = [], isLoading, isError, refetch } = usePartners();

  let body;
  if (isLoading) body = <LoadingState />;
  else if (isError) body = <ErrorState message="The partners could not be loaded." onRetry={refetch} />;
  else if (!partners.length) body = <EmptyState title="No partners are configured" />;
  else {
    body = (
      <div className="bg-white border border-gray-200 border-t-0 divide-y divide-gray-100">
        {partners.map((p) => (
          <div key={p.id} className="px-5 py-3 flex items-center gap-2">
            <span className="text-[13px] font-semibold text-gray-900">{p.partner_name}</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 uppercase">{p.partner_type}</span>
            {p.has_dedicated_rf ? <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600">Results Framework</span> : null}
          </div>
        ))}
      </div>
    );
  }

  return (
    <DashboardLayout breadcrumbs={BREADCRUMBS}>
      <div className="bg-[#1A5632] text-white px-6 py-5">
        <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">Implementing Partners</span>
        <h1 className="text-[20px] font-semibold mt-2">Partners &amp; Donors</h1>
        <p className="text-[12px] text-white/70 mt-1">
          {partners.length} partners · funding by source on <Link to="/reporting/donors" className="underline text-white">Donors &amp; Reports</Link>
        </p>
      </div>
      {body}
    </DashboardLayout>
  );
}
