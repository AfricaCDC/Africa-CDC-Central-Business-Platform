import { useSearchParams } from 'react-router-dom';

/**
 * Country and page of the country workplan, kept in the URL so the view can be
 * shared. Changing the country goes back to page 1.
 *
 * @param {string[]} codes - countries offered; a URL country outside them falls back to the first
 * @returns {{ country: string|null, page: number, setCountry: (code: string) => void, setPage: (page: number) => void }}
 * @example const { country, page, setCountry, setPage } = useCountryWorkplanFilters(['COD', 'KEN']);
 */
export function useCountryWorkplanFilters(codes) {
  const [params, setParams] = useSearchParams();
  const wanted = params.get('country');
  const country = codes.includes(wanted) ? wanted : codes[0] || null;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const update = (patch) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, String(v)) : next.delete(k)));
    return next;
  }, { replace: true });
  return {
    country,
    page,
    setCountry: (code) => update({ country: code, page: null }),
    setPage: (p) => update({ page: p > 1 ? p : null }),
  };
}
