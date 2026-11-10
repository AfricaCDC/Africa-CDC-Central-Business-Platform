// ── What an approval step is about (automation roadmap, lots 1 and 3) ──
//
// One summary per step: the item (type, code, title, unit, period), its
// approver, its escalation, and the link to its page. Used by the
// escalation email and by the « decide from the email » page.

'use strict';

const db = require('../../config/db');
const { APPROVAL_ENTITIES, APPROVAL_STEP_DECISIONS, STATUSES } = require('@rbm/lib/enums');

const APP_URL = (process.env.APP_BASE_URL || 'https://pra.africacdc.org').replace(/\/$/, '');

const ENTITY_SOURCES = Object.freeze({
  [APPROVAL_ENTITIES.PLAN_NODE]: {
    label: 'Specific activity',
    query: (id) => db('plan_nodes as p').where('p.id', id)
      .first('p.id as item_id', 'p.code', 'p.title', 'p.responsible_division_code as unit_code', 'p.fiscal_year'),
    link: (row) => `/plan/node/${row.item_id}`,
  },
  [APPROVAL_ENTITIES.ACTIVITY_REPORT]: {
    label: 'Activity report',
    query: (id) => db('activity_reports as r').leftJoin('plan_nodes as p', 'p.id', 'r.plan_node_id').where('r.id', id)
      .first('r.id as item_id', 'r.plan_node_id', 'p.code', 'p.title', 'p.responsible_division_code as unit_code', 'r.quarter', 'r.fiscal_year'),
    link: (row) => `/activity-report/${row.plan_node_id}/report/${row.item_id}`,
  },
  [APPROVAL_ENTITIES.INDICATOR_DIVISION_REPORT]: {
    label: 'Quarterly indicator report',
    query: (id) => db('indicator_division_reports as r').leftJoin('plan_nodes as p', 'p.id', 'r.plan_node_id').where('r.id', id)
      .first('r.id as item_id', 'r.plan_node_id', 'p.code', 'p.title', 'r.division_code as unit_code', 'r.quarter', 'r.fiscal_year'),
    link: (row) => `/quarterly-report/${row.plan_node_id}?q=${encodeURIComponent(row.quarter || '')}&division=${encodeURIComponent(row.unit_code || '')}${row.fiscal_year ? `&fy=${encodeURIComponent(row.fiscal_year)}` : ''}`,
  },
});

/**
 * Summary of an approval step, or null when the step does not exist.
 *
 * @param {number} stepId
 * @returns {Promise<null|{ step_id: number, step_label: string, decision: string, approver_id: number|null,
 *   approver_name: string|null, escalated_to_id: number|null, decided_by_name: string|null, completed_date: string|null,
 *   instance_status: string, entity_type: string, entity_id: number, type_label: string, code: string|null,
 *   title: string|null, unit_code: string|null, quarter: string|null, fiscal_year: string|null, link: string|null }>}
 * @throws {Error} on DB failure
 * @example await summarize(311)
 */
async function summarize(stepId) {
  const step = await db('approval_steps as s')
    .join('approval_instances as ai', 'ai.id', 's.approval_instance_id')
    .leftJoin('users as a', 'a.id', 's.approver_id')
    .leftJoin('users as d', 'd.id', 's.decided_by_id')
    .where('s.id', stepId)
    .first(
      's.id as step_id', 's.step_label', 's.decision', 's.approver_id', 's.escalated_to_id', 's.completed_date',
      'ai.status as instance_status', 'ai.entity_type', 'ai.entity_id',
      db.raw("TRIM(CONCAT(COALESCE(a.first_name,''),' ',COALESCE(a.last_name,''))) as approver_name"),
      db.raw("TRIM(CONCAT(COALESCE(d.first_name,''),' ',COALESCE(d.last_name,''))) as decided_by_name"),
    );
  if (!step) return null;
  const source = ENTITY_SOURCES[step.entity_type];
  const item = source ? await source.query(step.entity_id) : null;
  return { ...nullIfEmpty(step), type_label: source ? source.label : step.entity_type, ...itemFields(source, item) };
}

const ITEM_KEYS = ['code', 'title', 'unit_code', 'quarter', 'fiscal_year'];

/** Blank strings → null (names built with CONCAT are '' when nobody is set). */
const nullIfEmpty = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === '' ? null : v]));

function itemFields(source, item) {
  const fields = Object.fromEntries(ITEM_KEYS.map((k) => [k, (item && item[k]) || null]));
  return { ...fields, link: item ? source.link(item) : null };
}

/**
 * Absolute link to the « decide » page of the entity's current step, for
 * the Approve / Reject buttons of the emails (D-20261105-10). Null when the
 * entity has no open approval.
 *
 * @param {string} entityType - APPROVAL_ENTITIES value
 * @param {number} entityId
 * @returns {Promise<string|null>} never rejects
 * @example await decideUrlFor(APPROVAL_ENTITIES.ACTIVITY_REPORT, 7) // 'https://…/decide/311'
 */
async function decideUrlFor(entityType, entityId) {
  try {
    const step = await db('approval_steps as s')
      .join('approval_instances as ai', 'ai.id', 's.approval_instance_id')
      .where({ 'ai.entity_type': entityType, 'ai.entity_id': entityId, 'ai.status': STATUSES.IN_REVIEW })
      .where('s.decision', APPROVAL_STEP_DECISIONS.PENDING)
      .orderBy('s.step_order')
      .first('s.id');
    return step ? decideUrl(step.id) : null;
  } catch {
    return null; // the buttons are a convenience: never block the email
  }
}

/** Absolute link to the « decide » page of a step. */
const decideUrl = (stepId) => `${APP_URL}/decide/${stepId}`;

module.exports = { summarize, decideUrlFor, decideUrl, ENTITY_SOURCES };
