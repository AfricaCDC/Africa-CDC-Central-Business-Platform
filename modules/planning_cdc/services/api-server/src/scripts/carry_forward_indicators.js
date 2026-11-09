/**
 * Carry indicators from one fiscal year into the next, from a reviewed map.
 *
 *   node src/scripts/carry_forward_indicators.js src/db/data/carry_forward_2026_to_2027.json          # dry run
 *   node src/scripts/carry_forward_indicators.js src/db/data/carry_forward_2026_to_2027.json --apply  # commit
 *
 * Logic lives in services/planCarryForwardService.js. Back up the DB before --apply.
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const knex = require('../config/db');
const { createLogger } = require('@rbm/lib/logger');
const { carryForwardIndicators } = require('../services/planCarryForwardService');

const log = createLogger('carry_forward_indicators');
const mapFile = process.argv.slice(2).find((a) => !a.startsWith('--'));
const APPLY = process.argv.includes('--apply');
const DRY_RUN = 'DRY_RUN_ROLLBACK';

async function main() {
  if (!mapFile) throw new Error('Usage: carry_forward_indicators.js <map.json> [--apply]');
  const map = JSON.parse(fs.readFileSync(path.resolve(mapFile), 'utf8'));
  let summary;
  try {
    await knex.transaction(async (trx) => {
      summary = await carryForwardIndicators(trx, {
        fromYear: map.from_year,
        toYear: map.to_year,
        tierIds: map.tier_ids,
        parentCodeMap: map.parent_code_map,
        fillTargets: map.fill_targets,
        periodYearNum: map.period_year_num,
      });
      if (!APPLY) throw new Error(DRY_RUN);
    });
  } catch (err) {
    if (err.message !== DRY_RUN) throw err;
  }
  log.info('plan.carry_forward', { from: map.from_year, to: map.to_year, applied: APPLY, ...summary });
}

main()
  .then(() => knex.destroy())
  .catch(async (err) => {
    log.error('plan.carry_forward_failed', { error: err.message });
    await knex.destroy();
    process.exitCode = 1;
  });
