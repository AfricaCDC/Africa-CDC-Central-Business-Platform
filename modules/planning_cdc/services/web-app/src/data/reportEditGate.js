/**
 * Frontend mirror of `services/api-server/src/services/reportPermissions.js`.
 *
 * Resolves whether the current user may edit/submit a report given:
 *   - the report's MAIN division (`responsible_division_code`)
 *   - the report's CONTRIB list (`contributing_divisions` column)
 *   - the UNION of divisions where the user holds the FOCAL role
 *
 * Rule (D-20260415-11):
 *   1. Admin bypass (`reports.approve` scope=all) → allowed as ADMIN.
 *   2. focalSet ∩ {MAIN} ≠ ∅ → allowed as MAIN.
 *   3. focalSet ∩ CONTRIB ≠ ∅ → allowed as CONTRIB (3-step approval chain).
 *   4. Otherwise → read-only.
 *
 * The top-nav DivisionSwitcher is a LIST filter only and MUST NOT gate
 * edit permission — that bug is exactly what D-20260415-11 fixed.
 */
'use strict';

export const REPORT_ROLE_MAIN = 'MAIN';
export const REPORT_ROLE_CONTRIB = 'CONTRIB';
export const REPORT_ROLE_ADMIN = 'ADMIN';
export const REPORT_ROLE_REVIEWER = 'REVIEWER';

export const REPORT_REASON_NOT_AUTHENTICATED = 'NOT_AUTHENTICATED';
export const REPORT_REASON_NOT_IN_DIVISIONS = 'NOT_IN_MAIN_OR_CONTRIB';

/**
 * Lenient parser for the `contributing_divisions` payload — accepts JSON
 * string, already-parsed array, or nullish. Returns uppercased codes.
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
export function parseContributingDivisions(raw) {
  if (!raw) return [];
  let arr = raw;
  if (!Array.isArray(raw)) {
    if (typeof raw !== 'string') return [];
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((c) => String(c || '').trim().toUpperCase())
    .filter(Boolean);
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

/**
 * @param {object} params
 * @param {string|null|undefined} params.mainDivisionCode
 *   Report's `responsible_division_code`.
 * @param {Array<string>|string|null|undefined} [params.contributingDivisions]
 *   Report's `contributing_divisions` (array OR JSON string OK).
 * @param {Iterable<string>} [params.focalDivisionCodes]
 *   Codes of divisions where the user holds the FOCAL role.
 * @param {boolean} [params.isAdmin]
 *   True if the user holds `reports.approve` at scope `all`.
 * @param {boolean} [params.isAuthenticated]
 *   Defaults to true. Pass false to bubble NOT_AUTHENTICATED.
 * @returns {{ allowed: boolean, role: 'MAIN'|'CONTRIB'|'ADMIN'|null, reason: string|null }}
 * @example
 *   resolveReportEditRole({
 *     mainDivisionCode: 'SRH',
 *     contributingDivisions: '["DSI","EPR"]',
 *     focalDivisionCodes: ['SRH', 'DSI'],
 *   })
 *   // → { allowed: true, role: 'MAIN', reason: null }
 */
function toFocalSet(focalDivisionCodes) {
  const out = new Set();
  for (const code of focalDivisionCodes || []) {
    const norm = normalizeCode(code);
    if (norm) out.add(norm);
  }
  return out;
}

function intersectsContrib(focalSet, contributingDivisions) {
  const contrib = parseContributingDivisions(contributingDivisions);
  return contrib.some((c) => focalSet.has(c));
}

function resolveFocalRole(mainDivisionCode, contributingDivisions, focalSet, allDivisionSet) {
  const main = normalizeCode(mainDivisionCode);
  if (main && focalSet.has(main)) {
    return { allowed: true, role: REPORT_ROLE_MAIN, reason: null };
  }
  if (intersectsContrib(focalSet, contributingDivisions)) {
    return { allowed: true, role: REPORT_ROLE_CONTRIB, reason: null };
  }
  // Reviewer check — HOD / Director / M&E can view + approve/reject
  if (allDivisionSet && allDivisionSet.size > 0) {
    if (main && allDivisionSet.has(main)) {
      return { allowed: true, role: REPORT_ROLE_REVIEWER, reason: null };
    }
    const contrib = parseContributingDivisions(contributingDivisions);
    if (contrib.some((c) => allDivisionSet.has(c))) {
      return { allowed: true, role: REPORT_ROLE_REVIEWER, reason: null };
    }
  }
  return { allowed: false, role: null, reason: REPORT_REASON_NOT_IN_DIVISIONS };
}

export function resolveReportEditRole({
  mainDivisionCode,
  contributingDivisions = null,
  focalDivisionCodes = [],
  allDivisionCodes = [],
  isAdmin = false,
  isAuthenticated = true,
} = {}) {
  if (!isAuthenticated) {
    return { allowed: false, role: null, reason: REPORT_REASON_NOT_AUTHENTICATED };
  }
  if (isAdmin) {
    return { allowed: true, role: REPORT_ROLE_ADMIN, reason: null };
  }
  return resolveFocalRole(
    mainDivisionCode,
    contributingDivisions,
    toFocalSet(focalDivisionCodes),
    toFocalSet(allDivisionCodes),
  );
}

/**
 * Extract focal division codes from the `/me/divisions` payload exposed
 * by `useActiveDivision().divisions`. Each row carries a `reasons: string[]`
 * array populated server-side in `divisionBuilders.js`.
 *
 * @param {Array<{ code: string, reasons?: string[] }>} divisions
 * @returns {string[]}
 */
export function focalDivisionCodesFromMe(divisions) {
  if (!Array.isArray(divisions)) return [];
  return divisions
    .filter((d) => Array.isArray(d?.reasons) && d.reasons.includes('focal'))
    .map((d) => String(d.code || ''))
    .filter(Boolean);
}

/**
 * Extract ALL division codes from the `/me/divisions` payload — includes
 * focal, responsible (HOD), director, m_and_e, attached, directorate_child.
 * Used for the REVIEWER gate so HODs/M&E/Directors can view + approve.
 *
 * @param {Array<{ code: string, reasons?: string[] }>} divisions
 * @returns {string[]}
 */
export function allDivisionCodesFromMe(divisions) {
  if (!Array.isArray(divisions)) return [];
  return divisions
    .map((d) => String(d.code || ''))
    .filter(Boolean);
}
