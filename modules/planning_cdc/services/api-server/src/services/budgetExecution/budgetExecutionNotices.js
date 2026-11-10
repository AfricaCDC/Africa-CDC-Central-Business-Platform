// ── Budget execution — email to each business unit after an import (D-20261015-04) ──
//
// Event `budget_execution.imported`, one per business unit with linked
// activities. Recipients are set in the notification wizard (focal person and
// head of the unit by default); template budget-execution-summary.

'use strict';

const { createLogger } = require('@rbm/lib/logger');
const { emitEvent } = require('../eventBusService');
const { APP_URL } = require('../reporting/reportEmailDetails');
const { activityExecution, divisionExecution } = require('./budgetExecutionQuery');

const log = createLogger('api-server').child({ module: 'budgetExecutionNotices' });
const MAX_ACTIVITIES = 15;

const pick = (r) => ({
  released: r.released_budget, committed: r.committed, spent: r.spent, balance: r.balance,
  executionPct: r.execution_pct, spendPct: r.spend_pct,
});

/**
 * Email each business unit its balance and execution for an import.
 *
 * @param {{ importRow: object, actor: object }} p - importRow: budget_execution_imports row
 * @returns {Promise<{ divisions: number }>}
 * @throws {never} failures are logged, the import stays
 * @example await notifyDivisions({ importRow, actor: req.user });
 */
async function notifyDivisions({ importRow, actor }) {
  try {
    const activities = await activityExecution({ importId: importRow.id, fiscalYear: importRow.fiscal_year, divisions: null });
    const divisions = divisionExecution(activities).filter((d) => d.division_code);
    const asOf = String(importRow.as_of_date instanceof Date ? importRow.as_of_date.toISOString() : importRow.as_of_date).slice(0, 10);
    for (const d of divisions) {
      const own = activities.filter((a) => a.division_code === d.division_code)
        .sort((a, b) => b.balance - a.balance).slice(0, MAX_ACTIVITIES);
      await emitEvent({
        eventKey: 'budget_execution.imported',
        entity: { id: importRow.id, title: `Budget execution ${d.division_code}`, main_division_code: d.division_code },
        actor,
        correlationId: `budget-execution-${importRow.id}`,
        metadata: {
          division: d.division_name || d.division_code,
          asOf,
          fiscalYear: importRow.fiscal_year,
          ...pick(d),
          activities: own.map((a) => ({ code: a.code, title: a.title, ...pick(a) })),
          moreActivities: Math.max(0, d.activity_count - own.length),
          url: `${APP_URL}/`, // the home dashboard shows the business unit's execution
        },
      });
    }
    return { divisions: divisions.length };
  } catch (err) {
    log.error({ err, importId: importRow.id }, 'budget execution emails failed');
    return { divisions: 0 };
  }
}

module.exports = { notifyDivisions };
