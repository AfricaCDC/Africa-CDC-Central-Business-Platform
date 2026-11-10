import { Printer } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/QueryStates';
import { getErrorMessage } from '@/utils/errorMessage';
import { useDigestDirectorates, useDigest } from './hooks/useDigestQueries';
import { useDigestFilters } from './hooks/useDigestFilters';
import DigestSections from './DigestSections';

function Header({ directorates, directorate, onChange, digest }) {
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[18px] font-semibold text-[#1A5632]">Monthly digest{digest ? `: ${digest.directorate.name}` : ''}</h1>
        <p className="text-[11px] text-gray-600">
          Situation on {today}{digest ? ` · ${digest.units.length} units · ${digest.fiscal_year}, ${digest.quarter} reporting` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2 print:hidden">
        {directorates.length > 1 && (
          <select aria-label="Choose a directorate" value={directorate || ''} onChange={(e) => onChange(e.target.value)}
            className="border border-gray-300 bg-white px-2 py-1 text-[11px]">
            {directorates.map((d) => <option key={d.code} value={d.code}>{d.code} {d.name}</option>)}
          </select>
        )}
        <button type="button" onClick={() => window.print()} disabled={!digest}
          className="flex items-center gap-1 border border-[#1A5632] px-3 py-1 text-[11px] text-[#1A5632] hover:bg-[#1A5632] hover:text-white disabled:opacity-40">
          <Printer className="h-3.5 w-3.5" /> Print or save as PDF
        </button>
      </div>
    </div>
  );
}

/**
 * Monthly digest of a directorate (D-20261105-15): its plan, what waits for
 * a decision, the high-risk activities, the reports of the quarter and the
 * budget execution. Directors receive the link each month; the page prints
 * on A4 (the browser saves it as PDF).
 *
 * @returns {JSX.Element}
 * @example <Route path="/digest" element={<DigestPage />} />
 */
export default function DigestPage() {
  const dirs = useDigestDirectorates();
  const directorates = dirs.data || [];
  const { directorate, setDirectorate } = useDigestFilters(directorates);
  const { data, isLoading, error, refetch } = useDigest(directorate);

  const body = () => {
    if (dirs.isLoading || isLoading) return <LoadingState />;
    if (dirs.error) return <ErrorState message={getErrorMessage(dirs.error, 'The directorates could not be loaded.')} onRetry={() => dirs.refetch()} />;
    if (!directorate) return <EmptyState title="No digest for you" hint="The digest is for the Responsible Person of a directorate and for the administrators." />;
    if (error) {
      const isRefused = [403, 404].includes(error.response?.status);
      return <ErrorState message={getErrorMessage(error, 'The digest could not be loaded.')} onRetry={isRefused ? undefined : () => refetch()} />;
    }
    return <DigestSections digest={data} />;
  };

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Monthly digest' }]}>
      <div className="max-w-5xl space-y-3">
        <Header directorates={directorates} directorate={directorate} onChange={setDirectorate} digest={data} />
        {body()}
      </div>
    </DashboardLayout>
  );
}
