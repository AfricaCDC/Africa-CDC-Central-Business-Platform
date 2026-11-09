// ── Budget execution — business units a user may see (D-20261015-04) ──

'use strict';

const { RBAC_SCOPES } = require('@rbm/lib/rbac');
const { getUserDivisionScope, getDirectoratesForUser, getDirectorateChildren } = require('../divisionAliasService');
const { financeDivision } = require('./budgetImportReminder');

/** Is one of the user's units the finance unit or under it? */
async function isFinance(codes) {
  const finance = String(await financeDivision()).toUpperCase();
  const tree = new Set([finance, ...(await getDirectorateChildren(finance)).map((c) => String(c).toUpperCase())]);
  return [...codes].some((c) => tree.has(c));
}

/**
 * Division codes covered by the user's `budget_execution:read` scope:
 * null for scope `all` (admins, M&E) and for members of the finance unit
 * (setting budget_execution.import_division); the user's own business
 * units (aliases included) for `division` / `own`; plus every unit under
 * their directorates for `directorate`.
 *
 * @param {{ id: number }} user
 * @param {string} scope
 * @returns {Promise<string[]|null>} uppercased codes, or null = every division
 * @throws {Error} on DB failure
 * @example await allowedDivisions(req.user, req.rbac.scope);
 */
async function allowedDivisions(user, scope) {
  if (scope === RBAC_SCOPES.ALL) return null;
  const codes = new Set(await getUserDivisionScope(user.id));
  if (await isFinance(codes)) return null;
  if (scope === RBAC_SCOPES.DIRECTORATE) {
    for (const d of await getDirectoratesForUser(user.id)) {
      (await getDirectorateChildren(d)).forEach((c) => codes.add(String(c).toUpperCase()));
    }
  }
  return [...codes];
}

/**
 * Requested business unit limited to what the user may see. A directorate
 * stands for itself and every unit under it (aliases included).
 *
 * @param {string|undefined} requested - one division or directorate code from the query
 * @param {string[]|null} allowed
 * @returns {Promise<string[]|null>} null = every division
 * @throws {Error} on DB failure
 * @example await effectiveDivisions('APPM', null); // ['APPM', 'CHSISD', ...]
 */
async function effectiveDivisions(requested, allowed) {
  const code = String(requested || '').trim().toUpperCase();
  if (!code) return allowed;
  const wanted = (await getDirectorateChildren(code)).map((c) => String(c).toUpperCase());
  const set = new Set(wanted.length ? wanted : [code]);
  return allowed === null ? [...set] : allowed.filter((c) => set.has(c));
}

module.exports = { allowedDivisions, effectiveDivisions };
