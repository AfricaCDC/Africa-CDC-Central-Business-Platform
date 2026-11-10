import { useActiveDivision } from '@/contexts/ActiveDivisionContext';
import { usePlanningYear } from '@/contexts/PlanningYearContext';
import { ORG_LEVEL_TYPES } from '@rbm/lib/enums';

const selectClass = 'w-full text-[12px] border border-gray-300 px-2 py-2 bg-white outline-none focus:border-[#1A5632]';
const labelClass = 'block text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1';

/**
 * Division and fiscal year pickers at the bottom of the burger drawer: the
 * header switchers (DivisionSwitcher, FiscalYearSwitcher) are hidden below
 * `lg`. Native selects, same contexts, same rules: the division picker shows
 * only with more than one division, the year picker only with more than one
 * plan year (a single year is shown as text).
 *
 * @param {{onDone: Function}} props — called after a change, closes the drawer
 * @returns {JSX.Element}
 * @throws {never}
 * @example <MobileContextPickers onDone={close} />
 */
export default function MobileContextPickers({ onDone }) {
    const { divisions, activeCode, setActiveDivision, loaded } = useActiveDivision();
    const { planningYear, setPlanningYear, years, reportableYear, isLoading } = usePlanningYear();
    const showDivisions = loaded && divisions.length > 1;
    const directorates = divisions.filter((d) => d.level_type === ORG_LEVEL_TYPES.DIRECTORATE);
    const plainDivisions = divisions.filter((d) => d.level_type !== ORG_LEVEL_TYPES.DIRECTORATE && !d.alias_of);
    const optionText = (d) => `${d.code} · ${d.division_name}`;

    return (
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 space-y-3 flex-shrink-0">
            {showDivisions && (
                <div>
                    <label htmlFor="mobile-division" className={labelClass}>Division</label>
                    <select id="mobile-division" value={activeCode || ''} className={selectClass}
                        onChange={(e) => { setActiveDivision(e.target.value || null); onDone(); }}>
                        <option value="">All my divisions</option>
                        {directorates.length > 0 && (
                            <optgroup label="Directorates">
                                {directorates.map((d) => <option key={d.code} value={d.code}>{optionText(d)}</option>)}
                            </optgroup>
                        )}
                        {plainDivisions.length > 0 && (
                            <optgroup label="Divisions">
                                {plainDivisions.map((d) => <option key={d.code} value={d.code}>{optionText(d)}</option>)}
                            </optgroup>
                        )}
                    </select>
                </div>
            )}
            <div>
                <label htmlFor="mobile-fiscal-year" className={labelClass}>Fiscal year</label>
                {isLoading || years.length <= 1 ? (
                    <div className="text-[12px] font-semibold text-gray-800">FY {planningYear}</div>
                ) : (
                    <select id="mobile-fiscal-year" value={planningYear} className={selectClass}
                        onChange={(e) => { setPlanningYear(e.target.value); onDone(); }}>
                        {years.map((year) => (
                            <option key={year} value={year}>
                                FY {year}{Number(year) > Number(reportableYear) ? ' (planning only)' : ''}
                            </option>
                        ))}
                    </select>
                )}
            </div>
        </div>
    );
}
