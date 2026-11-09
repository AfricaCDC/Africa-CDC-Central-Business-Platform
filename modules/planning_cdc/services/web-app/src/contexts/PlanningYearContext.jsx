/**
 * The fiscal year the user is currently working on.
 *
 * Before this context every page computed `new Date().getFullYear()` on its
 * own, in 34 places. The year was therefore a property of the wall clock, not
 * of the plan: FY2027 could be loaded in the database and remain invisible, and
 * on 1 January every screen would silently switch to a year that might hold
 * nothing.
 *
 * Two values come out of here and they must not be confused:
 *
 * - `planningYear` — what the user chose. May be in the future. Drives the
 *   planning screens: workplan tree, activities, indicators, budgets.
 * - `reportableYear` — the latest year that has actually started. Drives the
 *   execution screens. The server refuses a reporting write on anything later
 *   (403 FISCAL_YEAR_NOT_STARTED), so a screen that followed `planningYear`
 *   would offer buttons the API rejects.
 *
 * `fyNum` is the FY index (1..5) matching `planningYear`. Pages that pick a
 * target column must use it instead of `currentFy()`: the 2026 targets live in
 * `target_y4` and the 2027 ones in `target_y5`, so an index derived from the
 * clock reads an empty column as soon as the two years coexist.
 */

import { createContext, useContext, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { currentFy } from '@rbm/lib/fiscalYear';
import { useFiscalYears } from '@/hooks/useFiscalYearQueries';
import { useAuth } from '@/contexts/AuthContext';

const STORAGE_KEY = 'rbm.planningYear';
const YEAR_RE = /^\d{4}$/;

/** The latest year a user may report on: the one that has started. */
function calendarYear() {
  return String(new Date().getFullYear());
}

/** localStorage throws in private mode and in some embedded webviews. */
function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return YEAR_RE.test(raw || '') ? raw : null;
  } catch {
    return null;
  }
}

function writeStored(year) {
  try {
    localStorage.setItem(STORAGE_KEY, year);
  } catch {
    // A browser that refuses storage still gets a working switcher for the
    // session; only the persistence is lost.
  }
}

const PlanningYearContext = createContext({
  planningYear: calendarYear(),
  setPlanningYear: () => {},
  years: [],
  fyNum: currentFy(),
  reportableYear: calendarYear(),
  isFuturePlan: false,
  isLoading: false,
});

/**
 * Resolve which year to show, in order of authority: the `?fy=` in the URL,
 * then the stored choice, then the calendar year, then the newest year that
 * holds a plan.
 *
 * @param {string|null} fromUrl
 * @param {string|null} stored
 * @param {string[]} available — years known to hold a plan
 * @returns {string}
 * @example resolveYear('2027', null, ['2027','2026']) // '2027'
 */
export function resolveYear(fromUrl, stored, available) {
  const has = (y) => available.length === 0 || available.includes(y);
  if (YEAR_RE.test(fromUrl || '') && has(fromUrl)) return fromUrl;
  if (stored && has(stored)) return stored;
  const now = calendarYear();
  if (has(now)) return now;
  return available[0] || now;
}

/**
 * Provide the planning year to the whole app.
 *
 * @param {{children: React.ReactNode}} props
 * @returns {JSX.Element}
 * @example <PlanningYearProvider><App /></PlanningYearProvider>
 */
export function PlanningYearProvider({ children }) {
  const [searchParams, setSearchParams] = useSearchParams();
  // This provider wraps the whole router, login page included, so the query
  // must stay dormant until there is a session. See useFiscalYearQueries.
  const { user } = useAuth();
  const { data: rows = [], isLoading } = useFiscalYears({ enabled: !!user });

  const years = useMemo(() => rows.map((r) => r.fiscal_year), [rows]);
  const planningYear = resolveYear(searchParams.get('fy'), readStored(), years);

  const value = useMemo(() => {
    const reportableYear = calendarYear();
    return {
      planningYear,
      years,
      isLoading,
      reportableYear,
      // True when the user is looking at a plan whose year has not begun.
      // Execution screens use this to say so instead of showing empty tables.
      isFuturePlan: Number(planningYear) > Number(reportableYear),
      fyNum: currentFy(Number(planningYear)),
      setPlanningYear: (year) => {
        if (!YEAR_RE.test(String(year))) return;
        writeStored(String(year));
        // Keep the URL in step so a page can be shared with its year. replace,
        // not push: switching years should not fill the back button.
        const next = new URLSearchParams(searchParams);
        next.set('fy', String(year));
        setSearchParams(next, { replace: true });
      },
    };
  }, [planningYear, years, isLoading, searchParams, setSearchParams]);

  return (
    <PlanningYearContext.Provider value={value}>
      {children}
    </PlanningYearContext.Provider>
  );
}

/**
 * Read the planning year and its derived values.
 *
 * @returns {{planningYear:string,setPlanningYear:(y:string)=>void,years:string[],fyNum:number,reportableYear:string,isFuturePlan:boolean,isLoading:boolean}}
 * @example const { planningYear } = usePlanningYear();
 */
export function usePlanningYear() {
  return useContext(PlanningYearContext);
}

export default PlanningYearContext;
