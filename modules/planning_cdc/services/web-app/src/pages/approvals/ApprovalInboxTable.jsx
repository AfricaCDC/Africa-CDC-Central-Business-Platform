import { useNavigate } from 'react-router-dom';

const STEP_LABEL = { 1: 'Step 1', 2: 'Step 2', 3: 'Step 3' };

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * Dumb table rendering the approval inbox. All rows clickable per CHARTER §7
 * ("All list pages must be clickable — use onClick on <tr>").
 *
 * @param {object} props
 * @param {Array<object>} props.rows
 * @returns {JSX.Element}
 */
export default function ApprovalInboxTable({ rows }) {
  const navigate = useNavigate();

  if (!rows || rows.length === 0) {
    return (
      <div className="border border-gray-200 bg-white p-6 text-center text-[12px] text-gray-500">
        Nothing pending for you right now.
      </div>
    );
  }

  return (
    <table className="w-full border border-gray-200 bg-white text-[11px]">
      <thead className="bg-gray-50 text-left">
        <tr>
          <th className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-600">Step</th>
          <th className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-600">Report</th>
          <th className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-600">Contributing unit</th>
          <th className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-600">Submitted by</th>
          <th className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-600">Submitted at</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.stepId || row.id}
            onClick={() => navigate(`/approvals/${row.instanceId}`)}
            className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
          >
            <td className="px-3 py-2">{STEP_LABEL[row.step] || `Step ${row.step}`}</td>
            <td className="px-3 py-2">
              {row.reportCode ? <strong>{row.reportCode}</strong> : null}
              {row.reportCode && row.reportTitle ? ' — ' : null}
              {row.reportTitle || row.entityType}
            </td>
            <td className="px-3 py-2">{row.contribOrg || '—'}</td>
            <td className="px-3 py-2">{row.submitterName || '—'}</td>
            <td className="px-3 py-2">{formatDate(row.submittedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
