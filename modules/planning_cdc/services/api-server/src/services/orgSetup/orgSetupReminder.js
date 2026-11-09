// ── Org structure set-up reminder (D-20261015-07) ──
//
// Approvals and emails route through the people set on each business unit
// (division_codes): responsible person (head), M&E officer, focal person.
// When they are missing, approvals fall back to the directorate head or to
// the M&E pool and nobody owns the unit's emails. Each week, while a unit
// that owns workplan items this year misses one of them, the list is sent
// (event `org_setup.incomplete`, template `org-setup-incomplete`):
//   · to the addresses of `reminders.org_setup.to` (PR&A mailbox) with
//     `reminders.org_setup.cc` in copy, one email;
//   · when `to` is empty, through the notification wizard subscriptions
//     (system and RBM administrators by default).

'use strict';

const db = require('../../config/db');
const { DIVISION_ASSIGNMENT_ROLES } = require('@rbm/lib/user-divisions');
const { createLogger } = require('@rbm/lib/logger');
const { emitEvent } = require('../eventBusService');
const settings = require('../settingsService');
const { APP_URL } = require('../reporting/reportEmailDetails');

const log = createLogger('api-server').child({ module: 'orgSetupReminder' });

const EVENT_KEY = 'org_setup.incomplete';
const TEMPLATE_KEY = 'org-setup-incomplete';
const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;
const ORG_URL = `${APP_URL}/reference/org`;

/** The assignments checked, with the consequence of a gap. */
const ASSIGNMENTS = Object.freeze([
  { field: 'responsible_user_id', label: 'Responsible person (head)' },
  { field: 'm_and_e_user_id', label: 'M&E officer' },
  // Focal persons are a team of user_divisions rows, no column (D-20261106-09).
  { label: 'Focal person', teamColumn: 'has_focal_team' },
]);

/** SQL: the unit `dc` has a focal person in user_divisions. Binding: the role. */
const FOCAL_TEAM_SQL = 'EXISTS (SELECT 1 FROM user_divisions ud WHERE ud.division_code = dc.code AND ud.role = ?)';
const FOCAL_ROLE = DIVISION_ASSIGNMENT_ROLES.FOCAL_PERSON;

const isHeld = (row, a) => Boolean(a.field ? row[a.field] : Number(row[a.teamColumn]));

/**
 * Business units owning workplan items in the year that miss a responsible
 * person, an M&E officer or a focal person.
 *
 * @param {string} fiscalYear
 * @returns {Promise<Array<{ code: string, name: string, missing: string[] }>>}
 * @throws {Error} on DB failure
 * @example await collectGaps('2026'); // [{ code: 'EPR', name: '…', missing: ['M&E officer'] }]
 */
async function collectGaps(fiscalYear) {
  const rows = await db('division_codes as dc')
    .whereNull('dc.alias_of')
    .whereExists(function ownsItems() {
      this.from('plan_nodes as p').whereRaw('p.responsible_division_code = dc.code').where('p.fiscal_year', fiscalYear);
    })
    .orderBy('dc.code')
    .select('dc.code', 'dc.division_name', ...ASSIGNMENTS.filter((a) => a.field).map((a) => `dc.${a.field}`),
      db.raw(`${FOCAL_TEAM_SQL} AS has_focal_team`, [FOCAL_ROLE]));
  return rows
    .map((r) => ({
      code: r.code,
      name: r.division_name || r.code,
      missing: ASSIGNMENTS.filter((a) => !isHeld(r, a)).map((a) => a.label),
    }))
    .filter((u) => u.missing.length);
}

/**
 * Valid addresses of a comma- or semicolon-separated setting.
 *
 * @param {string|null} raw
 * @returns {string[]}
 * @example emailList('pra@africacdc.org; x'); // ['pra@africacdc.org']
 */
const emailList = (raw) => String(raw || '').split(/[,;]/).map((e) => e.trim().toLowerCase()).filter((e) => EMAIL.test(e));

/** One outbox row to fixed addresses, the CC list in the payload (read by the worker). */
async function queueToMailbox({ to, cc, metadata, correlationId }) {
  await db('notification_outbox').insert({
    event_key: EVENT_KEY,
    recipient: to.join(', '),
    channel: 'email',
    status: 'queued',
    correlation_id: correlationId,
    payload: JSON.stringify({ template_key: TEMPLATE_KEY, metadata, cc }),
  });
}

/**
 * Send the units to complete, when there are any: to the configured mailbox
 * with its copy list, else through the wizard subscriptions.
 *
 * @param {Date} [now]
 * @returns {Promise<{ sent: boolean, units: number }>}
 * @throws {never} errors are logged
 * @example await remindOrgSetup();
 */
async function remindOrgSetup(now = new Date()) {
  try {
    const fiscalYear = String(now.getUTCFullYear());
    const units = await collectGaps(fiscalYear);
    if (!units.length) return { sent: false, units: 0 };
    const count = (label) => units.filter((u) => u.missing.includes(label)).length;
    const metadata = {
      fiscalYear,
      url: ORG_URL,
      units,
      counts: ASSIGNMENTS.map((a) => ({ label: a.label, count: count(a.label) })),
    };
    const correlationId = `org-setup-${now.toISOString().slice(0, 10)}`;
    const to = emailList(await settings.getSetting('reminders.org_setup.to', ''));
    if (to.length) {
      await queueToMailbox({ to, cc: emailList(await settings.getSetting('reminders.org_setup.cc', '')), metadata, correlationId });
    } else {
      await emitEvent({ eventKey: EVENT_KEY, entity: { id: 0, title: 'Org structure set-up' }, actor: null, correlationId, metadata });
    }
    return { sent: true, units: units.length };
  } catch (err) {
    log.error({ err: err && err.message }, 'org set-up reminder failed');
    return { sent: false, units: 0 };
  }
}

module.exports = { collectGaps, remindOrgSetup, emailList, EVENT_KEY, ASSIGNMENTS, FOCAL_TEAM_SQL, FOCAL_ROLE };
