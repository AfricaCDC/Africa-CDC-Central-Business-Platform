// ── Big Tickets — create, update, delete (D-20261015-02) ──
//
// A save carries the ticket, its contributors and its lines with their
// target for ONE fiscal year (`fiscal_year`): targets of other years are kept.
// Lines left out of an update are deleted (their report values go with them).

'use strict';

const db = require('../../config/db');
const { ValidationError, NotFoundError, ConflictError } = require('@rbm/lib/errors');

const TARGET_FIELDS = [
  'annual_target', 'annual_target_numeric',
  'q1_milestone', 'q1_milestone_numeric', 'q2_milestone', 'q2_milestone_numeric',
  'q3_milestone', 'q3_milestone_numeric', 'q4_milestone', 'q4_milestone_numeric',
];

const blankToNull = (v) => (v === undefined || v === '' ? null : v);

function ticketColumns(data) {
  return {
    code: data.code.toUpperCase(),
    title: data.title,
    pillar_id: blankToNull(data.pillar_id),
    lead_division_code: data.lead_division_code,
    contributors_note: blankToNull(data.contributors_note),
    expected_result: blankToNull(data.expected_result),
    delivery_model: blankToNull(data.delivery_model),
    success_factors: blankToNull(data.success_factors),
    start_year: data.start_year,
    end_year: blankToNull(data.end_year),
    ...(data.is_active === undefined ? {} : { is_active: data.is_active }),
  };
}

function targetColumns(target = {}) {
  return Object.fromEntries(TARGET_FIELDS.map((f) => [f, blankToNull(target[f])]));
}

async function assertReferences(trx, data) {
  const codes = [...new Set([data.lead_division_code, ...data.contributors])];
  const found = await trx('division_codes').whereIn('code', codes).pluck('code');
  const missing = codes.filter((c) => !found.includes(c));
  if (missing.length) throw new ValidationError(`Unknown business unit: ${missing.join(', ')}`);
  if (data.pillar_id && !(await trx('pillars').where('id', data.pillar_id).first())) {
    throw new ValidationError('Unknown pillar');
  }
}

async function assertCodeFree(trx, code, exceptId = null) {
  let q = trx('big_tickets').where('code', code.toUpperCase());
  if (exceptId) q = q.whereNot('id', exceptId);
  if (await q.first()) throw new ConflictError(`A Big Ticket with code ${code.toUpperCase()} already exists`);
}

async function saveContributors(trx, ticketId, data) {
  await trx('big_ticket_contributors').where('big_ticket_id', ticketId).del();
  const codes = [...new Set(data.contributors)].filter((c) => c !== data.lead_division_code);
  if (codes.length) await trx('big_ticket_contributors').insert(codes.map((c) => ({ big_ticket_id: ticketId, division_code: c })));
}

async function saveTarget(trx, lineId, fiscalYear, target) {
  const row = targetColumns(target);
  const existing = await trx('big_ticket_line_targets').where({ line_id: lineId, fiscal_year: fiscalYear }).first();
  if (existing) await trx('big_ticket_line_targets').where('id', existing.id).update(row);
  else await trx('big_ticket_line_targets').insert({ line_id: lineId, fiscal_year: fiscalYear, ...row });
}

async function saveLines(trx, ticketId, data) {
  const current = await trx('big_ticket_lines').where('big_ticket_id', ticketId).pluck('id');
  const keep = data.lines.map((l) => l.id).filter(Boolean);
  const foreign = keep.filter((id) => !current.includes(id));
  if (foreign.length) throw new ValidationError('A line does not belong to this Big Ticket');
  const removed = current.filter((id) => !keep.includes(id));
  if (removed.length) await trx('big_ticket_lines').whereIn('id', removed).del();

  for (let i = 0; i < data.lines.length; i++) {
    const l = data.lines[i];
    const row = {
      label: blankToNull(l.label), indicator_code: blankToNull(l.indicator_code), tier: blankToNull(l.tier), sort_order: i + 1,
    };
    let lineId = l.id;
    if (lineId) await trx('big_ticket_lines').where('id', lineId).update(row);
    else [lineId] = await trx('big_ticket_lines').insert({ big_ticket_id: ticketId, ...row });
    if (l.target) await saveTarget(trx, lineId, data.fiscal_year, l.target);
  }
}

/**
 * Create a Big Ticket with its lines and their targets for `fiscal_year`.
 *
 * @param {object} data - validated by ticketSchema
 * @param {number} userId
 * @returns {Promise<number>} the new ticket id
 * @throws {ValidationError} unknown business unit or pillar
 * @throws {ConflictError} code already used
 * @example await createTicket({ code: 'BT43', title: '...', lead_division_code: 'KM', start_year: '2027', fiscal_year: '2027', contributors: [], lines: [{}] }, 1);
 */
async function createTicket(data, userId) {
  return db.transaction(async (trx) => {
    await assertReferences(trx, data);
    await assertCodeFree(trx, data.code);
    const [{ next } = {}] = await trx('big_tickets').max('sort_order as next');
    const [id] = await trx('big_tickets').insert({
      ...ticketColumns(data), sort_order: (Number(next) || 0) + 1, created_by: userId, updated_by: userId,
    });
    await saveContributors(trx, id, data);
    await saveLines(trx, id, data);
    return id;
  });
}

/**
 * Update a Big Ticket, its contributors and lines; targets of `fiscal_year`.
 *
 * @param {number} id
 * @param {object} data - validated by ticketSchema
 * @param {number} userId
 * @returns {Promise<void>}
 * @throws {NotFoundError} unknown ticket
 * @throws {ValidationError} unknown business unit, pillar or line
 * @throws {ConflictError} code already used by another ticket
 * @example await updateTicket(12, payload, 1);
 */
async function updateTicket(id, data, userId) {
  await db.transaction(async (trx) => {
    if (!(await trx('big_tickets').where('id', id).first())) throw new NotFoundError('Big Ticket not found');
    await assertReferences(trx, data);
    await assertCodeFree(trx, data.code, id);
    await trx('big_tickets').where('id', id).update({ ...ticketColumns(data), updated_by: userId, updated_at: trx.fn.now() });
    await saveContributors(trx, id, data);
    await saveLines(trx, id, data);
  });
}

/**
 * Delete a Big Ticket with its lines, targets and reports.
 *
 * @param {number} id
 * @returns {Promise<{ id: number, code: string }>}
 * @throws {NotFoundError} unknown ticket
 * @example await deleteTicket(12);
 */
async function deleteTicket(id) {
  const ticket = await db('big_tickets').where('id', id).first('id', 'code');
  if (!ticket) throw new NotFoundError('Big Ticket not found');
  await db('big_tickets').where('id', id).del();
  return ticket;
}

module.exports = { createTicket, updateTicket, deleteTicket, _internals: { ticketColumns, targetColumns } };
