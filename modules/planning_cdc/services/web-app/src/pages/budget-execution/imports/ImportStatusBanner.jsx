import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { useImportStatus } from '../hooks/useBudgetExecutionQueries';
import { day } from '../config';

/**
 * This week's MIS import: "done" (when, by whom) or "not imported yet".
 * The weekly reminder email is sent by the notification wizard when not done.
 *
 * @returns {JSX.Element|null}
 * @example <ImportStatusBanner />
 */
export default function ImportStatusBanner() {
  const { data: status, isLoading, isError } = useImportStatus();
  if (isLoading || isError || !status) return null;
  const last = status.last_import;

  if (status.done) {
    return (
      <div className="flex items-start gap-2 border border-[#348F41] bg-[#F2F7F3] px-4 py-2.5 text-[11px] text-[#14442A]" role="status">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1A5632]" />
        <span>
          <strong>Already done for {status.week_label}.</strong> The export was imported on {day(last.created_at)}
          {last.imported_by_name ? ` by ${last.imported_by_name}` : ''} (figures as at {day(last.as_of_date)}).
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 border border-amber-400 bg-amber-50 px-4 py-2.5 text-[11px] text-amber-900" role="status">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
      <span>
        <strong>Not imported yet for {status.week_label}.</strong>
        {last ? ` Last import: figures as at ${day(last.as_of_date)}.` : ' Nothing has been imported yet.'}
      </span>
    </div>
  );
}
