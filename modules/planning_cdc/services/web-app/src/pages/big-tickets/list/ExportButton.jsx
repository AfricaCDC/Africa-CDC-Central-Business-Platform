import { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { bigTicketsApi } from '@/services/bigTickets.api';
import { triggerDownload } from '@/services/export.api';
import { getErrorMessage } from '@/utils/errorMessage';

/**
 * Downloads the Big Tickets of the year as Excel, in the shape of PR&A's
 * consolidation, with the chosen quarter's performance and narration.
 *
 * @param {{ fiscalYear: string, quarter?: string }} props
 * @returns {JSX.Element}
 * @example <ExportButton fiscalYear="2026" quarter="Q3" />
 */
export default function ExportButton({ fiscalYear, quarter }) {
  const [isBusy, setBusy] = useState(false);
  const handleExport = async () => {
    setBusy(true);
    try {
      const res = await bigTicketsApi.exportFile(fiscalYear, quarter);
      triggerDownload(res, `big-tickets-${fiscalYear}-${quarter || 'latest'}.xlsx`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'The export could not be generated.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={isBusy}
      className="flex items-center gap-1.5 border border-[#1A5632] bg-white px-3 py-2 text-[12px] text-[#1A5632] hover:bg-[#F2F7F3] disabled:opacity-50"
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" /> {isBusy ? 'Exporting…' : `Export Excel${quarter ? ` (${quarter})` : ''}`}
    </button>
  );
}
