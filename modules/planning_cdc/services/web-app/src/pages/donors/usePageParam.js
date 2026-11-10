import { useSearchParams } from 'react-router-dom';

/**
 * The `page` of a list page, kept in the URL (page 1 has no parameter).
 *
 * @returns {[number, (page: number) => void]}
 * @example const [page, setPage] = usePageParam();
 */
export function usePageParam() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const setPage = (next) => setParams((prev) => {
    const out = new URLSearchParams(prev);
    if (next > 1) out.set('page', String(next));
    else out.delete('page');
    return out;
  });
  return [page, setPage];
}
