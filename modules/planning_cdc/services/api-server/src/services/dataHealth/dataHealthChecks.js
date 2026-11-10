// ── Data health checks (automation roadmap, lot 2) ──
//
// D-20261105-11. Each check lists the records that block a workflow
// (approvals, reports, budget follow-up) until someone completes them. A
// row carries the page where it is fixed. `perYear` checks read one plan
// year; the others read the current organisation.

'use strict';

const db = require('../../config/db');
const { collectGaps, FOCAL_TEAM_SQL, FOCAL_ROLE } = require('../orgSetup/orgSetupReminder');
const { resolveImport } = require('../budgetExecution/budgetExecutionQuery');
const { unlinkedFundCenters } = require('../budgetExecution/budgetExecutionLinks');
const { STATUSES, PLAN_NODE_TYPES, TIERS } = require('@rbm/lib/enums');

const ACTIVE_USER = 'ACTIVE';
const ASSIGNMENT_COLUMNS = ['responsible_user_id', 'm_and_e_user_id'];

/** Plan items of one type and year, not cancelled. */
const itemsOfYear = (nodeType, fiscalYear) => db('plan_nodes as p')
  .where('p.node_type', nodeType)
  .where('p.fiscal_year', fiscalYear)
  .whereNot('p.status', STATUSES.CANCELLED)
  .orderBy('p.code')
  .select('p.id', 'p.code', 'p.title', 'p.responsible_division_code');

const itemRow = (path) => (p) => ({ ref: String(p.id), code: p.code, name: p.title, detail: p.responsible_division_code || '', path: path(p) });

async function unitPeople(fiscalYear) {
  const units = await collectGaps(fiscalYear);
  return units.map((u) => ({ ref: u.code, code: u.code, name: u.name, detail: `Missing: ${u.missing.join(', ')}`, path: `/reference/org/${u.code}` }));
}

async function countryOfficeFocal() {
  // Focal persons are user_divisions rows (D-20261106-09).
  const rows = await db('division_codes as dc').where('dc.is_country_office', 1).whereNull('dc.alias_of')
    .whereRaw(`NOT ${FOCAL_TEAM_SQL}`, [FOCAL_ROLE])
    .orderBy('dc.code').select('dc.code', 'dc.division_name', 'dc.country_code');
  return rows.map((r) => ({ ref: r.code, code: r.code, name: r.division_name || r.code, detail: r.country_code || '', path: `/reference/org/${r.code}` }));
}

async function broadBudgetCode(fiscalYear) {
  const rows = await itemsOfYear(PLAN_NODE_TYPES.BROAD_ACTIVITY, fiscalYear)
    .whereNotExists(function hasCode() { this.from('budget_codes as b').whereRaw('b.plan_node_id = p.id'); });
  return rows.map(itemRow((p) => `/plan/node/${p.id}`));
}

async function broadIndicator(fiscalYear) {
  const rows = await itemsOfYear(PLAN_NODE_TYPES.BROAD_ACTIVITY, fiscalYear)
    .whereNotExists(function hasLink() { this.from('indicator_broad_links as l').whereRaw('l.broad_activity_id = p.id'); });
  return rows.map(itemRow(() => '/pirs/mapping'));
}

async function specificIndicator(fiscalYear) {
  const rows = await itemsOfYear(PLAN_NODE_TYPES.SPECIFIC_ACTIVITY, fiscalYear)
    .where('p.status', STATUSES.APPROVED)
    .whereNull('p.linked_indicator_id');
  return rows.map(itemRow((p) => `/plan/node/${p.id}`));
}

/** T3/T4 indicators of the year, not cancelled. T1/T2 are maintained by PR&A. */
const t3t4Indicators = (fiscalYear) => itemsOfYear(PLAN_NODE_TYPES.OUTCOME_INDICATOR, fiscalYear)
  .whereIn('p.tier_id', [TIERS.T3.id, TIERS.T4.id]);
const indicatorPath = (p) => `/pirs/${p.id}/edit`;

async function indicatorUnit(fiscalYear) {
  const rows = await t3t4Indicators(fiscalYear)
    .where(function noUnit() { this.whereNull('p.responsible_division_code').orWhere('p.responsible_division_code', ''); });
  return rows.map(itemRow(indicatorPath));
}

// A space, two dots in a row, or a dot or dash at either end, e.g.
// « SDI. 2.1-4 » or « SDI..2.5-12 »: search, sort and exports see another
// code (D-20261106-12). Activity codes are generated, so only indicators.
const MALFORMED_CODE_SQL = "(p.code REGEXP '[[:space:]]' OR p.code REGEXP '[.][.]' OR p.code REGEXP '^[.-]|[.-]$')";

async function malformedCode(fiscalYear) {
  const rows = await t3t4Indicators(fiscalYear).whereRaw(MALFORMED_CODE_SQL);
  return rows.map(itemRow(indicatorPath));
}

async function duplicateCode(fiscalYear) {
  const usedTwice = db('plan_nodes')
    .where({ fiscal_year: fiscalYear, node_type: PLAN_NODE_TYPES.OUTCOME_INDICATOR })
    .whereNot('status', STATUSES.CANCELLED)
    .whereNotNull('code').whereNot('code', '')
    .groupBy('code')
    .havingRaw('COUNT(*) > 1')
    .select('code');
  const rows = await t3t4Indicators(fiscalYear).whereIn('p.code', usedTwice);
  return rows.map(itemRow(indicatorPath));
}

async function userUnit() {
  const rows = await db('users as u')
    .where(function active() { this.where('u.status', ACTIVE_USER).orWhereNull('u.status'); })
    .where(function human() { this.where('u.is_bot', 0).orWhereNull('u.is_bot'); })
    .where(function noHomeUnit() { this.whereNull('u.division_code').orWhere('u.division_code', ''); })
    .whereNotExists(function member() { this.from('user_divisions as ud').whereRaw('ud.user_id = u.id'); })
    .whereNotExists(function holder() {
      this.from('division_codes as dc').where(function anyPointer() {
        for (const c of ASSIGNMENT_COLUMNS) this.orWhereRaw(`dc.${c} = u.id`);
      });
    })
    .orderBy('u.full_name')
    .select('u.id', 'u.full_name', 'u.email');
  return rows.map((u) => ({ ref: String(u.id), code: u.email, name: u.full_name || u.email, detail: '', path: '/admin/users' }));
}

async function fundCentreLink(fiscalYear) {
  const latest = await resolveImport(fiscalYear);
  if (!latest) return [];
  const items = await unlinkedFundCenters({ importId: latest.id, fiscalYear });
  return items.map((f) => ({
    ref: f.fund_center, code: f.fund_center, name: f.text || f.fund_center,
    detail: (f.funds || []).join(', '), path: `/budget-execution/unlinked?fy=${fiscalYear}`,
  }));
}

/** The checks, in the order shown on the page and in the email. */
const CHECKS = Object.freeze([
  { key: 'unit_people', perYear: true, run: unitPeople, label: 'Business units without their people',
    hint: 'Approvals and emails of these units fall back to the directorate or to the M&E pool.' },
  { key: 'country_office_focal', perYear: false, run: countryOfficeFocal, label: 'Country offices without a focal person',
    hint: 'Nobody is named to plan and report the activities of the office.' },
  { key: 'broad_budget_code', perYear: true, run: broadBudgetCode, label: 'Broad activities without a budget code',
    hint: 'Their budget cannot be planned nor followed against the budget execution.' },
  { key: 'broad_indicator', perYear: true, run: broadIndicator, label: 'Broad activities not linked to an indicator',
    hint: 'Their activity reports do not count toward any indicator.' },
  { key: 'specific_indicator', perYear: true, run: specificIndicator, label: 'Approved specific activities without an indicator',
    hint: 'Their activity reports are not offered to any quarterly indicator report.' },
  { key: 'indicator_unit', perYear: true, run: indicatorUnit, label: 'T3/T4 indicators without a Business Unit',
    hint: 'No unit reports on them each quarter.' },
  { key: 'user_unit', perYear: false, run: userUnit, label: 'Active users without a unit',
    hint: 'They see no workplan and receive no unit emails.' },
  { key: 'malformed_code', perYear: true, run: malformedCode, label: 'T3/T4 indicator codes with a space or a double dot',
    hint: 'Search, sorting and exports treat them as another code.' },
  { key: 'duplicate_code', perYear: true, run: duplicateCode, label: 'T3/T4 indicator codes used twice in the year',
    hint: 'Two indicators share one code, so reports and exports can mix them up.' },
  { key: 'fund_centre_link', perYear: true, run: fundCentreLink, label: 'Fund centres of the budget execution not linked to an activity',
    hint: 'Their spending is missing from the budget execution of the activities (latest import of the year).' },
]);

module.exports = { CHECKS };
