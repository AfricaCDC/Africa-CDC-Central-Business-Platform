import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { RBAC_MODULES, RBAC_ACTIONS, RBAC_SCOPES } from '@rbm/lib/rbac';
import { usePermissions } from '@/hooks/usePermissions';
import usePermissionStore from '@/stores/usePermissionStore';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { LoadingState, ErrorState } from '@/components/shared/QueryStates';
import { getErrorMessage } from '@/utils/errorMessage';
import BudgetExecutionLayout from '../BudgetExecutionLayout';
import { useBudgetImports, useDeleteBudgetImport } from '../hooks/useBudgetExecutionQueries';
import { money, rate, day } from '../config';
import ImportForm from './ImportForm';
import ImportStatusBanner from './ImportStatusBanner';

const TH = 'px-3 py-2 text-[10px] font-semibold uppercase text-gray-500';
const NUM = 'px-3 py-2.5 text-right text-[11px] tabular-nums whitespace-nowrap';

function History({ fiscalYear, canDelete, onDelete }) {
  const { data: imports = [], isLoading, isError, error, refetch } = useBudgetImports(fiscalYear);
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState message={getErrorMessage(error, 'Could not load the imports.')} onRetry={refetch} />;
  if (!imports.length) return <div className="border border-gray-200 bg-white px-6 py-8 text-center text-[12px] text-gray-500">No import for {fiscalYear} yet.</div>;
  return (
    <section className="border border-gray-200 bg-white">
      <header className="border-b border-gray-200 bg-gray-50 px-4 py-2"><h2 className="text-[12px] font-semibold text-gray-900">Imports {fiscalYear}</h2></header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead className="border-b border-gray-200"><tr>
            <th className={`${TH} text-left`}>Figures as at</th><th className={`${TH} text-left`}>Imported</th><th className={`${TH} text-left`}>File</th>
            <th className={`${TH} text-right`}>Budget codes</th><th className={`${TH} text-right`}>Released</th><th className={`${TH} text-right`}>Balance</th>
            <th className={`${TH} text-right`}>Execution</th>{canDelete && <th className={TH}><span className="sr-only">Actions</span></th>}
          </tr></thead>
          <tbody>
            {imports.map((i, idx) => (
              <tr key={i.id} className="border-b border-gray-100">
                <td className="px-3 py-2.5 text-[11px] font-semibold text-gray-900">{day(i.as_of_date)}{idx === 0 && <span className="ml-2 bg-[#1A5632] px-1.5 py-0.5 text-[9px] font-bold text-white">IN USE</span>}</td>
                <td className="px-3 py-2.5 text-[11px] text-gray-600">{day(i.created_at)}{i.imported_by_name ? ` · ${i.imported_by_name}` : ''}</td>
                <td className="max-w-[220px] truncate px-3 py-2.5 text-[11px] text-gray-600" title={i.file_name}>{i.file_name}</td>
                <td className={`${NUM} text-gray-800`}>{i.fund_center_count}</td>
                <td className={`${NUM} text-gray-800`}>{money(i.released_budget)}</td>
                <td className={`${NUM} font-bold text-[#1A5632]`}>{money(i.balance)}</td>
                <td className={`${NUM} text-gray-800`}>{rate(i.execution_pct)}</td>
                {canDelete && (
                  <td className="px-3 py-2.5 text-right">
                    <button type="button" onClick={() => onDelete(i)} className="p-1 text-gray-400 hover:text-red-700" aria-label={`Delete the import as at ${day(i.as_of_date)}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Weekly MIS import (D-20261015-04): this week's status, the upload form and
 * the history of imports. Finance / M&E / admins only (create at scope `all`).
 *
 * Route: /budget-execution/imports
 *
 * @returns {JSX.Element}
 * @example <Route path="/budget-execution/imports" element={<BudgetImportsPage />} />
 */
export default function BudgetImportsPage() {
  const { getScope, isAdmin } = usePermissions();
  const isReady = usePermissionStore((st) => !!st.loadedAt) || isAdmin;
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));
  const [toDelete, setToDelete] = useState(null);
  const remove = useDeleteBudgetImport();
  const canImport = getScope(RBAC_MODULES.BUDGET_EXECUTION, RBAC_ACTIONS.CREATE) === RBAC_SCOPES.ALL;
  const canDelete = getScope(RBAC_MODULES.BUDGET_EXECUTION, RBAC_ACTIONS.DELETE) === RBAC_SCOPES.ALL;

  if (!isReady) return <BudgetExecutionLayout crumb="Imports"><LoadingState /></BudgetExecutionLayout>;
  if (!canImport) {
    return (
      <BudgetExecutionLayout crumb="Imports">
        <div className="border border-gray-200 bg-white px-6 py-10 text-center text-[12px] text-gray-600">
          Only Finance, M&amp;E and administrators import the budget execution export. <Link to="/budget-execution" className="text-[#1A5632] underline">See the budget execution</Link>
        </div>
      </BudgetExecutionLayout>
    );
  }

  const handleDelete = async () => {
    try {
      await remove.mutateAsync(toDelete.id);
      toast.success('Import deleted');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not delete this import.'));
    }
    setToDelete(null);
  };

  return (
    <BudgetExecutionLayout crumb="Imports">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[16px] font-semibold text-gray-900">Budget execution imports</h1>
        <Link to="/budget-execution/unlinked" className="ml-auto text-[11px] text-[#1A5632] hover:underline">Budget codes not linked to an activity →</Link>
      </div>
      <ImportStatusBanner />
      <ImportForm onImported={(r) => setFiscalYear(r.fiscal_year)} />
      <History fiscalYear={fiscalYear} canDelete={canDelete} onDelete={setToDelete} />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        variant="danger"
        title="Delete this import?"
        description={toDelete ? `The figures as at ${day(toDelete.as_of_date)} are removed. If it is the latest import, the previous one is used again.` : ''}
        confirmLabel={remove.isPending ? 'Deleting…' : 'Delete'}
      />
    </BudgetExecutionLayout>
  );
}
