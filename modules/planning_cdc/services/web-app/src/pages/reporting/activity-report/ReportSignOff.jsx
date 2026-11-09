const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : null);

/**
 * Template sign-off block: prepared by, approved by, submission date. Filled
 * by the workflow, never typed. Before the first save the author is the
 * current user.
 * @param {{ report: object|null, currentUserName: string }} props
 * @returns {JSX.Element}
 * @example <ReportSignOff report={data.report} currentUserName="Jane Doe" />
 */
export default function ReportSignOff({ report, currentUserName }) {
  const cells = [
    ['Prepared by', report?.prepared_by_name || currentUserName],
    ['Approved by', report?.approved_by_name],
    ['Submission date', fmtDate(report?.submitted_at)],
  ];
  return (
    <div className="border border-gray-200 bg-white grid grid-cols-1 sm:grid-cols-3">
      {cells.map(([label, value]) => (
        <div key={label} className="px-5 py-3 border-b sm:border-b-0 sm:border-r last:border-r-0 border-gray-200">
          <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">{label}</p>
          <p className="text-[12px] text-gray-800">{value || '—'}</p>
        </div>
      ))}
    </div>
  );
}
