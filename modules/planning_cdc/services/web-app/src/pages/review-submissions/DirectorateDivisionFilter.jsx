import SearchSelect from '@/components/shared/SearchSelect';
import { directorateOptions, divisionOptions } from '@/utils/divisionHierarchy';

/**
 * Two cascading comboboxes (Directorate → Division) for the review-submission
 * tabs. Options/cascade come from `division_codes` rows via divisionHierarchy.
 * The parent owns the selected values; picking a directorate must reset the
 * division (do it inside `onDirectorateChange`). Filtering is done by the
 * consumer with `matchesDivisionFilter` from src/utils/divisionHierarchy.js.
 *
 * @param {object} props
 * @param {Array<{code:string,division_name:string,parent_code:string,level_type:string}>} props.divisions
 * @param {string} props.directorate - selected directorate code or 'ALL'
 * @param {string} props.division - selected division code or 'ALL'
 * @param {(code:string)=>void} props.onDirectorateChange - receives code or 'ALL'; MUST reset division
 * @param {(code:string)=>void} props.onDivisionChange - receives code or 'ALL'
 * @returns {JSX.Element}
 */
export default function DirectorateDivisionFilter({
  divisions, directorate, division, onDirectorateChange, onDivisionChange,
}) {
  const dirOpts = directorateOptions(divisions);
  const divOpts = divisionOptions(divisions, directorate === 'ALL' ? undefined : directorate);
  return (
    <>
      <div className="w-full sm:w-auto sm:min-w-[220px]">
        <SearchSelect
          value={directorate === 'ALL' ? null : directorate}
          onChange={(v) => onDirectorateChange(v || 'ALL')}
          placeholder="All directorates"
          allowClear
          options={dirOpts}
        />
      </div>
      <div className="w-full sm:w-auto sm:min-w-[240px]">
        <SearchSelect
          value={division === 'ALL' ? null : division}
          onChange={(v) => onDivisionChange(v || 'ALL')}
          placeholder="All divisions"
          allowClear
          options={divOpts}
        />
      </div>
    </>
  );
}
