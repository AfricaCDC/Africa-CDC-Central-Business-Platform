/**
 * Big Tickets — Q3 2026 update from PR&A's consolidation v2 (D-20261015-09).
 *
 * Data: src/db/data/big_tickets_2026_q3.json (extract_big_tickets_2026_q3.js).
 * For every ticket of the snapshot, lines matched by order:
 *   · the 2026 target and mid-year milestone are replaced (v2 is the reference);
 *   · the Q2 2026 achieved value is replaced; its performance is cleared when
 *     the value changed (the old % no longer matches);
 *   · the Q3 2026 report is created APPROVED, imported = 1, with the Q3
 *     values, progress status, narration, challenges and next steps. An
 *     imported Q3 report is refreshed; a Q3 report the business unit or M&E
 *     filled on the platform (imported = 0) is never touched.
 *
 * Idempotent. `down` removes the imported Q3 reports only: targets and Q2
 * values come back from the database backup taken before the deploy.
 */

'use strict';

const { STATUSES } = require('@rbm/lib/enums');
const snapshot = require('../data/big_tickets_2026_q3.json');

const YEAR = snapshot.fiscal_year;
const Q2 = 'Q2';
const Q3 = snapshot.quarter;
const pct = (ratio) => (ratio === null || ratio === undefined ? null : Math.round(ratio * 10000) / 100);
const join = (texts) => [...new Set(texts.filter(Boolean))].join('\n\n') || null;

async function updateTargets(trx, lines, rows) {
  for (let i = 0; i < lines.length; i++) {
    await trx('big_ticket_line_targets').where({ line_id: lines[i].id, fiscal_year: YEAR }).update({
      annual_target: rows[i].target_2026 || null, annual_target_numeric: rows[i].target_2026_numeric,
      q2_milestone: rows[i].q2_milestone || null, q2_milestone_numeric: rows[i].q2_milestone_numeric,
    });
  }
}

async function updateQ2(trx, ticketId, lines, rows) {
  const report = await trx('big_ticket_reports').where({ big_ticket_id: ticketId, fiscal_year: YEAR, quarter: Q2 }).first('id');
  if (!report) return;
  for (let i = 0; i < lines.length; i++) {
    const current = await trx('big_ticket_report_values').where({ report_id: report.id, line_id: lines[i].id }).first();
    const achieved = rows[i].q2_achieved || null;
    if (!current || (current.achieved || null) === achieved) continue;
    await trx('big_ticket_report_values').where('id', current.id)
      .update({ achieved, achieved_numeric: rows[i].q2_achieved_numeric, performance_pct: null });
  }
}

async function upsertQ3(trx, ticket, ticketId, lines) {
  const key = { big_ticket_id: ticketId, fiscal_year: YEAR, quarter: Q3 };
  const existing = await trx('big_ticket_reports').where(key).first('id', 'imported');
  if (existing && !existing.imported) return;
  const fields = {
    progress_status: ticket.q3_status, narrative: join(ticket.lines.map((l) => l.q3_narrative)),
    challenges: ticket.q3_challenges || null, next_steps: ticket.q3_next_steps || null,
    status: STATUSES.APPROVED, imported: true, rejection_reason: null,
  };
  let reportId = existing && existing.id;
  if (reportId) await trx('big_ticket_reports').where('id', reportId).update({ ...fields, updated_at: trx.fn.now() });
  else [reportId] = await trx('big_ticket_reports').insert({ ...key, ...fields, submitted_at: trx.fn.now(), approved_at: trx.fn.now() });
  await trx('big_ticket_report_values').where('report_id', reportId).del();
  for (let i = 0; i < lines.length; i++) {
    const l = ticket.lines[i];
    await trx('big_ticket_report_values').insert({
      report_id: reportId, line_id: lines[i].id, achieved: l.q3_achieved || null,
      achieved_numeric: l.q3_achieved_numeric, performance_pct: pct(l.q3_performance),
    });
  }
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('big_ticket_reports'))) return;
  await knex.transaction(async (trx) => {
    for (const ticket of snapshot.tickets) {
      const row = await trx('big_tickets').where('code', ticket.code).first('id');
      if (!row) continue; // ticket deleted on the platform: nothing to update
      const lines = await trx('big_ticket_lines').where('big_ticket_id', row.id).orderBy('sort_order').orderBy('id').select('id');
      if (lines.length !== ticket.lines.length) {
        throw new Error(`${ticket.code}: ${lines.length} lines on the platform, ${ticket.lines.length} in the Q3 file`);
      }
      await updateTargets(trx, lines, ticket.lines);
      await updateQ2(trx, row.id, lines, ticket.lines);
      await upsertQ3(trx, ticket, row.id, lines);
    }
  });
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('big_ticket_reports'))) return;
  await knex('big_ticket_reports').where({ fiscal_year: YEAR, quarter: Q3, imported: true }).del();
};
