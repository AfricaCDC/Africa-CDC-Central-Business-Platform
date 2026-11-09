import { useSearchParams } from 'react-router-dom';

/**
 * The directorate shown on /digest, kept in `?code=` so the email link
 * and a bookmark open the same digest.
 *
 * @param {Array<{ code: string }>} directorates - those the user may read
 * @returns {{ directorate: string|null, setDirectorate: (code: string) => void }}
 * @example const { directorate, setDirectorate } = useDigestFilters(directorates);
 */
export function useDigestFilters(directorates) {
  const [params, setParams] = useSearchParams();
  const asked = (params.get('code') || '').toUpperCase();
  const directorate = asked || directorates[0]?.code || null;
  const setDirectorate = (code) => setParams((p) => { p.set('code', code); return p; }, { replace: true });
  return { directorate, setDirectorate };
}
