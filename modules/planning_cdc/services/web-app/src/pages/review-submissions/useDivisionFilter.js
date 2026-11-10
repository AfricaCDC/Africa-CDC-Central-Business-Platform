import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { indexByCode, matchesDivisionFilter } from '@/utils/divisionHierarchy';
import { useDivisionCodes } from './hooks/useReviewSubmissionsQueries';

const ALL = 'ALL';

/**
 * Directorate → division filter for one review-submissions tab, kept in the
 * URL (`<scope>_dir`, `<scope>_div`) so a filtered view can be shared and
 * survives a reload. Picking a directorate resets the division.
 *
 * @param {string} scope — short URL prefix, unique per tab (e.g. 'ar', 'sa', 'disp')
 * @returns {{ filterProps: object, matches: (code: string) => boolean, isActive: boolean, clear: () => void }}
 *   `filterProps` spreads onto <DirectorateDivisionFilter>; `matches` tests a division code.
 * @throws {never}
 * @example
 * const f = useDivisionFilter('ar');
 * const shown = rows.filter((r) => f.matches(r.responsible_division_code));
 */
export default function useDivisionFilter(scope) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data } = useDivisionCodes(true);
  const divisions = useMemo(() => data || [], [data]);
  const byCode = useMemo(() => indexByCode(divisions), [divisions]);
  const dirKey = `${scope}_dir`;
  const divKey = `${scope}_div`;
  const directorate = searchParams.get(dirKey) || ALL;
  const division = searchParams.get(divKey) || ALL;

  const write = (dir, div) => {
    const next = new URLSearchParams(searchParams);
    if (dir === ALL) next.delete(dirKey); else next.set(dirKey, dir);
    if (div === ALL) next.delete(divKey); else next.set(divKey, div);
    setSearchParams(next, { replace: true });
  };

  return {
    filterProps: {
      divisions,
      directorate,
      division,
      onDirectorateChange: (v) => write(v, ALL),
      onDivisionChange: (v) => write(directorate, v),
    },
    matches: (code) => matchesDivisionFilter(
      { responsible_division_code: code },
      { divisionId: division === ALL ? undefined : division, directorate: directorate === ALL ? undefined : directorate },
      byCode,
    ),
    isActive: directorate !== ALL || division !== ALL,
    clear: () => write(ALL, ALL),
  };
}
