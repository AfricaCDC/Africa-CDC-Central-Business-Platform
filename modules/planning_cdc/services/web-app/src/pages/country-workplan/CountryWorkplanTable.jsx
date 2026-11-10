import { useNavigate } from 'react-router-dom';
import { fmtBudget } from '@rbm/lib/formatters';
import StatusBadge from '@/components/shared/StatusBadge';

export const PAGE_SIZE = 15;
const TH = 'px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500';
const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const dates = (a) => (a.start_date || a.end_date ? `${day(a.start_date)} – ${day(a.end_date)}` : '—');

function Pager({ page, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages === 1) return null;
  const BTN = 'border border-gray-300 px-2.5 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-40';
  return (
    <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-2 text-[11px] text-gray-600">
      <button type="button" className={BTN} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span>Page {page} of {pages}</span>
      <button type="button" className={BTN} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

/**
 * Activities planned in a country, 15 per page; a row opens the activity.
 *
 * @param {{ activities: object[], page: number, onPage: (page: number) => void }} props
 * @returns {JSX.Element}
 * @example <CountryWorkplanTable activities={rows} page={1} onPage={setPage} />
 */
export default function CountryWorkplanTable({ activities, page, onPage }) {
  const navigate = useNavigate();
  const rows = activities.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <div className="overflow-x-auto border border-gray-200 bg-white">
      <table className="w-full min-w-[760px]">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className={TH}>Activity</th><th className={TH}>Unit</th><th className={TH}>Focal person</th>
            <th className={TH}>Dates</th><th className={`${TH} text-right`}>Budget</th><th className={TH}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} onClick={() => navigate(`/plan/node/${a.id}`)} className="cursor-pointer border-b border-gray-100 align-top hover:bg-gray-50">
              <td className="px-4 py-2.5 text-[11px]">
                <span className="mr-2 font-mono text-[10px] text-gray-400">{a.code}</span>
                <span className="text-gray-900">{a.title}</span>
              </td>
              <td className="px-4 py-2.5 text-[11px] text-gray-700">{a.division_name || a.responsible_division_code}</td>
              <td className="px-4 py-2.5 text-[11px] text-gray-700">{a.focal_name || '—'}</td>
              <td className="px-4 py-2.5 text-[11px] text-gray-600">{dates(a)}</td>
              <td className="px-4 py-2.5 text-right text-[11px] tabular-nums text-gray-900">{fmtBudget(a.budget_main, { fallback: '$0' })}</td>
              <td className="px-4 py-2.5"><StatusBadge status={a.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager page={page} total={activities.length} onPage={onPage} />
    </div>
  );
}
