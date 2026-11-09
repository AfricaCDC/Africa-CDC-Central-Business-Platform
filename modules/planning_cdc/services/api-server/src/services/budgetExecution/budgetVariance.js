// ── Budget variance after a SAP import (automation roadmap, lot 5) ──
//
// D-20261105-13. Each broad activity with a released budget gets a flag:
//   · OVER  — execution (committed + spent) / released above
//             `alerts.budget.over_pct` (seeded 100);
//   · UNDER — from Q3, execution below the expected pace (completed quarters
//             of the import date x 25 %) minus `alerts.budget.under_gap_pct`
//             points (seeded 30).
// The Budget execution page shows the flag; after an import sent to the
// units, each unit with flagged activities is emailed once
// (event budget_execution.variance).

'use strict';

const { createLogger } = require('@rbm/lib/logger');
const settings = require('../settingsService');
const { emitEvent } = require('../eventBusService');
const { claim } = require('../reminderLog');
const { APP_URL } = require('../reporting/reportEmailDetails');
const { activityExecution } = require('./budgetExecutionQuery');
const { BUDGET_VARIANCE, BUDGET_VARIANCE_CONFIG } = require('@rbm/lib/enums');

const log = createLogger('api-server').child({ module: 'budgetVariance' });
const EVENT_KEY = 'budget_execution.variance';
const UNDER_FROM_QUARTER = 3;

// The driver reads a DATE as local midnight: take the local date parts, not
// toISOString(), which shifts to the previous day east of UTC.
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (d) => (d instanceof Date ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : String(d).slice(0, 10));
const quarterOf = (day) => Math.ceil(Number(day.slice(5, 7)) / 3);

/**
 * The thresholds and the expected pace at the import date.
 *
 * @param {Date|string} asOfDate - the import's as_of_date
 * @returns {Promise<{ overPct: number, underGapPct: number, expectedPct: number, checkUnder: boolean }>}
 * @example await varianceRules('2026-11-05'); // { overPct: 100, underGapPct: 30, expectedPct: 75, checkUnder: true }
 */
async function varianceRules(asOfDate) {
  const quarter = quarterOf(dayOf(asOfDate));
  return {
    overPct: await settings.getInt('alerts.budget.over_pct', 100),
    underGapPct: await settings.getInt('alerts.budget.under_gap_pct', 30),
    expectedPct: (quarter - 1) * 25,
    checkUnder: quarter >= UNDER_FROM_QUARTER,
  };
}

/**
 * The flag of one activity, or null.
 *
 * @param {{ released_budget: number, execution_pct: number|null }} a
 * @param {{ overPct: number, underGapPct: number, expectedPct: number, checkUnder: boolean }} rules
 * @returns {string|null} a BUDGET_VARIANCE value
 * @example varianceOf({ released_budget: 100, execution_pct: 120 }, rules); // 'OVER'
 */
function varianceOf(a, rules) {
  if (!Number(a.released_budget) || a.execution_pct === null || a.execution_pct === undefined) return null;
  if (a.execution_pct > rules.overPct) return BUDGET_VARIANCE.OVER;
  if (rules.checkUnder && a.execution_pct < rules.expectedPct - rules.underGapPct) return BUDGET_VARIANCE.UNDER;
  return null;
}

/**
 * Activities with `variance` (flag or null) and the `expected_pct` it was judged against.
 *
 * @param {object[]} activities - activityExecution rows
 * @param {object} rules - from varianceRules
 * @returns {object[]}
 * @example withVariance(items, await varianceRules(importRow.as_of_date));
 */
function withVariance(activities, rules) {
  return activities.map((a) => ({ ...a, variance: varianceOf(a, rules), expected_pct: rules.expectedPct }));
}

function sectionFor(flag, items, rules) {
  const intro = flag === BUDGET_VARIANCE.OVER
    ? `Committed and spent above ${rules.overPct} % of the released budget.`
    : `Less than ${rules.expectedPct - rules.underGapPct} % used, while ${rules.expectedPct} % of the year has passed.`;
  return {
    heading: `${BUDGET_VARIANCE_CONFIG[flag].label}: ${items.length}`,
    intro,
    items: items.map((a) => ({ code: a.code, title: a.title, meta: [`execution ${a.execution_pct} %`, `released ${Math.round(a.released_budget).toLocaleString('en-US')}`] })),
  };
}

function noticeFor(unit, flagged, rules, asOf) {
  const sections = Object.values(BUDGET_VARIANCE)
    .map((flag) => [flag, flagged.filter((a) => a.variance === flag)])
    .filter(([, items]) => items.length)
    .map(([flag, items]) => sectionFor(flag, items, rules));
  return {
    subject: `Budget execution ${unit}: ${flagged.length} activities to look at`,
    heading: 'Budget execution to look at',
    intro: `From the budget execution figures as at ${asOf}, these broad activities of ${unit} spend faster or slower than planned.`,
    sections,
    ctaLabel: 'Open the budget execution',
    ctaUrl: `${APP_URL}/`,
    footer: 'Sent once per budget execution import.',
  };
}

/**
 * After an import sent to the units: email each unit its flagged activities, once per import.
 *
 * @param {{ importRow: object, actor: object }} p - importRow: budget_execution_imports row
 * @returns {Promise<{ units: number }>}
 * @throws {never} failures are logged, the import stays
 * @example await alertVariance({ importRow, actor: req.user });
 */
async function alertVariance({ importRow, actor }) {
  try {
    if (!(await settings.getBool('alerts.budget.enabled', true))) return { units: 0 };
    return await emailUnits({ importRow, actor });
  } catch (err) {
    log.error({ err: err && err.message, importId: importRow.id }, 'budget variance alert failed');
    return { units: 0 };
  }
}

/** Flagged activities grouped by unit. */
function byUnitOf(items) {
  const byUnit = new Map();
  for (const a of items.filter((x) => x.variance && x.division_code)) {
    if (!byUnit.has(a.division_code)) byUnit.set(a.division_code, []);
    byUnit.get(a.division_code).push(a);
  }
  return byUnit;
}

async function emailUnits({ importRow, actor }) {
  const rules = await varianceRules(importRow.as_of_date);
  const items = withVariance(await activityExecution({ importId: importRow.id, fiscalYear: importRow.fiscal_year, divisions: null }), rules);
  let units = 0;
  for (const [unit, flagged] of byUnitOf(items)) {
    if (!(await claim({ kind: EVENT_KEY, entityType: 'BUDGET_EXECUTION_IMPORT', entityId: importRow.id, recipientId: 0, period: unit }))) continue;
    await emitEvent({
      eventKey: EVENT_KEY,
      entity: { id: importRow.id, title: `Budget execution ${unit}`, main_division_code: unit },
      actor,
      metadata: noticeFor(unit, flagged, rules, dayOf(importRow.as_of_date)),
      correlationId: `budget-variance-${importRow.id}-${unit}`,
    });
    units += 1;
  }
  return { units };
}

module.exports = { varianceRules, varianceOf, withVariance, alertVariance, dayOf, EVENT_KEY };
