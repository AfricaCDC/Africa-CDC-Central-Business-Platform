// ── Contract: dropped tables are not referenced by application code ──
//
// Cleaning Phase 0.3 dropped 9 dead tables (migration 20260530000000). Migrations
// legitimately name them (the up drops them, the down recreates them), but NO
// route/service/query may still reference them — that code would throw
// "table doesn't exist" at runtime in staging/production. This test walks src/
// (excluding db/migrations) and fails if any dropped table name reappears.

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');
const MIGRATIONS = path.join(SRC, 'db', 'migrations');

const DROPPED_TABLES = [
  'plan_nodes_rcc_backup_20260415',
  'plan_nodes_rcc_backup_v2',
  'indicator_broad_links_rcc_backup_v2',
  'specifics_linked_rcc_backup_v2',
  'donor_results_afdb',
  'donor_results_gavi',
  'donor_results_mastercard',
  'donor_results_unicef',
  'donor_results_worldbank',
];

/** Recursively collect .js files under dir, skipping the migrations folder. */
function collectSourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full === MIGRATIONS) continue; // migrations may name dropped tables
      collectSourceFiles(full, acc);
    } else if (entry.isFile() && full.endsWith('.js')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('dropped tables are absent from application code', () => {
  const files = collectSourceFiles(SRC);

  it.each(DROPPED_TABLES)('no src file (outside migrations) references %s', (table) => {
    const offenders = files.filter((f) => fs.readFileSync(f, 'utf8').includes(table));
    expect(offenders).toEqual([]);
  });
});
