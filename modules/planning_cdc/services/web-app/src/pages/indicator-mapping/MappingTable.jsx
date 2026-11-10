import { useNavigate } from 'react-router-dom';
import IndicatorPicker from './IndicatorPicker';

const TH = 'px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500';
export const PAGE_SIZE = 15;

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
 * Activities with their linked T3/T4 indicators, 15 per page. A click on
 * the code or title opens the activity; the indicator cell edits the links.
 *
 * @param {{ items: object[], total: number, page: number, options: object[], isSingle: boolean, canEdit: boolean, savingId: number|null, onLinks: (id: number, ids: number[]) => void, onPage: (page: number) => void }} props
 * @returns {JSX.Element}
 * @example <MappingTable items={rows} total={120} page={1} options={options} isSingle={false} canEdit savingId={null} onLinks={save} onPage={setPage} />
 */
export default function MappingTable({ items, total, page, options, isSingle, canEdit, savingId, onLinks, onPage }) {
  const navigate = useNavigate();
  return (
    <div className="border border-t-0 border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className={`${TH} w-[90px]`}>Code</th>
              <th className={TH}>Activity</th>
              <th className={`${TH} w-[110px]`}>Responsible</th>
              <th className={`${TH} w-[440px]`}>Linked T3/T4 indicator{isSingle ? '' : 's'}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-gray-100 align-top hover:bg-gray-50/50">
                <td className="cursor-pointer px-4 py-2.5 font-mono text-[11px] text-[#B45309] hover:underline" onClick={() => navigate(`/plan/node/${item.id}`)}>{item.code || `#${item.id}`}</td>
                <td className="cursor-pointer px-4 py-2.5 text-[11px] leading-snug text-gray-800 hover:text-[#1A5632]" onClick={() => navigate(`/plan/node/${item.id}`)}>{item.title}</td>
                <td className="px-4 py-2.5 text-[10px] text-gray-500">{item.responsible_division_code || '—'}</td>
                <td className="px-4 py-2.5">
                  <IndicatorPicker ids={item.indicator_ids} options={options} isSingle={isSingle} canEdit={canEdit}
                    isSaving={savingId === item.id} onChange={(ids) => onLinks(item.id, ids)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} onPage={onPage} />
    </div>
  );
}
