/**
 * Big Tickets module (D-20261015-02): schema, RBAC module, import of the 42
 * tickets of the mid-year 2026 consolidation.
 *
 * A Big Ticket is its own object, not tied to one fiscal year: it can run
 * over several years (start_year .. end_year, end_year NULL = open). What is
 * yearly lives under it:
 *   · big_ticket_lines         — indicator lines; `indicator_code` is resolved
 *                                each year against plan_nodes (code + fiscal_year),
 *                                so a ticket that runs into 2027 follows the 2027
 *                                indicator of the same code.
 *   · big_ticket_line_targets  — annual target and Q1..Q4 milestones per year.
 *   · big_ticket_reports       — one report per (ticket, quarter, fiscal_year),
 *                                filled by the lead BU, approved by M&E, like
 *                                the T3/T4 indicator reports.
 *   · big_ticket_report_values — achieved value per line in a report.
 *
 * The legacy `big_tickets` table (2024 schema, never used by code, empty in
 * production) is dropped and rebuilt; the migration refuses to drop it when
 * it holds rows.
 *
 * RBAC: module `big_ticket`. Every role reads all tickets; the other actions
 * copy the grants of `quarterly_report` (same people report and approve).
 *
 * Import: src/db/data/big_tickets_2026.json (extract_big_tickets_2026.js) with
 * src/db/data/big_tickets_division_map.json. The mid-year figures become the
 * Q2 2026 report, APPROVED, imported = 1. Linked indicators get
 * plan_nodes.is_big_ticket = 1. Idempotent: a ticket whose code exists is skipped.
 *
 * down(): drops the new tables and the RBAC module. The legacy table is not
 * restored (it was empty and unused); is_big_ticket flags are left as they are.
 */

'use strict';

const { STATUSES, BIG_TICKET_PROGRESS } = require('@rbm/lib/enums');
const snapshot = require('../data/big_tickets_2026.json');
const divisionMap = require('../data/big_tickets_division_map.json');

const MODULE = { code: 'big_ticket', name: 'Big Tickets', category: 'reporting', sort_order: 33 };
const PILLAR_NAME = { P1: 'Pillar 1_%', P2: 'Pillar 2_Institutionalised%', P3: 'Pillar 3_%', P4: 'Pillar 4_%', P5: 'Pillar 5_%', CC: 'Cross%' };
const QUARTER = 'Q2';
const NEW_TABLES = [
  'big_ticket_report_values', 'big_ticket_reports', 'big_ticket_line_targets',
  'big_ticket_lines', 'big_ticket_contributors', 'big_tickets',
];

const splitLabels = (s) => String(s || '').split(/,|\+/).map((x) => x.trim()).filter(Boolean);

async function dropLegacyTable(knex) {
  if (!(await knex.schema.hasTable('big_tickets'))) return;
  if (!(await knex.schema.hasColumn('big_tickets', 'strategic_area'))) return; // already the new table
  const [{ n }] = await knex('big_tickets').count('* as n');
  if (Number(n) > 0) throw new Error(`Legacy big_tickets holds ${n} rows; migrate them before dropping the table`);
  await knex.schema.dropTable('big_tickets');
}

// Same collation as division_codes / plan_nodes: on MySQL 8 the server
// default (utf8mb4_0900_ai_ci) breaks the division FKs and every join.
async function divisionCollation(knex) {
  try {
    const [rows] = await knex.raw(
      'SELECT TABLE_COLLATION AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
      ['division_codes'],
    );
    return rows[0] && /^[a-z0-9]+_[a-z0-9_]+$/.test(rows[0].c) ? rows[0].c : null;
  } catch {
    return null; // not MySQL (tests): keep the defaults
  }
}

async function createTables(knex) {
  const collation = await divisionCollation(knex);
  const fit = (t) => {
    if (!collation) return;
    t.charset(collation.split('_')[0]);
    t.collate(collation);
  };
  if (!(await knex.schema.hasTable('big_tickets'))) {
    await knex.schema.createTable('big_tickets', (t) => {
      fit(t);
      t.increments('id').primary();
      t.string('code', 10).notNullable().unique();
      t.text('title').notNullable();
      t.integer('pillar_id').unsigned().nullable().references('id').inTable('pillars').onDelete('SET NULL');
      t.text('expected_result').nullable();
      t.text('delivery_model').nullable();
      t.text('success_factors').nullable();
      t.string('lead_division_code', 20).notNullable().references('code').inTable('division_codes').onUpdate('CASCADE');
      t.string('contributors_note', 500).nullable();
      t.string('start_year', 4).notNullable();
      t.string('end_year', 4).nullable();
      t.integer('sort_order').notNullable().defaultTo(0);
      t.boolean('is_active').notNullable().defaultTo(true);
      t.integer('created_by').unsigned().nullable();
      t.integer('updated_by').unsigned().nullable();
      t.timestamps(true, true);
      t.index(['lead_division_code']);
    });
  }
  if (!(await knex.schema.hasTable('big_ticket_contributors'))) {
    await knex.schema.createTable('big_ticket_contributors', (t) => {
      fit(t);
      t.increments('id').primary();
      t.integer('big_ticket_id').unsigned().notNullable().references('id').inTable('big_tickets').onDelete('CASCADE');
      t.string('division_code', 20).notNullable().references('code').inTable('division_codes').onUpdate('CASCADE');
      t.unique(['big_ticket_id', 'division_code']);
    });
  }
  if (!(await knex.schema.hasTable('big_ticket_lines'))) {
    await knex.schema.createTable('big_ticket_lines', (t) => {
      fit(t);
      t.increments('id').primary();
      t.integer('big_ticket_id').unsigned().notNullable().references('id').inTable('big_tickets').onDelete('CASCADE');
      t.string('label', 200).nullable();
      t.string('indicator_code', 50).nullable();
      t.text('source_indicator').nullable();
      t.string('tier', 10).nullable();
      t.integer('sort_order').notNullable().defaultTo(0);
      t.timestamps(true, true);
      t.index(['indicator_code']);
    });
  }
  if (!(await knex.schema.hasTable('big_ticket_line_targets'))) {
    await knex.schema.createTable('big_ticket_line_targets', (t) => {
      fit(t);
      t.increments('id').primary();
      t.integer('line_id').unsigned().notNullable().references('id').inTable('big_ticket_lines').onDelete('CASCADE');
      t.string('fiscal_year', 4).notNullable();
      t.text('annual_target').nullable();
      t.decimal('annual_target_numeric', 18, 4).nullable();
      for (const q of ['q1', 'q2', 'q3', 'q4']) {
        t.text(`${q}_milestone`).nullable();
        t.decimal(`${q}_milestone_numeric`, 18, 4).nullable();
      }
      t.timestamps(true, true);
      t.unique(['line_id', 'fiscal_year']);
    });
  }
  if (!(await knex.schema.hasTable('big_ticket_reports'))) {
    await knex.schema.createTable('big_ticket_reports', (t) => {
      fit(t);
      t.increments('id').primary();
      t.integer('big_ticket_id').unsigned().notNullable().references('id').inTable('big_tickets').onDelete('CASCADE');
      t.string('quarter', 2).notNullable();
      t.string('fiscal_year', 4).notNullable();
      t.string('progress_status', 20).nullable();
      t.text('narrative').nullable();
      t.text('challenges').nullable();
      t.text('next_steps').nullable();
      t.string('status', 20).notNullable().defaultTo(STATUSES.DRAFT);
      t.text('rejection_reason').nullable();
      t.boolean('imported').notNullable().defaultTo(false);
      t.integer('created_by').unsigned().nullable();
      t.integer('submitted_by').unsigned().nullable();
      t.dateTime('submitted_at').nullable();
      t.integer('approved_by').unsigned().nullable();
      t.dateTime('approved_at').nullable();
      t.timestamps(true, true);
      t.unique(['big_ticket_id', 'quarter', 'fiscal_year']);
      t.index(['fiscal_year', 'quarter', 'status']);
    });
  }
  if (!(await knex.schema.hasTable('big_ticket_report_values'))) {
    await knex.schema.createTable('big_ticket_report_values', (t) => {
      fit(t);
      t.increments('id').primary();
      t.integer('report_id').unsigned().notNullable().references('id').inTable('big_ticket_reports').onDelete('CASCADE');
      t.integer('line_id').unsigned().notNullable().references('id').inTable('big_ticket_lines').onDelete('CASCADE');
      t.text('achieved').nullable();
      t.decimal('achieved_numeric', 18, 4).nullable();
      t.decimal('performance_pct', 7, 2).nullable();
      t.text('comment').nullable();
      t.unique(['report_id', 'line_id']);
    });
  }
}

async function seedRbac(knex) {
  let mod = await knex('rbac_modules').where('code', MODULE.code).first();
  if (!mod) {
    const [id] = await knex('rbac_modules').insert(MODULE);
    mod = { id };
  }
  const read = await knex('rbac_actions').where('code', 'read').first();
  const source = await knex('rbac_modules').where('code', 'quarterly_report').first();
  const grants = source
    ? await knex('rbac_permissions').where('module_id', source.id).select('role_id', 'action_id', 'scope')
    : [];
  const roles = await knex('roles').select('id');
  // Everyone reads every ticket; other actions mirror quarterly_report.
  const wanted = [
    ...roles.map((r) => ({ role_id: r.id, action_id: read && read.id, scope: 'all' })),
    ...grants.filter((g) => !read || g.action_id !== read.id),
  ].filter((g) => g.action_id);
  for (const g of wanted) {
    const exists = await knex('rbac_permissions').where({ role_id: g.role_id, module_id: mod.id, action_id: g.action_id }).first();
    if (!exists) await knex('rbac_permissions').insert({ ...g, module_id: mod.id });
  }
}

async function resolvePillars(knex) {
  const out = {};
  for (const [code, like] of Object.entries(PILLAR_NAME)) {
    const row = await knex('pillars').where('name', 'like', like).orderBy('sort_order').first();
    out[code] = row ? row.id : null;
  }
  return out;
}

async function assertDivisions(knex) {
  const codes = [...new Set(Object.values(divisionMap.labels).map((l) => l.code).filter(Boolean))];
  const found = await knex('division_codes').whereIn('code', codes).pluck('code');
  const missing = codes.filter((c) => !found.includes(c));
  if (missing.length) throw new Error(`big_tickets_division_map: unknown division codes ${missing.join(', ')}`);
}

function mapLabels(ticket) {
  const resolve = (label) => {
    const entry = divisionMap.labels[label];
    if (!entry) throw new Error(`${ticket.code}: business unit "${label}" missing from big_tickets_division_map.json`);
    return entry.code;
  };
  const [leadLabel, ...coLeads] = splitLabels(ticket.lead_label);
  const lead = resolve(leadLabel);
  if (!lead) throw new Error(`${ticket.code}: lead "${leadLabel}" maps to no division`);
  const others = [...coLeads, ...splitLabels(ticket.contributors_label)];
  const contributors = [...new Set(others.map(resolve).filter((c) => c && c !== lead))];
  const unresolved = others.filter((l) => !resolve(l));
  return { lead, contributors, note: unresolved.length ? unresolved.join(', ') : null };
}

const q2Narrative = (lines) => (lines.length === 1
  ? lines[0].q2_narrative
  : lines.filter((l) => l.q2_narrative).map((l) => `${l.label || l.indicator_code || 'Line'}: ${l.q2_narrative}`).join('\n'));

async function importTicket(trx, ticket, index, pillars) {
  if (await trx('big_tickets').where('code', ticket.code).first()) return 0;
  const { lead, contributors, note } = mapLabels(ticket);
  const [ticketId] = await trx('big_tickets').insert({
    code: ticket.code, title: ticket.title, pillar_id: pillars[ticket.pillar] || null,
    expected_result: ticket.expected_result || null, delivery_model: ticket.delivery_model || null,
    success_factors: ticket.success_factors || null, lead_division_code: lead,
    contributors_note: note, start_year: snapshot.fiscal_year, end_year: null, sort_order: index + 1,
  });
  for (const code of contributors) await trx('big_ticket_contributors').insert({ big_ticket_id: ticketId, division_code: code });

  const [reportId] = await trx('big_ticket_reports').insert({
    big_ticket_id: ticketId, quarter: QUARTER, fiscal_year: snapshot.fiscal_year,
    progress_status: ticket.q2_status || BIG_TICKET_PROGRESS.ON_TRACK,
    narrative: q2Narrative(ticket.lines) || null, challenges: ticket.q2_challenges || null,
    next_steps: ticket.q2_next_steps || null, status: STATUSES.APPROVED, imported: true,
    submitted_at: trx.fn.now(), approved_at: trx.fn.now(),
  });
  for (let i = 0; i < ticket.lines.length; i++) {
    const l = ticket.lines[i];
    const [lineId] = await trx('big_ticket_lines').insert({
      big_ticket_id: ticketId, label: l.label || null, indicator_code: l.indicator_code,
      source_indicator: l.source_indicator || null, tier: l.tier, sort_order: i + 1,
    });
    await trx('big_ticket_line_targets').insert({
      line_id: lineId, fiscal_year: snapshot.fiscal_year,
      annual_target: l.target_2026 || null, annual_target_numeric: l.target_2026_numeric,
      q2_milestone: l.q2_milestone || null, q2_milestone_numeric: l.q2_milestone_numeric,
    });
    await trx('big_ticket_report_values').insert({
      report_id: reportId, line_id: lineId, achieved: l.q2_achieved || null,
      achieved_numeric: l.q2_achieved_numeric,
      performance_pct: l.q2_performance == null ? null : Math.round(l.q2_performance * 10000) / 100,
    });
  }
  return 1;
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('pillars')) || !(await knex.schema.hasTable('division_codes'))) return;
  await dropLegacyTable(knex);
  await createTables(knex);
  if (await knex.schema.hasTable('rbac_modules')) await seedRbac(knex);

  await assertDivisions(knex);
  const pillars = await resolvePillars(knex);
  await knex.transaction(async (trx) => {
    for (let i = 0; i < snapshot.tickets.length; i++) await importTicket(trx, snapshot.tickets[i], i, pillars);
    const codes = [...new Set(snapshot.tickets.flatMap((t) => t.lines.map((l) => l.indicator_code)).filter(Boolean))];
    if (codes.length && (await trx.schema.hasColumn('plan_nodes', 'is_big_ticket'))) {
      await trx('plan_nodes').whereIn('code', codes).update({ is_big_ticket: 1 });
    }
  });
};

exports.down = async function down(knex) {
  for (const table of NEW_TABLES) await knex.schema.dropTableIfExists(table);
  if (await knex.schema.hasTable('rbac_modules')) {
    const mod = await knex('rbac_modules').where('code', MODULE.code).first();
    if (mod) {
      await knex('rbac_permissions').where('module_id', mod.id).del();
      await knex('rbac_modules').where('id', mod.id).del();
    }
  }
};

exports._internals = { mapLabels, q2Narrative, splitLabels };
