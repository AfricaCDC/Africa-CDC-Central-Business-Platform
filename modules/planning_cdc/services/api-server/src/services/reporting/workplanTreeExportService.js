// ── Workplan Tree Export Service ──
//
// Builds the external workplan payload: each Tier 3/4 indicator with the
// SPECIFIC activities that target it (specific.linked_indicator_id →
// indicator.id), and each specific carries its parent BROAD activity as
// embedded context (specific.parent_id → broad.id). In the real data
// model broads hang off Tier-2 indicators while specifics link to T3/T4
// indicators — so the export is keyed on the linked-indicator relation,
// not a single parent chain. Batched queries only (no per-node
// enrichment). Consumed by routes/public/workplanExportRoutes.js.
// Spec: docs/superpowers/specs/2026-07-24-public-workplan-api-design.md
'use strict';

const knex = require('../../config/db');
const { PUBLIC_STATUSES } = require('../../routes/plan-nodes/_helpers');
const { resolveAliases } = require('../divisionAliasService');

// plan_nodes.node_type column-enum wire values (NOT ENTITY_TYPES from
// @rbm/lib/enums — these are the DB tree taxonomy, same P-31 exception the
// plan-nodes route files carry).
const NODE_INDICATOR = 'OUTCOME_INDICATOR';
const NODE_BROAD = 'BROAD_ACTIVITY';
// eslint-disable-next-line no-restricted-syntax -- plan_nodes.node_type column enum, not an ENTITY_TYPES identifier.
const NODE_SPECIFIC = 'SPECIFIC_ACTIVITY';

const num = (v) => (v === null || v === undefined ? null : parseFloat(v));
// null-coalescing helper: keep 0/false, blank empty strings to null.
const str = (v) => (v === null || v === undefined || v === '' ? null : v);

/** Build the four id→object lookup maps used to enrich the tree. */
async function buildLookupMaps(nodes) {
  const divCodes = new Set();
  const userIds = new Set();
  const pillarIds = new Set();
  const uomIds = new Set();
  for (const n of nodes) {
    if (n.responsible_division_code) divCodes.add(n.responsible_division_code);
    if (n.focal_user_id) userIds.add(n.focal_user_id);
    if (n.pillar_id) pillarIds.add(n.pillar_id);
    if (n.unit_of_measure_id) uomIds.add(n.unit_of_measure_id);
  }
  const [divRows, userRows, pillarRows, uomRows] = await Promise.all([
    divCodes.size ? knex('division_codes').whereIn('code', [...divCodes]).select('code', 'division_name') : [],
    userIds.size ? knex('users').whereIn('id', [...userIds]).select('id', 'first_name', 'last_name', 'full_name') : [],
    pillarIds.size ? knex('pillars').whereIn('id', [...pillarIds]).select('id', 'name') : [],
    uomIds.size ? knex('units_of_measure').whereIn('id', [...uomIds]).select('id', 'code', 'label') : [],
  ]);
  return {
    divMap: new Map(divRows.map((d) => [d.code, { code: d.code, name: d.division_name }])),
    userMap: new Map(userRows.map((u) => {
      const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.full_name || '';
      return [u.id, { id: u.id, name }];
    })),
    pillarMap: new Map(pillarRows.map((p) => [p.id, { id: p.id, name: p.name }])),
    uomMap: new Map(uomRows.map((u) => [u.id, { code: u.code, label: u.label }])),
  };
}

/** Group an array by a key field into a Map<key, item[]>. */
function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

/** Broad activity as embedded parent context of a specific (no nested specifics). */
function mapBroadContext(b, division) {
  if (!b) return null;
  return {
    id: b.id,
    code: b.code,
    title: b.title,
    status: b.status,
    division: division(b.responsible_division_code),
    budget_main: num(b.budget_main),
    start_date: str(b.start_date),
    end_date: str(b.end_date),
  };
}

function mapSpecificNode(s, maps, division, broadById) {
  const operational = s.is_operational === null || s.is_operational === undefined
    ? null : !!s.is_operational;
  return {
    id: s.id,
    code: s.code,
    title: s.title,
    status: s.status,
    division: division(s.responsible_division_code),
    broad_activity: mapBroadContext(broadById.get(s.parent_id), division),
    // Kept for existing consumers: the first secondary division (D-20261026-02).
    secondary_division_code: parseContributing(s.secondary_division_codes)[0] || null,
    secondary_division_codes: parseContributing(s.secondary_division_codes),
    contributing_divisions: parseContributing(s.contributing_divisions),
    focal_person: s.focal_user_id ? maps.userMap.get(s.focal_user_id) || null : null,
    activity_type: str(s.activity_type),
    location: str(s.location),
    is_operational: operational,
    budget_main: num(s.budget_main),
    q1_budget: num(s.q1_budget),
    q2_budget: num(s.q2_budget),
    q3_budget: num(s.q3_budget),
    q4_budget: num(s.q4_budget),
    budget_2027: num(s.budget_2027),
    budget_2028: num(s.budget_2028),
    primary_funding_source: str(s.primary_funding_source),
    other_funding_source: str(s.other_funding_source),
    grant_name: str(s.grant_name),
    budgeting_arrangement: str(s.budgeting_arrangement),
    start_date: str(s.start_date),
    end_date: str(s.end_date),
  };
}

function mapIndicatorNode(i, maps, division, specificsByIndicator) {
  return {
    id: i.id,
    code: i.code,
    title: i.title,
    tier: i.tier_id ? Number(i.tier_id) : null,
    status: i.status,
    fiscal_year: i.fiscal_year,
    pillar: i.pillar_id ? maps.pillarMap.get(i.pillar_id) || null : null,
    division: division(i.responsible_division_code),
    uom: i.unit_of_measure_id ? maps.uomMap.get(i.unit_of_measure_id) || null : null,
    baseline: num(i.baseline_numeric),
    targets: {
      y1: num(i.target_y1_numeric),
      y2: num(i.target_y2_numeric),
      y3: num(i.target_y3_numeric),
    },
    specific_activities: specificsByIndicator.get(i.id) || [],
  };
}

function parseContributing(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  return [];
}

/**
 * Expand a division-code filter with aliases. Empty filter → null (no filtering).
 *
 * @param {string[]} divFilter - upper-cased division codes
 * @returns {Promise<Set<string>|null>}
 * @example await expandDivisionFilter(['DPHI']) // Set {'DPHI', ...aliases}
 */
async function expandDivisionFilter(divFilter) {
  if (!divFilter || !divFilter.length) return null;
  const set = new Set();
  for (const code of divFilter) {
    const aliases = await resolveAliases(code).catch(() => [code]);
    for (const c of aliases) set.add(String(c).toUpperCase());
    set.add(code);
  }
  return set;
}

/** Fetch specifics targeting the given indicator ids (linked_indicator_id). */
function fetchSpecificsForIndicators(indicatorIds) {
  if (!indicatorIds.length) return Promise.resolve([]);
  return knex('plan_nodes')
    .where('node_type', NODE_SPECIFIC)
    .whereIn('linked_indicator_id', indicatorIds)
    .whereIn('status', PUBLIC_STATUSES)
    .orderBy('sort_order');
}

/** Fetch the broad parents (by id) of the given specifics — embedded context. */
function fetchBroadParents(parentIds) {
  const ids = [...new Set(parentIds.filter(Boolean))];
  if (!ids.length) return Promise.resolve([]);
  return knex('plan_nodes')
    .where('node_type', NODE_BROAD)
    .whereIn('id', ids)
    .select('*');
}

/**
 * Build the workplan export: each Tier 3/4 indicator with the SPECIFIC
 * activities that target it (linked_indicator_id), every specific
 * carrying its parent BROAD activity as embedded context.
 *
 * @param {{fiscalYear: string, tiers: number[], divFilter: string[]}} opts
 * @returns {Promise<{meta: object, data: Array<object>}>}
 * @throws {Error} on DB failure
 * @example const { meta, data } = await buildWorkplanTree({ fiscalYear: '2026', tiers: [3, 4], divFilter: [] });
 */
async function buildWorkplanTree({ fiscalYear, tiers, divFilter }) {
  const divSet = await expandDivisionFilter(divFilter);
  const inDiv = (code) => !divSet || (code && divSet.has(String(code).toUpperCase()));

  const indicators = await knex('plan_nodes')
    .where('node_type', NODE_INDICATOR)
    .whereIn('tier_id', tiers)
    .where('fiscal_year', fiscalYear)
    .whereIn('status', PUBLIC_STATUSES)
    .orderBy('sort_order');
  const keptIndicators = indicators.filter((i) => inDiv(i.responsible_division_code));
  const indicatorIds = new Set(keptIndicators.map((i) => i.id));

  const specifics = await fetchSpecificsForIndicators([...indicatorIds]);
  // Keep specifics that both target a kept indicator AND pass the division filter.
  const keptSpecifics = specifics.filter(
    (s) => indicatorIds.has(s.linked_indicator_id) && inDiv(s.responsible_division_code),
  );

  const broads = await fetchBroadParents(keptSpecifics.map((s) => s.parent_id));
  const broadById = new Map(broads.map((b) => [b.id, b]));

  const maps = await buildLookupMaps([...keptIndicators, ...keptSpecifics, ...broads]);
  const division = (code) => (code ? maps.divMap.get(code) || { code, name: null } : null);

  // Group mapped specifics under the T3/T4 indicator they target.
  const rawByIndicator = groupBy(keptSpecifics, (s) => s.linked_indicator_id);
  const specificsByIndicator = new Map();
  for (const [indicatorId, rows] of rawByIndicator) {
    specificsByIndicator.set(indicatorId, rows.map((s) => mapSpecificNode(s, maps, division, broadById)));
  }

  const data = keptIndicators.map((i) => mapIndicatorNode(i, maps, division, specificsByIndicator));

  const uniqueBroads = new Set(keptSpecifics.map((s) => s.parent_id).filter(Boolean));
  const meta = {
    fiscal_year: fiscalYear,
    generated_at: new Date().toISOString(),
    counts: {
      indicators: data.length,
      specific_activities: keptSpecifics.length,
      broad_activities: uniqueBroads.size,
    },
  };
  return { meta, data };
}

const CSV_HEADERS = [
  'indicator_code', 'indicator_title', 'tier', 'indicator_division', 'pillar',
  'broad_code', 'broad_title', 'broad_division', 'broad_budget',
  'specific_code', 'specific_title', 'specific_status', 'specific_division',
  'secondary_division', 'contributing_divisions', 'focal_person',
  'activity_type', 'location', 'budget_main',
  'q1_budget', 'q2_budget', 'q3_budget', 'q4_budget',
  'budget_2027', 'budget_2028',
  'primary_funding_source', 'other_funding_source', 'grant_name',
  'budgeting_arrangement', 'start_date', 'end_date',
];

/**
 * Flatten to one row per specific activity: the T3/T4 indicator columns,
 * then the specific's parent BROAD columns (from the embedded
 * broad_activity), then the specific columns. An indicator with no
 * specifics still yields one row (empty specific/broad columns) so every
 * indicator appears in Excel.
 *
 * @param {Array<object>} data - output of buildWorkplanTree().data
 * @returns {Array<object>} rows keyed by CSV_HEADERS
 * @example flattenWorkplanTree(data)[0].indicator_code
 */
/** One flat CSV row for a specific activity, given its indicator columns. */
function specificRow(s, indCols) {
  const b = s.broad_activity;
  return {
    ...indCols,
    broad_code: b ? b.code : null,
    broad_title: b ? b.title : null,
    broad_division: b && b.division ? b.division.code : null,
    broad_budget: b ? b.budget_main : null,
    specific_code: s.code,
    specific_title: s.title,
    specific_status: s.status,
    specific_division: s.division ? s.division.code : null,
    secondary_division: s.secondary_division_codes.join('|'),
    contributing_divisions: s.contributing_divisions.join('|'),
    focal_person: s.focal_person ? s.focal_person.name : null,
    activity_type: s.activity_type,
    location: s.location,
    budget_main: s.budget_main,
    q1_budget: s.q1_budget,
    q2_budget: s.q2_budget,
    q3_budget: s.q3_budget,
    q4_budget: s.q4_budget,
    budget_2027: s.budget_2027,
    budget_2028: s.budget_2028,
    primary_funding_source: s.primary_funding_source,
    other_funding_source: s.other_funding_source,
    grant_name: s.grant_name,
    budgeting_arrangement: s.budgeting_arrangement,
    start_date: s.start_date,
    end_date: s.end_date,
  };
}

function flattenWorkplanTree(data) {
  const rows = [];
  for (const ind of data) {
    const indCols = {
      indicator_code: ind.code,
      indicator_title: ind.title,
      tier: ind.tier,
      indicator_division: ind.division ? ind.division.code : null,
      pillar: ind.pillar ? ind.pillar.name : null,
    };
    if (!ind.specific_activities.length) {
      rows.push({ ...indCols });
      continue;
    }
    for (const s of ind.specific_activities) {
      rows.push(specificRow(s, indCols));
    }
  }
  return rows;
}

// Same cell encoding as the quarterly export, formula guard included (D-20261108-02).
const { csvCell: csvEscape } = require('./quarterlyReportExportService');

/**
 * Serialize flattened rows to CSV (headers included, no BOM — the route adds it).
 *
 * @param {Array<object>} rows - output of flattenWorkplanTree()
 * @returns {string}
 * @example workplanCsv(rows).split('\n')[0] // header line
 */
function workplanCsv(rows) {
  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(CSV_HEADERS.map((h) => csvEscape(row[h])).join(','));
  }
  return lines.join('\r\n');
}

module.exports = { buildWorkplanTree, flattenWorkplanTree, workplanCsv, CSV_HEADERS };
