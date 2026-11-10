import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import SearchSelect from '@/components/shared/SearchSelect';
import { LoadingState, ErrorState } from '@/components/shared/QueryStates';
import { getErrorMessage } from '@/utils/errorMessage';
import { useFullPlanData } from '@/hooks/usePlanNodeQueries';
import BudgetExecutionLayout from '../BudgetExecutionLayout';
import { useUnlinkedFundCenters, useLinkFundCenter } from '../hooks/useBudgetExecutionQueries';
import { money, day, YEAR_OPTIONS } from '../config';

const NUM = 'px-3 py-2.5 text-right text-[11px] tabular-nums whitespace-nowrap text-gray-800';
const TH = 'px-3 py-2 text-[10px] font-semibold uppercase text-gray-500';

function LinkRow({ item, options, fiscalYear, importId }) {
  const [choice, setChoice] = useState(item.suggestion?.id || null);
  const link = useLinkFundCenter();
  const handleLink = async () => {
    try {
      await link.mutateAsync({ fund_center: item.fund_center, plan_node_id: choice, fiscal_year: fiscalYear, import_id: importId });
      toast.success(`${item.fund_center} linked`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not link this budget code.'));
    }
  };
  return (
    <tr className="border-b border-gray-100 align-top">
      <td className="px-3 py-2.5">
        <div className="font-mono text-[11px] font-semibold text-gray-900">{item.fund_center}</div>
        <div className="text-[10px] text-gray-500">{item.text || '—'} · {item.funds.join(', ')}</div>
      </td>
      <td className={NUM}>{money(item.released_budget)}</td>
      <td className={NUM}>{money(item.committed)}</td>
      <td className={NUM}>{money(item.spent)}</td>
      <td className="min-w-[320px] px-3 py-2">
        <SearchSelect value={choice} options={options} onChange={setChoice} placeholder="Choose the broad activity" allowClear />
        {item.suggestion && choice === item.suggestion.id && <div className="mt-1 text-[10px] text-amber-700">Suggested from the export text: check before linking</div>}
      </td>
      <td className="px-3 py-2">
        <button type="button" disabled={!choice || link.isPending} onClick={handleLink}
          className="bg-[#1A5632] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#14442A] disabled:opacity-50">
          {link.isPending ? 'Linking…' : 'Link'}
        </button>
      </td>
    </tr>
  );
}

/**
 * Budget codes (MIS fund centers) that no activity is linked to yet, with a
 * suggested activity to confirm (D-20261015-04). Linking adds the code to the
 * activity's budget codes.
 *
 * Route: /budget-execution/unlinked?fy=2026
 *
 * @returns {JSX.Element}
 * @example <Route path="/budget-execution/unlinked" element={<UnlinkedFundCentersPage />} />
 */
export default function UnlinkedFundCentersPage() {
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));
  const params = useMemo(() => ({ fiscal_year: fiscalYear }), [fiscalYear]);
  const { data, isLoading, isError, error, refetch } = useUnlinkedFundCenters(params);
  const { data: plan } = useFullPlanData(fiscalYear);
  const options = useMemo(() => (plan?.broads || []).map((b) => ({
    value: b.id, label: `${b.code} — ${b.title}`, sub: b.responsible_division_code || '',
  })), [plan]);

  let body;
  if (isLoading) body = <LoadingState />;
  else if (isError) body = <ErrorState message={getErrorMessage(error, 'Could not load the unlinked budget codes.')} onRetry={refetch} />;
  else if (!data?.import) body = <div className="border border-gray-200 bg-white px-6 py-10 text-center text-[12px] text-gray-500">No budget execution imported for {fiscalYear} yet.</div>;
  else if (!data.items.length) body = <div className="border border-gray-200 bg-white px-6 py-10 text-center text-[12px] text-gray-500">Every budget code of the export is linked to an activity.</div>;
  else {
    body = (
      <section className="border border-gray-200 bg-white">
        <header className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-[11px] text-gray-600">
          {data.items.length} budget codes of the export (as at {day(data.import.as_of_date)}) are not linked. Their amounts are not counted in any business unit until linked.
          Codes outside the workplan (outbreak response, previous programmes) can stay unlinked.
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead className="border-b border-gray-200"><tr>
              <th className={`${TH} text-left`}>Budget code</th><th className={`${TH} text-right`}>Released</th><th className={`${TH} text-right`}>Committed</th>
              <th className={`${TH} text-right`}>Spent</th><th className={`${TH} text-left`}>Activity</th><th className={TH}><span className="sr-only">Link</span></th>
            </tr></thead>
            <tbody>
              {data.items.map((i) => <LinkRow key={i.fund_center} item={i} options={options} fiscalYear={fiscalYear} importId={data.import.id} />)}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <BudgetExecutionLayout crumb="Unlinked budget codes">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-[16px] font-semibold text-gray-900">Budget codes not linked to an activity</h1>
        <label className="ml-auto flex flex-col gap-1 text-[10px] text-gray-500">Year
          <select value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} className="border border-gray-300 bg-white px-2 py-1.5 text-[11px]">
            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <Link to="/budget-execution/imports" className="text-[11px] text-[#1A5632] hover:underline">Imports →</Link>
      </div>
      {body}
    </BudgetExecutionLayout>
  );
}
