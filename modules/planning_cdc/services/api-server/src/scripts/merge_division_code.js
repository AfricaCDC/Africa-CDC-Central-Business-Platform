/**
 * Rename a division code, or merge one division into another.
 *
 *   node src/scripts/merge_division_code.js <FROM> <TO>          # dry run (rolled back)
 *   node src/scripts/merge_division_code.js <FROM> <TO> --apply  # commit
 *
 * TO missing  → rename (FROM's row is copied to TO).
 * TO existing → merge (TO keeps its fields, empty ones are filled from FROM).
 * Logic lives in services/divisionMergeService.js. Back up the DB before --apply.
 */

require('dotenv').config({ quiet: true });

const knex = require('../config/db');
const { createLogger } = require('@rbm/lib/logger');
const { mergeDivisionCode } = require('../services/divisionMergeService');

const log = createLogger('merge_division_code');
const [from, to] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const APPLY = process.argv.includes('--apply');
const DRY_RUN = 'DRY_RUN_ROLLBACK';

async function main() {
  if (!from || !to) throw new Error('Usage: merge_division_code.js <FROM> <TO> [--apply]');
  let summary;
  try {
    await knex.transaction(async (trx) => {
      summary = await mergeDivisionCode(trx, { from, to });
      if (!APPLY) throw new Error(DRY_RUN);
    });
  } catch (err) {
    if (err.message !== DRY_RUN) throw err;
  }
  const moved = Object.fromEntries(Object.entries(summary.columns).filter(([, v]) => v.moved || v.deduped));
  log.info('division.merge', { from, to, applied: APPLY, mode: summary.mode, moved, reports: summary.reports, contribJson: summary.contribJson });
}

main()
  .then(() => knex.destroy())
  .catch(async (err) => {
    log.error('division.merge_failed', { from, to, error: err.message });
    await knex.destroy();
    process.exitCode = 1;
  });
