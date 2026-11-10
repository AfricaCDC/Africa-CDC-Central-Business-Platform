import { ROLE_LABELS } from '@rbm/lib/roles';
import { TOUR_OUTCOME_LABELS } from '@rbm/lib/enums';
import { fmtDate } from '@rbm/lib/formatters';
import Pagination from '@/components/shared/Pagination';

const tourLabel = (u) => {
  if (!u.tour_version_seen) return 'Not taken';
  return `${TOUR_OUTCOME_LABELS[u.tour_outcome] || 'Taken'} (v${u.tour_version_seen})`;
};

const submittedLabel = ({ specifics, activity_reports: activityReports, indicator_reports: indicatorReports }) =>
  (specifics + activityReports + indicatorReports
    ? `${specifics} specific · ${activityReports} activity rep. · ${indicatorReports} indicator rep.`
    : 'Nothing yet');

/**
 * One page of active users with their sign-in, tour and submissions. A row
 * opens the user in Users & Roles.
 *
 * @param {{ rows: object[], total: number, page: number, pageSize: number, onPage: (page: number) => void, onOpen: (user: object) => void }} props
 * @returns {JSX.Element}
 * @example <AdoptionTable rows={rows} total={40} page={1} pageSize={15} onPage={setPage} onOpen={openUser} />
 */
export default function AdoptionTable({ rows, total, page, pageSize, onPage, onOpen }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="bg-white border border-gray-200">
      <div className="px-3 py-2 text-[10px] text-gray-500 border-b border-gray-100">{total} user{total === 1 ? '' : 's'}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-[#F5F7FA] text-[10px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="text-left font-medium px-3 py-2">User</th>
              <th className="text-left font-medium px-3 py-2">Unit</th>
              <th className="text-left font-medium px-3 py-2">Roles</th>
              <th className="text-left font-medium px-3 py-2">Last sign-in</th>
              <th className="text-left font-medium px-3 py-2">Tour</th>
              <th className="text-left font-medium px-3 py-2">Submitted</th>
              <th className="text-left font-medium px-3 py-2">Last submission</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} onClick={() => onOpen(u)} className="border-t border-gray-100 hover:bg-[#F5F7FA] cursor-pointer">
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-900">{u.full_name || u.email}</div>
                  <div className="text-[10px] text-gray-500">{u.email}</div>
                </td>
                <td className="px-3 py-2">{u.unit_code || 'None'}</td>
                <td className="px-3 py-2">{u.roles.map((r) => ROLE_LABELS[r] || r).join(', ') || 'None'}</td>
                <td className="px-3 py-2">{u.last_login_at ? fmtDate(u.last_login_at) : 'Never'}</td>
                <td className="px-3 py-2">{tourLabel(u)}</td>
                <td className="px-3 py-2">{submittedLabel(u.submitted)}</td>
                <td className="px-3 py-2">{u.last_submitted_at ? fmtDate(u.last_submitted_at) : 'None'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > pageSize && <Pagination page={page} totalPages={totalPages} onPage={onPage} />}
    </div>
  );
}
