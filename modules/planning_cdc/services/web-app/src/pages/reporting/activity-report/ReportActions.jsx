import { Loader2, Save, Send, Check, ShieldCheck } from 'lucide-react';

const BTN = 'text-[11px] px-4 py-2 disabled:opacity-50 flex items-center gap-1.5';

/**
 * Explain why submission is blocked. Create mode nuance: files can only be
 * attached once the report exists, so a fully-filled new report is one save
 * away rather than "missing a file".
 */
function submitHint(missing, hasReport) {
  if (missing.length === 0) return null;
  if (!hasReport && missing.length === 1 && missing[0] === 'verification file') {
    return 'Save draft first, then upload a verification file to submit';
  }
  return `Missing: ${missing.join(', ')}`;
}

function ApproveAction({ isApproving, onApprove }) {
  return (
    <button onClick={onApprove} disabled={isApproving} className={`${BTN} bg-[#14442A] text-white hover:bg-[#0F3D24]`}>
      {isApproving ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
      Approve Report
    </button>
  );
}

function LockedNotice({ statusLabel }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-gray-500">
      <Check className="w-3.5 h-3.5 text-green-600" />
      Report is {statusLabel.toLowerCase()} and locked.
    </div>
  );
}

function AuthorActions({ missing, hasReport, isSaving, isSubmitting, onSave, onSubmit }) {
  const isBusy = isSaving || isSubmitting;
  const hint = submitHint(missing, hasReport);
  return (
    <div className="flex items-center gap-2">
      <button onClick={onSave} disabled={isSaving} className={`${BTN} border border-gray-400 text-gray-700 hover:bg-gray-100`}>
        {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
        Save draft
      </button>
      <button onClick={onSubmit} disabled={isBusy || missing.length > 0} className={`${BTN} bg-[#D97706] text-white hover:bg-[#B45309]`}>
        {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
        Save & submit for approval
      </button>
      {hint && <span className="text-[10px] text-gray-400">{hint}</span>}
    </div>
  );
}

/**
 * Footer of the activity report: approve for a reviewer, a locked notice once
 * submitted, save/submit for the author otherwise. Rejection goes through
 * Review submissions, where the reason is captured.
 * @param {object} props — mode flags plus the props of the chosen branch
 * @returns {JSX.Element}
 * @example <ReportActions isReviewMode={false} isLocked={false} missing={[]} hasReport onSave={save} onSubmit={submit} onCancel={back} />
 */
export default function ReportActions({ isReviewMode, isLocked, onCancel, ...props }) {
  let action = <AuthorActions {...props} />;
  if (isLocked) action = <LockedNotice {...props} />;
  if (isReviewMode) action = <ApproveAction {...props} />;
  return (
    <div className="flex items-center justify-between border-t border-gray-200 pt-4">
      <button onClick={onCancel} className="text-[11px] px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50">
        Cancel
      </button>
      {action}
    </div>
  );
}
