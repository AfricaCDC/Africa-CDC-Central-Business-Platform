// ── Quarterly Report Export — shared aggregation + encoders ──
//
// Single source of truth for the canonical 20-column PRA quarterly report
// (one row per T3/T4 indicator × effective reporting division). Consumed by:
//   - routes/public/quarterlyReportExportRoutes.js  (API-key, JSON/CSV — external)
//   - routes/reporting/exportRoutes.js              (authenticated, XLSX/CSV — in-app)
//
// Keeping the aggregation here (instead of inline in a route) lets both the
// public and the in-app export return byte-for-byte identical rows. The string
// literals like "Division" are human-readable column headers, not entity types.

/* eslint-disable complexity, no-restricted-syntax --
 * Aggregator that assembles the 20-column PRA xlsx mirror from
 * plan_nodes × indicator_division_reports. Headers like "Division" are CSV/JSON
 * column labels (not ENTITY_TYPES). complexity: buildQuarterlyReportRows branches
 * once per indicator/report-precedence rule; splitting obscures the linear flow. */
'use strict';

const db = require('../../config/db');
const { PLAN_NODE_TYPES, STATUSES } = require('@rbm/lib/enums');

const OWNER_ROLE = 'OWNER';

// ── CSV encoding ─────────────────────────────────────────────────────
// A text cell starting with = + - @ (or a tab / CR) is a formula for Excel:
// a narrative like `=HYPERLINK(...)` would run when the file is opened. Such
// cells get a leading apostrophe; numbers (including negative) stay numbers
// (D-20261108-02).
const FORMULA_START = /^[=+\-@\t\r]/;
const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && FORMULA_START.test(s) && !Number.isFinite(Number(s))) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

/**
 * Encode rows to RFC-4180 CSV (CRLF line breaks).
 *
 * @param {Array<object>} rows
 * @param {string[]} headers - column order
 * @returns {string}
 */
const toCsv = (rows, headers) => {
  const lines = [headers.map(csvCell).join(',')];
  for (const r of rows) lines.push(headers.map((h) => csvCell(r[h])).join(','));
  return lines.join('\r\n');
};

// Styled XLSX builder extracted to ./styledXlsx.js (D-20260713-03) —
// re-exported below so existing consumers keep their import path.
const { toXlsxBuffer } = require('./styledXlsx');

/**
 * Canonical header order, used when there are zero rows (so an empty export
 * still carries the full column set).
 *
 * @param {string} fiscalYear
 * @param {string} quarter
 * @returns {string[]}
 */
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

function fallbackHeaders(fiscalYear, quarter) {
  return [
    'Directorate', 'Division', 'AHSS Pillar', 'Reported by', 'Priority area', 'Outcome indicator', 'Broad activity',
    'Tier 3/4 indicator',
    `Target ${fiscalYear}`, 'Q1 target', 'Q2 target', 'Q3 target', 'Q4 target',
    ...QUARTERS.map((q) => `${q} Achievement`),
    `${quarter} Narration`, `${quarter} Challenges`, `${quarter} Recommendation`,
  ];
}

/** Header set for a row set — keys of the first row, else the fallback list. */
function headersFor(rows, fiscalYear, quarter) {
  return rows.length ? Object.keys(rows[0]) : fallbackHeaders(fiscalYear, quarter);
}

function numOrEmpty(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
}

function joinListSemicolon(raw) {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((s) => String(s).trim()).filter(Boolean).join('; ');
  } catch { /* not JSON — treat as plain text, normalize newlines to ; */ }
  return String(raw).split(/\r?\n+/).map((s) => s.trim()).filter(Boolean).join('; ');
}

function sumQuarters(ind) {
  let tot = 0;
  let any = false;
  for (const q of ['q1_target_numeric', 'q2_target_numeric', 'q3_target_numeric', 'q4_target_numeric']) {
    const v = Number(ind[q]);
    if (Number.isFinite(v)) { tot += v; any = true; }
  }
  return any ? tot : '';
}

/**
 * Walk up the parent_id chain from every indicator, resolving the T2 outcome
 * indicator + OUTCOME_AREA ancestor (and its strategic_plan row).
 *
 * @param {number[]} indicatorIds
 * @returns {Promise<Map<number, {outcomeArea: object|null, t2: object|null, sp: object|null}>>}
 */
async function resolveAncestors(indicatorIds) {
  const out = new Map();
  if (!indicatorIds.length) return out;
  const seed = await db('plan_nodes').whereIn('id', indicatorIds).select('id', 'parent_id');
  const seedById = new Map(seed.map((r) => [r.id, r]));
  const byId = new Map();
  let frontier = seed.map((r) => r.parent_id).filter(Boolean);
  while (frontier.length) {
    const rows = await db('plan_nodes').whereIn('id', frontier)
      .select('id', 'parent_id', 'code', 'title', 'tier_id', 'node_type', 'strategic_plan_id');
    const next = [];
    for (const r of rows) {
      if (byId.has(r.id)) continue;
      byId.set(r.id, r);
      if (r.parent_id) next.push(r.parent_id);
    }
    frontier = next;
  }
  const spIds = [...new Set([...byId.values()].map((n) => n.strategic_plan_id).filter(Boolean))];
  const spRows = spIds.length
    ? await db('strategic_plan').whereIn('id', spIds).select('id', 'sp_code', 'short_name')
    : [];
  const spById = new Map(spRows.map((r) => [r.id, r]));

  for (const indId of indicatorIds) {
    let cur = seedById.get(indId)?.parent_id;
    let outcomeArea = null;
    let t2 = null;
    let sp = null;
    const visited = new Set();
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      const node = byId.get(cur);
      if (!node) break;
      if (!t2 && node.node_type === 'OUTCOME_INDICATOR' && node.tier_id === 2) {
        t2 = { id: node.id, code: node.code, title: node.title };
      }
      if (!outcomeArea && node.node_type === 'OUTCOME_AREA') {
        outcomeArea = { id: node.id, code: node.code, title: node.title };
        const row = node.strategic_plan_id ? spById.get(node.strategic_plan_id) : null;
        if (row) sp = { sp_code: row.sp_code, short_name: row.short_name };
      }
      if (t2 && outcomeArea) break;
      cur = node.parent_id;
    }
    out.set(indId, { outcomeArea, t2, sp });
  }
  return out;
}

/**
 * For T3/T4 indicator ids, map to linked BROAD_ACTIVITY rows + their parent T2.
 *
 * @param {number[]} indicatorIds
 * @returns {Promise<Map<number, {bas: object[], t2s: object[]}>>}
 */
async function resolveBroadActivityLinks(indicatorIds) {
  const out = new Map();
  if (!indicatorIds.length) return out;
  const rows = await db('indicator_broad_links as l')
    .join('plan_nodes as ba', 'ba.id', 'l.broad_activity_id')
    .leftJoin('plan_nodes as t2', 't2.id', 'ba.parent_id')
    .whereIn('l.indicator_id', indicatorIds)
    .select(
      'l.indicator_id as indicator_id',
      'ba.id as ba_id', 'ba.code as ba_code', 'ba.title as ba_title',
      't2.id as t2_id', 't2.code as t2_code', 't2.title as t2_title', 't2.node_type as t2_node_type', 't2.tier_id as t2_tier',
    )
    .orderBy(['l.indicator_id', 'ba.code']);
  for (const r of rows) {
    if (!out.has(r.indicator_id)) out.set(r.indicator_id, { bas: [], t2s: [], _seenT2: new Set() });
    const entry = out.get(r.indicator_id);
    entry.bas.push({ id: r.ba_id, code: r.ba_code, title: r.ba_title });
    const isT2 = r.t2_id && r.t2_node_type === 'OUTCOME_INDICATOR' && r.t2_tier === 2;
    if (isT2 && !entry._seenT2.has(r.t2_id)) {
      entry._seenT2.add(r.t2_id);
      entry.t2s.push({ id: r.t2_id, code: r.t2_code, title: r.t2_title });
    }
  }
  for (const entry of out.values()) delete entry._seenT2;
  return out;
}

/**
 * Build the 20-column quarterly report rows for a fiscal year + quarter,
 * optionally restricted to a set of owner division codes.
 *
 * @param {object} params
 * @param {string} params.fiscalYear
 * @param {string} params.quarter - e.g. 'Q1'
 * @param {string[]} [params.divFilter] - uppercased owner division codes; empty = all
 * @returns {Promise<Array<object>>} one row per indicator × effective division
 * @example
 * const rows = await buildQuarterlyReportRows({ fiscalYear: '2026', quarter: 'Q1' });
 */
// What the public API (partners' API keys) may see: published indicators and
// reports the review chain approved, or the owner marked not applicable
// (D-20261108-02). In-app exports keep every status.
const PUBLIC_INDICATOR_STATUSES = Object.freeze([STATUSES.APPROVED, STATUSES.IN_EXECUTION, STATUSES.CLOSED, STATUSES.ARCHIVED]);
const PUBLIC_REPORT_STATUSES = Object.freeze([STATUSES.APPROVED, STATUSES.NOT_APPLICABLE]);

async function buildQuarterlyReportRows({ fiscalYear, quarter, divFilter = [], publicOnly = false }) {
  const indicatorQuery = db('plan_nodes as p')
    .leftJoin('division_codes as dc', 'dc.code', 'p.responsible_division_code')
    .leftJoin('division_codes as dcp1', 'dcp1.code', 'dc.parent_code')
    .leftJoin('division_codes as dcp2', 'dcp2.code', 'dcp1.parent_code')
    .leftJoin('pillars as pil', 'pil.id', 'p.pillar_id')
    .where('p.node_type', PLAN_NODE_TYPES.OUTCOME_INDICATOR)
    .whereIn('p.tier_id', [3, 4])
    // One plan year only: since the T3/T4 carry-forward (D-20261009) every
    // indicator exists in 2026 AND 2027, and the 2027 copies padded the 2026
    // download with empty rows.
    .where('p.fiscal_year', String(fiscalYear))
    .select(
      'p.id', 'p.code', 'p.title',
      'p.responsible_division_code',
      'p.contributing_divisions',
      'pil.name as pillar_name',
      'dc.division_name',
      db.raw(`COALESCE(
        NULLIF(dc.directorate, ''),
        CASE WHEN dcp1.level_type = 'directorate' THEN dcp1.division_name END,
        CASE WHEN dcp2.level_type = 'directorate' THEN dcp2.division_name END
      ) as directorate`),
      'p.parent_id',
      'p.target_y1_numeric',
      'p.q1_target_numeric', 'p.q2_target_numeric',
      'p.q3_target_numeric', 'p.q4_target_numeric',
      'p.tier_id',
    );
  if (divFilter.length) indicatorQuery.whereIn('p.responsible_division_code', divFilter);
  if (publicOnly) indicatorQuery.whereIn('p.status', PUBLIC_INDICATOR_STATUSES);

  const indicators = await indicatorQuery;
  if (!indicators.length) return [];

  const indicatorIds = indicators.map((i) => i.id);
  const ancestors = await resolveAncestors(indicatorIds);

  const reportQuery = db('indicator_division_reports as r')
    .leftJoin('users as u', 'u.id', 'r.submitted_by')
    .leftJoin('division_codes as dc', 'dc.code', 'r.division_code')
    .whereIn('r.plan_node_id', indicatorIds)
    .where('r.fiscal_year', fiscalYear)
    // Every quarter: the sheet carries Q1-Q4 achievements (D-20261013-06);
    // narration, challenges and recommendations stay those of `quarter`.
    .select(
      'r.plan_node_id', 'r.quarter', 'r.division_code', 'r.role', 'r.actual_value',
      'r.narrative', 'r.challenges', 'r.recommendations', 'r.status',
      'r.submitted_at',
      'dc.level_type as reporter_level', 'dc.division_name as reporter_name',
      'u.first_name as reporter_first', 'u.last_name as reporter_last',
    );
  if (publicOnly) reportQuery.whereIn('r.status', PUBLIC_REPORT_STATUSES);
  const reports = await reportQuery;

  const divs = await db('division_codes').select('code', 'parent_code', 'level_type');
  const parentOf = new Map();
  const levelOf = new Map();
  for (const d of divs) {
    if (!d.code) continue;
    const up = d.code.toUpperCase();
    parentOf.set(up, d.parent_code ? d.parent_code.toUpperCase() : null);
    levelOf.set(up, d.level_type);
  }
  const directorateAncestors = (code) => {
    if (!code) return [];
    const acc = [];
    const visited = new Set();
    let cur = parentOf.get(code.toUpperCase());
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      if (levelOf.get(cur) === 'directorate') acc.push(cur);
      cur = parentOf.get(cur);
    }
    return acc;
  };

  const specActs = await db('plan_nodes')
    .where('node_type', PLAN_NODE_TYPES.SPECIFIC_ACTIVITY)
    .whereIn('linked_indicator_id', indicatorIds)
    .select('linked_indicator_id', 'responsible_division_code', 'contributing_divisions');
  const specsByInd = new Map();
  for (const sa of specActs) {
    if (!specsByInd.has(sa.linked_indicator_id)) specsByInd.set(sa.linked_indicator_id, []);
    specsByInd.get(sa.linked_indicator_id).push(sa);
  }
  const parseContribs = (raw) => {
    try {
      if (!raw) return [];
      if (Array.isArray(raw)) return raw;
      return JSON.parse(raw);
    } catch { return []; }
  };
  const expectedCodesFor = (ind) => {
    const set = new Set();
    if (ind.responsible_division_code) set.add(String(ind.responsible_division_code).toUpperCase());
    for (const c of parseContribs(ind.contributing_divisions)) if (c) set.add(String(c).toUpperCase());
    for (const sa of (specsByInd.get(ind.id) || [])) {
      if (sa.responsible_division_code) set.add(String(sa.responsible_division_code).toUpperCase());
      for (const c of parseContribs(sa.contributing_divisions)) if (c) set.add(String(c).toUpperCase());
    }
    return set;
  };

  const reportsByInd = new Map();
  for (const r of reports) {
    const key = `${r.plan_node_id}|${r.quarter}`;
    if (!reportsByInd.has(key)) reportsByInd.set(key, []);
    reportsByInd.get(key).push(r);
  }
  const effectiveReportForIndicator = (ind, q) => {
    const list = reportsByInd.get(`${ind.id}|${q}`) || [];
    const owner = list.find((r) => r.role === OWNER_ROLE);
    if (owner) return owner;
    const expected = expectedCodesFor(ind);
    const legitContribs = list.filter((r) => r.role === 'CONTRIB'
      && expected.has(String(r.division_code || '').toUpperCase()));
    if (!legitContribs.length) return null;
    const ownerDivCode = (ind.responsible_division_code || '').toUpperCase();
    const ancestorSet = new Set(directorateAncestors(ownerDivCode));
    const directorateTakeover = legitContribs.find((r) => ancestorSet.has(String(r.division_code || '').toUpperCase()));
    if (directorateTakeover) return directorateTakeover;
    const byRecent = [...legitContribs].sort((a, b) => {
      const ta = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
      const tb = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
      return tb - ta;
    });
    return byRecent[0] || null;
  };

  const linksByIndicator = await resolveBroadActivityLinks(indicatorIds);

  return indicators.map((ind) => {
    const r = effectiveReportForIndicator(ind, quarter) || {};
    const achievements = Object.fromEntries(QUARTERS.map((q) => [
      `${q} Achievement`,
      q === quarter ? numOrEmpty(r.actual_value) : numOrEmpty((effectiveReportForIndicator(ind, q) || {}).actual_value),
    ]));
    const a = ancestors.get(ind.id) || {};
    const reporterName = [r.reporter_first, r.reporter_last].filter(Boolean).join(' ').trim();
    const reportedBy = r.division_code
      ? `${r.reporter_name || r.division_code}${reporterName ? ` (${reporterName})` : ''}${r.role === 'CONTRIB' ? ' [on behalf]' : ''}`
      : '';
    const sp = a.sp || null;
    const priorityArea = sp ? `${sp.sp_code}${sp.short_name ? ` — ${sp.short_name}` : ''}` : '';
    const annualTarget = numOrEmpty(ind.target_y1_numeric) !== ''
      ? numOrEmpty(ind.target_y1_numeric)
      : sumQuarters(ind);
    const links = linksByIndicator.get(ind.id) || { bas: [], t2s: [] };
    const baLabel = links.bas.map((b) => `${b.code} — ${b.title}`).join('; ');
    const t2s = links.t2s.length ? links.t2s : (a.t2 ? [a.t2] : []);
    const outcome = t2s.map((t) => `${t.code} — ${t.title}`).join('; ');
    const tierLabel = ind.tier_id === 4 ? 'T4' : 'T3';
    return {
      'Directorate':                       ind.directorate || '',
      'Division':                          ind.division_name || ind.responsible_division_code || '',
      'AHSS Pillar':                       ind.pillar_name || '',
      'Reported by':                       reportedBy,
      'Priority area':                     priorityArea,
      'Outcome indicator':                 outcome,
      'Broad activity':                    baLabel,
      'Tier 3/4 indicator':                `${tierLabel} — ${ind.code || ''} — ${ind.title || ''}`.replace(/—\s*—/g, '—').trim(),
      [`Target ${fiscalYear}`]:            annualTarget,
      'Q1 target':                         numOrEmpty(ind.q1_target_numeric),
      'Q2 target':                         numOrEmpty(ind.q2_target_numeric),
      'Q3 target':                         numOrEmpty(ind.q3_target_numeric),
      'Q4 target':                         numOrEmpty(ind.q4_target_numeric),
      ...achievements,
      [`${quarter} Narration`]:            r.narrative || '',
      [`${quarter} Challenges`]:           joinListSemicolon(r.challenges),
      [`${quarter} Recommendation`]:       joinListSemicolon(r.recommendations),
    };
  });
}

module.exports = {
  buildQuarterlyReportRows,
  csvCell,
  toCsv,
  toXlsxBuffer,
  fallbackHeaders,
  headersFor,
};
