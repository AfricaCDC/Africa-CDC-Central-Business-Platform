// ── Big Tickets — quarterly reports (D-20261015-05) ──
//
// The ticket's business units (lead and contributors), or M&E on their
// behalf, fill one report per (ticket, quarter, year):
// achieved value per line, progress status chosen by the BU, narration,
// challenges, next steps. Saved as DRAFT, then SUBMITTED; M&E (PR&A)
// approves or rejects. A rejected report goes back to the BU for editing.

'use strict';

const db = require('../../config/db');
const { STATUSES } = require('@rbm/lib/enums');
const { RBAC_MODULES, RBAC_ACTIONS, RBAC_SCOPES } = require('@rbm/lib/rbac');
const { ConflictError } = require('@rbm/lib/errors');
const rbacService = require('../rbacService');
const { scopeCoversDivision } = require('../divisionAliasService');

const MODULE = RBAC_MODULES.BIG_TICKET;
const EDITABLE = [STATUSES.DRAFT, STATUSES.REJECTED];
// Indicator reports that count towards the pre-filled value (drafts do not).
const COUNTED = [STATUSES.SUBMITTED, STATUSES.IN_REVIEW, STATUSES.APPROVED, STATUSES.VALIDATED];
const PERCENT_UNIT = /%|percent/i;

/**
 * Can the user fill the report of a ticket? `big_ticket:submit` at scope
 * `all` (M&E reports on behalf of the business units), or a scope covering
 * one of the ticket's business units: the lead or a contributor (division or
 * directorate). Scope `own` means a member of that business unit.
 *
 * @param {{ id: number }} user
 * @param {{ lead_division_code: string, contributors?: Array<{ division_code: string }> }} ticket
 * @returns {Promise<boolean>}
 * @throws {Error} on DB failure
 * @example await canReport(req.user, ticket);
 */
async function canReport(user, ticket) {
  const { allowed, scope } = await rbacService.checkPermission(user.id, MODULE, RBAC_ACTIONS.SUBMIT);
  if (!allowed) return false;
  if (scope === RBAC_SCOPES.ALL) return true;
  const unitScope = scope === RBAC_SCOPES.OWN ? RBAC_SCOPES.DIVISION : scope;
  const units = [ticket.lead_division_code, ...(ticket.contributors || []).map((c) => c.division_code)].filter(Boolean);
  for (const code of units) {
    if (await scopeCoversDivision(user, unitScope, code)) return true;
  }
  return false;
}

/**
 * Can the user approve or reject Big Ticket reports? `big_ticket:approve` at scope `all` (PR&A).
 *
 * @param {number} userId
 * @returns {Promise<boolean>}
 * @throws {Error} on DB failure
 * @example await canReview(req.user.id);
 */
async function canReview(userId) {
  const { allowed, scope } = await rbacService.checkPermission(userId, MODULE, RBAC_ACTIONS.APPROVE);
  return !!allowed && scope === RBAC_SCOPES.ALL;
}

/**
 * Proposed achieved value from a list of quarterly values: the latest one
 * for a percentage, else their sum (year to date).
 * ponytail: unit text decides; add a per-indicator aggregation column if PIRS gets one.
 *
 * @param {Array<{ quarter: string, value: number }>} values
 * @param {string|null} unit
 * @returns {number|null}
 * @example suggestValue([{ quarter: 'Q1', value: 3 }, { quarter: 'Q2', value: 4 }], 'people'); // 7
 */
function suggestValue(values, unit) {
  if (!values.length) return null;
  if (PERCENT_UNIT.test(unit || '')) return [...values].sort((a, b) => a.quarter.localeCompare(b.quarter)).pop().value;
  return values.reduce((sum, v) => sum + v.value, 0);
}

/**
 * Pre-fill per line: the main-division reports of the linked indicator,
 * Q1 up to `quarter`, and the proposed achieved value.
 *
 * @param {object[]} lines - ticket lines with `indicator` (from getTicket)
 * @param {string} fiscalYear
 * @param {string} quarter
 * @returns {Promise<Record<number, { quarters: Array<{ quarter: string, value: number, status: string }>, suggested: number|null }>>}
 * @throws {Error} on DB failure
 * @example await prefill(ticket.lines, '2026', 'Q3');
 */
async function prefill(lines, fiscalYear, quarter) {
  const nodeIds = [...new Set(lines.map((l) => l.indicator?.id).filter(Boolean))];
  const rows = nodeIds.length
    ? await db('indicator_division_reports as r').join('plan_nodes as p', 'p.id', 'r.plan_node_id')
      .whereIn('r.plan_node_id', nodeIds).where('r.fiscal_year', fiscalYear).where('r.quarter', '<=', quarter)
      .whereRaw('r.division_code = p.responsible_division_code')
      .whereIn('r.status', COUNTED).whereNotNull('r.actual_value')
      .select('r.plan_node_id', 'r.quarter', 'r.actual_value', 'r.status', 'p.unit')
    : [];
  const out = {};
  for (const line of lines) {
    const own = rows.filter((r) => line.indicator && r.plan_node_id === line.indicator.id)
      .map((r) => ({ quarter: r.quarter, value: Number(r.actual_value), status: r.status, unit: r.unit }))
      .sort((a, b) => a.quarter.localeCompare(b.quarter));
    out[line.id] = {
      quarters: own.map(({ quarter: q, value, status }) => ({ quarter: q, value, status })),
      suggested: suggestValue(own, own[0]?.unit),
    };
  }
  return out;
}

const performance = (achieved, target) => {
  if (achieved === null || achieved === undefined || !Number(target)) return null;
  return Math.round((Number(achieved) / Number(target)) * 10000) / 100;
};

/** Report row fields for a save, and the submission stamp when submitting. */
function reportFields(body, userId, submit) {
  const fields = {
    progress_status: body.progress_status || null,
    narrative: body.narrative || null,
    challenges: body.challenges || null,
    next_steps: body.next_steps || null,
    status: submit ? STATUSES.SUBMITTED : STATUSES.DRAFT,
    imported: false, // edited on the platform: no longer the imported version
    updated_at: db.fn.now(),
  };
  if (submit) Object.assign(fields, { submitted_by: userId, submitted_at: db.fn.now(), rejection_reason: null });
  return fields;
}

/** Upsert the achieved value of each known line of the ticket. */
async function saveValues(trx, reportId, ticket, values = []) {
  const lines = new Map(ticket.lines.map((l) => [l.id, l]));
  for (const v of values) {
    const line = lines.get(v.line_id);
    if (!line) continue;
    const row = {
      achieved: v.achieved || null,
      achieved_numeric: v.achieved_numeric ?? null,
      performance_pct: performance(v.achieved_numeric, line.target?.annual_target_numeric),
      comment: v.comment || null,
    };
    const current = await trx('big_ticket_report_values').where({ report_id: reportId, line_id: line.id }).first();
    if (current) await trx('big_ticket_report_values').where('id', current.id).update(row);
    else await trx('big_ticket_report_values').insert({ ...row, report_id: reportId, line_id: line.id });
  }
}

/** Fields of a save; a locked report (corrected by M&E) keeps its status and stamps. */
function saveFields({ body, userId, submit, existing, locked }) {
  const fields = reportFields(body, userId, submit);
  if (!locked) return fields;
  fields.status = existing.status;
  for (const stamp of ['submitted_by', 'submitted_at', 'rejection_reason']) delete fields[stamp];
  return fields;
}

/**
 * Save (DRAFT) or submit (SUBMITTED) the report of a quarter. A business
 * unit changes only a new, DRAFT or REJECTED report. A reviewer (M&E,
 * `canEditAny`) also corrects a SUBMITTED or APPROVED one, imported reports
 * included: the content changes, the status stays. Values of unknown lines
 * are ignored.
 *
 * @param {{ ticket: object, fiscalYear: string, quarter: string, body: object, userId: number, submit: boolean, canEditAny?: boolean }} p
 *   `ticket` from getTicket (lines with the target of the year)
 * @returns {Promise<{ id: number, status: string }>}
 * @throws {ConflictError} when the report is already submitted or approved
 * @example await saveReport({ ticket, fiscalYear: '2026', quarter: 'Q3', body, userId: 4, submit: false });
 */
async function saveReport({ ticket, fiscalYear, quarter, body, userId, submit, canEditAny = false }) {
  return db.transaction(async (trx) => {
    const key = { big_ticket_id: ticket.id, fiscal_year: fiscalYear, quarter };
    const existing = await trx('big_ticket_reports').where(key).forUpdate().first();
    const locked = Boolean(existing) && !EDITABLE.includes(existing.status);
    if (locked && !canEditAny) {
      throw new ConflictError('This report is already submitted; it can change only if M&E returns it');
    }
    const fields = saveFields({ body, userId, submit, existing, locked });
    let id = existing?.id;
    if (id) await trx('big_ticket_reports').where('id', id).update(fields);
    else [id] = await trx('big_ticket_reports').insert({ ...key, ...fields, imported: false, created_by: userId });
    await saveValues(trx, id, ticket, body.values);
    return { id, status: fields.status };
  });
}

/**
 * Approve or reject a SUBMITTED report (M&E). A rejection needs a reason
 * and sends the report back to the BU.
 *
 * @param {{ ticketId: number, fiscalYear: string, quarter: string, approve: boolean, reason?: string, userId: number }} p
 * @returns {Promise<object>} the updated report row
 * @throws {ConflictError} when there is no submitted report for that quarter
 * @example await decideReport({ ticketId: 5, fiscalYear: '2026', quarter: 'Q3', approve: true, userId: 2 });
 */
async function decideReport({ ticketId, fiscalYear, quarter, approve, reason, userId }) {
  const key = { big_ticket_id: ticketId, fiscal_year: fiscalYear, quarter };
  const report = await db('big_ticket_reports').where(key).first();
  if (!report || report.status !== STATUSES.SUBMITTED) throw new ConflictError('There is no submitted report to review for this quarter');
  const fields = approve
    ? { status: STATUSES.APPROVED, approved_by: userId, approved_at: db.fn.now(), rejection_reason: null }
    : { status: STATUSES.REJECTED, rejection_reason: reason };
  await db('big_ticket_reports').where('id', report.id).update({ ...fields, updated_at: db.fn.now() });
  return { ...report, ...fields };
}

module.exports = { canReport, canReview, prefill, saveReport, decideReport, _internals: { suggestValue, performance } };
