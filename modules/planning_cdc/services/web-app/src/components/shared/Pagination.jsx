/**
 * Previous / Next pager of a list page.
 *
 * @param {{ page: number, totalPages: number, onPage: (page: number) => void }} props
 * @returns {JSX.Element}
 * @example <Pagination page={2} totalPages={5} onPage={setPage} />
 */
export default function Pagination({ page, totalPages, onPage }) {
  const btn = 'px-2.5 py-1 text-[11px] border border-gray-300 bg-white disabled:opacity-40 hover:bg-[#F5F7FA]';
  return (
    <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-gray-100">
      <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span className="text-[11px] text-gray-600">Page {page} of {totalPages}</span>
      <button type="button" className={btn} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}
