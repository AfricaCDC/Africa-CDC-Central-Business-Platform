import { parseCodeList } from '@/utils/codeList';
import { parseLocations } from '@rbm/lib/countries';

// Field groups of the form, by how a saved value becomes a form value.
const TEXT_FIELDS = [
  'title', 'description', 'parent_id', 'linked_indicator_id', 'focal_user_id', 'activity_type', 'risk_level',
  'responsible_division_code', 'budgeting_arrangement', 'primary_funding_source', 'other_funding_source', 'grant_name',
];
const AMOUNT_FIELDS = ['budget_main', 'q1_budget', 'q2_budget', 'q3_budget', 'q4_budget'];
const FLAG_FIELDS = ['implementation_at_rcc', 'is_operational'];
const DATE_FIELDS = ['start_date', 'end_date'];

const pick = (fields, toValue) => Object.fromEntries(fields.map((k) => [k, toValue(k)]));

/**
 * Form values of a saved specific activity.
 *
 * @param {object} detail - the saved activity (detail endpoint)
 * @returns {object} the form state
 * @example formFromDetail(detail).title // 'EQA workshop'
 */
export function formFromDetail(detail) {
  return {
    ...pick(TEXT_FIELDS, (k) => detail[k] || ''),
    ...pick(AMOUNT_FIELDS, (k) => detail[k] ?? ''),
    ...pick(FLAG_FIELDS, (k) => (detail[k] != null ? String(detail[k]) : '')),
    ...pick(DATE_FIELDS, (k) => (detail[k] ? detail[k].slice(0, 10) : '')),
    secondary_division_codes: parseCodeList(detail.secondary_division_codes),
    locations: parseLocations(detail.location),
  };
}

/**
 * Form values of a copy for another year (D-20261105-14): everything but the
 * broad activity, the indicator and the dates, which belong to one year. The
 * codes change from one year to the next, so the user picks them again.
 *
 * @param {object} detail - the source activity
 * @returns {object} the form state
 * @example copyFormFrom(source).parent_id // ''
 */
export function copyFormFrom(detail) {
  return { ...formFromDetail(detail), parent_id: '', linked_indicator_id: '', start_date: '', end_date: '' };
}

/**
 * The year after `year` when its plan is loaded, else null.
 *
 * @param {string} year
 * @param {string[]} years - the years that hold a plan
 * @returns {string|null}
 * @example nextPlanYear('2026', ['2027', '2026']) // '2027'
 */
export function nextPlanYear(year, years) {
  const next = String(Number(year) + 1);
  return years.includes(next) ? next : null;
}

/**
 * Where « Copy to next year » leads: the new-activity form, prefilled from
 * `id`, on the planning year `year`.
 *
 * @param {number|string} id
 * @param {string} year
 * @returns {string}
 * @example copyPath(42, '2027') // '/my-specifics/new?copy=42&fy=2027'
 */
export const copyPath = (id, year) => `/my-specifics/new?copy=${id}&fy=${year}`;
