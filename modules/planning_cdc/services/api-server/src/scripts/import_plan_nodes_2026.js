/**
 * Build the plan_nodes hierarchy from "2026 Workplan- 01.4.xlsx".
 *
 * The UI (Workplans page, PIRS, My Indicators, quarterly dashboard) reads
 * plan_nodes. This script makes a fresh install usable end-to-end.
 *
 * Hierarchy created (fiscal_year '2026' = FY4):
 *   OUTCOME_AREA        ← unique "Output Area" values      (code "1")
 *   ├── OUTCOME_INDICATOR ← unique indicator codes, T3/T4  (code "CHSISD.1.1-17")
 *   └── BROAD_ACTIVITY    ← unique broad activities        (code "1.01")
 *       └── SPECIFIC_ACTIVITY ← one per row                (code "1.0101")
 *             linked_indicator_id → its OUTCOME_INDICATOR node
 *
 * Also seeds plan_node_active_periods (FY4·Q1) for every T3/T4 indicator,
 * mirroring migration 20260419400000 which no-ops on an empty table.
 *
 * Idempotent: nodes are matched by (node_type, code).
 *
 * Usage:
 *   node src/scripts/import_plan_nodes_2026.js [--dry-run] [--file=<path>]
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const knex = require('knex')(require('../../knexfile').development);
const { STATUSES, NODE_TYPES } = require('@rbm/lib/enums');
const xlsx = require('xlsx');
const path = require('path');

const DEFAULT_FILE = path.resolve(__dirname, '../../../../2026 Workplan- 01.4.xlsx');
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const fileArg = args.find((a) => a.startsWith('--file='));
const FILE = fileArg ? fileArg.split('=')[1] : DEFAULT_FILE;

const FISCAL_YEAR = '2026';

// v01.4 layout (no SN/Division columns)
const COL = {
  outputArea: 0,
  broadActivity: 1,
  specificAct: 2,
  indicator: 3,
  tier: 4,
  baseline: 5,
  target2026: 6,
  q1Target: 7,
  q2Target: 8,
  q3Target: 9,
  q4Target: 10,
  budget: 11,
  q1Budget: 12,
  q2Budget: 13,
  q3Budget: 14,
  q4Budget: 15,
};

const cleanText = (v) => {
  if (v === null || v === undefined) return null;
  return String(v).replace(/\xa0/g, ' ').replace(/\s+/g, ' ').trim() || null;
};

const parseNum = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const parseNumOrNull = (v) => {
  if (v === null || v === undefined || v === '' || v === '-') return null;
  const n = parseFloat(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** "1.0101 Conduct the..." → { code: "1.0101", title: "Conduct the..." } */
const splitCode = (raw) => {
  const s = cleanText(raw);
  if (!s) return { code: null, title: null };
  const m = s.match(/^([0-9]+(?:\.[0-9]+)*)\.?\s+(.+)$/s);
  if (m) return { code: m[1], title: m[2].trim() };
  return { code: null, title: s };
};

/** "CHSISD.1.1-17_Name" → { code: "CHSISD.1.1-17", name: "Name" } */
const splitIndicator = (raw) => {
  const s = cleanText(raw);
  if (!s) return { code: null, name: null };
  const m = s.match(/^(.*?-\d+)[\s_](.+)$/s);
  if (m) return { code: m[1].trim(), name: m[2].trim() };
  return { code: s, name: s };
};

const divisionFromIndicator = (indCode, validCodes) => {
  if (!indCode) return null;
  const prefix = indCode.split('.')[0].trim();
  if (!prefix) return null;
  for (const cand of [prefix, prefix.replace(/&/g, ''), prefix.split('_')[0]]) {
    const upper = cand.toUpperCase();
    for (const code of validCodes) {
      if (code.toUpperCase() === upper) return code;
    }
  }
  return null;
};

async function upsertNode(existingByKey, node) {
  const key = `${node.node_type}::${node.code}`;
  const existing = existingByKey.get(key);
  if (DRY_RUN) return existing ? existing.id : -1;
  if (existing) {
    await knex('plan_nodes').where('id', existing.id).update(node);
    return existing.id;
  }
  const [id] = await knex('plan_nodes').insert(node);
  existingByKey.set(key, { id });
  return id;
}

// ── Step 1: OUTCOME_AREA nodes ─────────────────────────────────────
async function importOutcomeAreas(ctx) {
  const areaIds = new Map(); // outputArea text → node id
  let sort = 0;
  for (const r of ctx.rows) {
    const raw = cleanText(r[COL.outputArea]);
    if (!raw || areaIds.has(raw)) continue;
    const { code, title } = splitCode(raw);
    const id = await upsertNode(ctx.existingByKey, {
      node_type: NODE_TYPES.OUTCOME_AREA,
      code: code || String(areaIds.size + 1),
      title: title || raw,
      fiscal_year: FISCAL_YEAR,
      status: STATUSES.APPROVED,
      is_active: 1,
      sort_order: sort++,
    });
    areaIds.set(raw, id);
    ctx.stats.outcome_areas++;
  }
  return areaIds;
}

// ── Step 2: OUTCOME_INDICATOR nodes (T3/T4) ────────────────────────
async function importIndicators(ctx) {
  const indicatorIds = new Map(); // indicator code → node id
  for (const r of ctx.rows) {
    const { code, name } = splitIndicator(r[COL.indicator]);
    if (!code || indicatorIds.has(code)) continue;
    const tierRaw = cleanText(r[COL.tier]) || '';
    if (!tierRaw.toLowerCase().includes('tier')) continue; // '-' rows have no indicator
    const tier = tierRaw.includes('4') ? 4 : 3;
    const id = await upsertNode(ctx.existingByKey, {
      node_type: NODE_TYPES.OUTCOME_INDICATOR,
      code,
      indicator_code: code,
      title: name,
      parent_id: ctx.areaIds.get(cleanText(r[COL.outputArea])) || null,
      tier_id: tier,
      fiscal_year: FISCAL_YEAR,
      status: STATUSES.APPROVED,
      is_active: 1,
      responsible_division_code: divisionFromIndicator(code, ctx.validCodes),
      baseline_numeric: parseNumOrNull(r[COL.baseline]),
      // FY4 = 2026 (see 20260419300000_shift_y1_to_y4)
      target_y4: cleanText(r[COL.target2026]),
      target_y4_numeric: parseNumOrNull(r[COL.target2026]),
      q1_target_numeric: parseNumOrNull(r[COL.q1Target]),
      q2_target_numeric: parseNumOrNull(r[COL.q2Target]),
      q3_target_numeric: parseNumOrNull(r[COL.q3Target]),
      q4_target_numeric: parseNumOrNull(r[COL.q4Target]),
      sort_order: indicatorIds.size,
    });
    indicatorIds.set(code, id);
    ctx.stats.indicators++;
  }
  return indicatorIds;
}

// ── Step 3: BROAD_ACTIVITY nodes ───────────────────────────────────
async function importBroadActivities(ctx) {
  const broadIds = new Map(); // broad text → node id
  for (const r of ctx.rows) {
    const raw = cleanText(r[COL.broadActivity]);
    if (!raw || broadIds.has(raw)) continue;
    const { code, title } = splitCode(raw);
    const { code: indCode } = splitIndicator(r[COL.indicator]);
    const id = await upsertNode(ctx.existingByKey, {
      node_type: NODE_TYPES.BROAD_ACTIVITY,
      code: code || null,
      title: title || raw,
      parent_id: ctx.areaIds.get(cleanText(r[COL.outputArea])) || null,
      fiscal_year: FISCAL_YEAR,
      status: STATUSES.APPROVED,
      is_active: 1,
      responsible_division_code: divisionFromIndicator(indCode, ctx.validCodes),
      sort_order: broadIds.size,
    });
    broadIds.set(raw, id);
    ctx.stats.broads++;
  }
  return broadIds;
}

// ── Step 4: SPECIFIC_ACTIVITY nodes ────────────────────────────────
async function importSpecificActivities(ctx) {
  const seen = new Set();
  for (const r of ctx.rows) {
    const raw = cleanText(r[COL.specificAct]);
    if (!raw) continue;
    const { code, title } = splitCode(raw);
    const dedupKey = code || raw;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const { code: indCode } = splitIndicator(r[COL.indicator]);
    await upsertNode(ctx.existingByKey, {
      node_type: NODE_TYPES.SPECIFIC_ACTIVITY,
      code: code || null,
      title: title || raw,
      parent_id: ctx.broadIds.get(cleanText(r[COL.broadActivity])) || null,
      fiscal_year: FISCAL_YEAR,
      status: STATUSES.APPROVED,
      is_active: 1,
      responsible_division_code: divisionFromIndicator(indCode, ctx.validCodes),
      linked_indicator_id: indCode ? (ctx.indicatorIds.get(indCode) || null) : null,
      budget_total_2026: parseNum(r[COL.budget]),
      q1_budget: parseNum(r[COL.q1Budget]),
      q2_budget: parseNum(r[COL.q2Budget]),
      q3_budget: parseNum(r[COL.q3Budget]),
      q4_budget: parseNum(r[COL.q4Budget]),
      sort_order: seen.size,
    });
    ctx.stats.specifics++;
  }
}

// ── Step 5: active periods (FY4·Q1) for every T3/T4 indicator ──────
async function seedActivePeriods(ctx) {
  if (DRY_RUN) return;
  const inds = await knex('plan_nodes')
    .where({ node_type: NODE_TYPES.OUTCOME_INDICATOR })
    .whereIn('tier_id', [3, 4])
    .pluck('id');
  if (!inds.length) return;
  await knex('plan_node_active_periods')
    .insert(inds.map((id) => ({ plan_node_id: id, fiscal_year_num: 4, quarter: 1 })))
    .onConflict(['plan_node_id', 'fiscal_year_num', 'quarter'])
    .ignore();
  ctx.stats.periods = inds.length;
}

async function main() {
  if (DRY_RUN) console.log('DRY-RUN mode — no DB writes\n');
  console.log(`Reading: ${FILE}`);
  const wb = xlsx.readFile(FILE);
  const sheetName = wb.SheetNames.find((s) =>
    // eslint-disable-next-line no-restricted-syntax -- sheet-name match, not an entity type
    s.toLowerCase().includes('workplan') && s.includes('2026')) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const allRows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null }).slice(1);
  const rows = allRows.filter((r) => cleanText(r[COL.specificAct]));
  console.log(`Sheet "${sheetName}": ${rows.length} rows\n`);

  const validCodes = new Set(await knex('division_codes').pluck('code'));
  const existing = await knex('plan_nodes').select('id', 'node_type', 'code');
  const existingByKey = new Map(existing.map((n) => [`${n.node_type}::${n.code}`, n]));

  const ctx = {
    rows,
    validCodes,
    existingByKey,
    stats: { outcome_areas: 0, indicators: 0, broads: 0, specifics: 0, periods: 0 },
  };
  ctx.areaIds = await importOutcomeAreas(ctx);
  ctx.indicatorIds = await importIndicators(ctx);
  ctx.broadIds = await importBroadActivities(ctx);
  await importSpecificActivities(ctx);
  await seedActivePeriods(ctx);

  console.log('═══════════════════════════════════');
  console.log(`  Outcome areas      : ${ctx.stats.outcome_areas}`);
  console.log(`  Outcome indicators : ${ctx.stats.indicators}`);
  console.log(`  Broad activities   : ${ctx.stats.broads}`);
  console.log(`  Specific activities: ${ctx.stats.specifics}`);
  console.log(`  Active periods FY4Q1: ${ctx.stats.periods}`);
  console.log('═══════════════════════════════════');
  if (DRY_RUN) console.log('Dry run complete — no changes made.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
