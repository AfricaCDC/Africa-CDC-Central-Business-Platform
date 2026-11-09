import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import { getErrorMessage } from '@/utils/errorMessage';
import { useImportMisExport } from '../hooks/useBudgetExecutionQueries';
import { YEAR_OPTIONS } from '../config';

const FIELD = 'text-[11px] border border-gray-300 bg-white px-2 py-1.5 focus:outline-none focus:border-[#1A5632]';
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Upload form of the weekly MIS export: file, fiscal year, figures date and
 * whether to email each business unit its balance.
 *
 * @param {{ onImported: (result: { id: number, fiscal_year: string, fund_center_count: number, line_count: number }) => void }} props
 * @returns {JSX.Element}
 * @example <ImportForm onImported={(r) => setLast(r)} />
 */
export default function ImportForm({ onImported }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));
  const [asOf, setAsOf] = useState(today());
  const [isNotify, setNotify] = useState(true);
  const upload = useImportMisExport();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { toast.error('Choose the budget execution export (.xlsx) first.'); return; }
    const form = new FormData();
    form.append('file', file);
    form.append('fiscal_year', fiscalYear);
    form.append('as_of_date', asOf);
    form.append('notify', isNotify ? '1' : '0');
    try {
      const result = await upload.mutateAsync(form);
      toast.success(`Imported: ${result.fund_center_count} budget codes, ${result.line_count} lines`);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      onImported({ ...result, fiscal_year: fiscalYear });
    } catch (err) {
      toast.error(getErrorMessage(err, 'The budget execution export could not be imported.'));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-[12px] font-semibold text-gray-900">Import the budget execution export of the week</h2>
        <p className="mt-0.5 text-[11px] text-gray-500">
          Export the budget execution report (Fund center, Fund, GL account, released, commitment, actual expenditure) as .xlsx and upload it here.
          Every block is checked against its Total row before anything is saved.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-[10px] text-gray-500 md:col-span-3">Budget execution export (.xlsx)
          <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFile(e.target.files?.[0] || null)} className={FIELD} required />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-gray-500">Fiscal year
          <select value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} className={FIELD}>
            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-gray-500">Figures as at
          <input type="date" value={asOf} max={today()} onChange={(e) => setAsOf(e.target.value)} className={FIELD} required />
        </label>
        <label className="flex items-center gap-2 self-end pb-1.5 text-[11px] text-gray-700">
          <input type="checkbox" checked={isNotify} onChange={(e) => setNotify(e.target.checked)} className="accent-[#1A5632]" />
          Email each business unit its balance
        </label>
      </div>
      <div>
        <button type="submit" disabled={upload.isPending}
          className="inline-flex items-center gap-1.5 bg-[#1A5632] px-4 py-2 text-[12px] font-medium text-white hover:bg-[#14442A] disabled:opacity-60">
          <Upload className="h-3.5 w-3.5" /> {upload.isPending ? 'Importing…' : 'Import'}
        </button>
      </div>
    </form>
  );
}
