/**
 * Extract the AMERT 2027 budget proposal workbook into a committed JSON snapshot.
 *
 * The workbook ("26-09_Africa CDC 2027 Budget Proposal (AMERT).xlsx", one sheet,
 * 1503 rows) stays out of git; the JSON snapshot it produces is committed under
 * src/db/data/ and is what the later migration reads — same convention as
 * src/db/data/mis_workplan_2026.json (see migration 20260715000000).
 *
 * The sheet has two halves:
 *   1. Narrative (rows 12..155)  — result framework: KPIs, outcome indicators,
 *      outputs, output indicators (measuring unit, baseline, 3 yearly targets)
 *      plus assumption/risk blocks which are NOT extracted.
 *   2. Budget details (from the "Budget Details" row to the grand "Total" row)
 *      — the same hierarchy with money columns, plus activities and their
 *      costing lines.
 *
 * CAUTION — the two halves do NOT share the same numbering. The narrative has 7
 * outcome indicators; the budget half has 6: narrative #6 ("Percentage of local
 * manufactured vaccines...") carries no output and no budget, so the budget half
 * dropped it and renumbered narrative 7 -> 6 (narrative outputs 7.1/7.2 appear
 * as 6.1/6.2). Activity codes follow the BUDGET numbering. The two halves are
 * therefore joined by ordinal position / normalised title and NEVER by code, and
 * every code emitted comes from the budget half. The unbudgeted narrative
 * indicator is kept with the next free code and `unbudgeted: true`.
 *
 * READ-ONLY: this script never touches the database and never writes a file.
 * It prints the JSON document to stdout; the caller redirects it. On any
 * validation failure it prints the reasons to stderr, emits NOTHING on stdout
 * and exits non-zero.
 *
 * Usage:
 *   node src/scripts/extract_amert_2027.js > src/db/data/amert_2027_proposal.json
 *   node src/scripts/extract_amert_2027.js --file=/path/to/other.xlsx
 */

const path = require('path');
const xlsx = require('xlsx');

const SCRIPT_NAME = 'extract_amert_2027.js';
const SCRIPT_VERSION = '1.0.0';
const SOURCE_FILE_NAME = '26-09_Africa CDC 2027 Budget Proposal (AMERT).xlsx';
const DEFAULT_FILE = path.resolve(__dirname, '../../../..', SOURCE_FILE_NAME);
const FISCAL_YEARS = { y1: 2027, y2: 2028, y3: 2029 };

/** Hard expectations — regression detectors for a re-export, not speculative guards. */
const EXPECTED = Object.freeze({
  outcomes: 1,
  narrativeOutcomeIndicators: 7,
  budgetOutcomeIndicators: 6,
  outputs: 13,
  outputIndicators: 54,
  activities: 115,
  grandTotal2027: 105563940,
});

/** Money comparisons tolerate IEEE-754 drift only (observed worst case: 1.5e-11). */
const MONEY_EPSILON = 0.01;

/** Section labels as they appear in the sheet (free text, not entity types). */
const ITEM = Object.freeze({
  // eslint-disable-next-line no-restricted-syntax -- verbatim Excel cell label from the AMERT export, not an entity type
  OUTCOME: 'Outcome',
  OUTCOME_INDICATOR: 'Outcome Indicator',
  // eslint-disable-next-line no-restricted-syntax -- verbatim Excel cell label from the AMERT export, not an entity type
  OUTPUT: 'Output',
  OUTPUT_INDICATOR: 'Output Indicator',
  ACTIVITIES: 'Activities',
  TOTAL: 'Total',
});
const NARRATIVE_OUTPUT_INDICATORS = 'Output Indicators';
const BUDGET_DETAILS_LABEL = 'Budget Details';

/** Narrative half — 0-indexed columns of a raw row array. */
const N = Object.freeze({
  label: 6, code: 7, title: 8, unit: 9, baseline: 10, y1: 11, y2: 12, y3: 13,
});

/** Budget half — 0-indexed columns of a raw row array. */
const B = Object.freeze({
  item: 0, code: 1, title: 2, baseline: 3, target: 4,
  main: 5, passThrough: 6, techAssistance: 7, specialProjects: 8, total: 9,
  y2: 10, y3: 11, division: 12,
});

/** Costing line — 0-indexed columns of a raw row array. */
const C = Object.freeze({
  no: 2, element: 3, type: 4, unit: 5, unitCost: 6, quantity: 7, days: 8,
  a2027: 9, a2028: 10, a2029: 11,
});

const BUDGET_FIELDS = Object.freeze([
  'main', 'pass_through', 'tech_assistance', 'special_projects', 'total_2027', 'y2_2028', 'y3_2029',
]);

const ACTIVITY_CODE_RE = /^\d+(\.\d+){3}$/;

// ── Cell helpers ───────────────────────────────────────────────────

/**
 * Normalise a cell into trimmed text, or null when the cell is genuinely empty.
 *
 * @param {*} value Raw cell value from the sheet.
 * @returns {string|null} Trimmed single-spaced text, or null.
 * @example cleanText('  Output  Indicator ') // 'Output Indicator'
 */
function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\xa0/g, ' ').replace(/\s+/g, ' ').trim();
  return text === '' || text === '-' ? null : text;
}

/**
 * Read a money / quantity cell, defaulting blanks to 0 (never null).
 *
 * @param {*} value Raw cell value from the sheet.
 * @returns {number} Finite number, 0 when blank or unparsable.
 * @example parseMoney('1,250.50') // 1250.5
 */
function parseMoney(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[,\s$]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Read a baseline / target cell, keeping its native type (some targets are text
 * such as "14B"); genuinely absent values become null.
 *
 * @param {*} value Raw cell value from the sheet.
 * @returns {number|string|null} The number, the trimmed text, or null.
 * @example parseValue('14B') // '14B'
 */
function parseValue(value) {
  if (typeof value === 'number') return value;
  return cleanText(value);
}

/**
 * Render a hierarchy code as text — Excel returns "1.1" as the number 1.1.
 *
 * @param {*} value Raw cell value holding a code.
 * @returns {string|null} The code as text, or null when absent.
 * @example formatCode(1.1) // '1.1'
 */
function formatCode(value) {
  if (typeof value === 'number') return String(value);
  return cleanText(value);
}

/**
 * Normalise a title for cross-half matching: lowercase, alphanumeric words only.
 *
 * @param {string|null} title Title as read from either half.
 * @returns {string} Normalised key ('' when the title is absent).
 * @example normTitle('Number of  Member-States') // 'number of member states'
 */
function normTitle(title) {
  return String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Build the seven-field budget object shared by every level of the hierarchy.
 *
 * @param {Array} row Raw budget-half row array.
 * @returns {{main:number,pass_through:number,tech_assistance:number,special_projects:number,total_2027:number,y2_2028:number,y3_2029:number}} Budget figures.
 * @example budgetOf([null,null,null,null,null,10,0,0,0,10,0,0]).total_2027 // 10
 */
function budgetOf(row) {
  return {
    main: parseMoney(row[B.main]),
    pass_through: parseMoney(row[B.passThrough]),
    tech_assistance: parseMoney(row[B.techAssistance]),
    special_projects: parseMoney(row[B.specialProjects]),
    total_2027: parseMoney(row[B.total]),
    y2_2028: parseMoney(row[B.y2]),
    y3_2029: parseMoney(row[B.y3]),
  };
}

/**
 * Sum a budget field across a list of nodes carrying a `budget` object.
 *
 * @param {Array<{budget:Object}>} nodes Child nodes.
 * @param {string} field One of BUDGET_FIELDS.
 * @returns {number} The sum (0 for an empty list).
 * @example sumBudget([{ budget: { main: 2 } }], 'main') // 2
 */
function sumBudget(nodes, field) {
  return nodes.reduce((acc, node) => acc + node.budget[field], 0);
}

// ── Reading / splitting ────────────────────────────────────────────

/**
 * Read the workbook's first sheet as raw row arrays.
 *
 * @param {string} file Absolute path to the .xlsx file.
 * @returns {{sheetName:string, rows:Array<Array>}} Sheet name and its rows.
 * @throws {Error} When the file cannot be read or holds no sheet.
 * @example readSheet('C:/tmp/amert.xlsx').rows.length // 1503
 */
function readSheet(file) {
  const wb = xlsx.readFile(file);
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error(`No sheet found in ${file}`);
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1, defval: null, blankrows: true,
  });
  return { sheetName, rows };
}

/**
 * Locate the "Budget Details" separator and the grand "Total" row.
 *
 * @param {Array<Array>} rows Raw rows of the sheet.
 * @returns {{budgetStart:number, totalIndex:number}} 0-indexed row positions.
 * @throws {Error} When either anchor row is missing.
 * @example locateHalves(rows).budgetStart // 156
 */
function locateHalves(rows) {
  const budgetStart = rows.findIndex((r) => r && cleanText(r[0]) === BUDGET_DETAILS_LABEL);
  if (budgetStart < 0) throw new Error(`Anchor row "${BUDGET_DETAILS_LABEL}" not found`);
  let totalIndex = -1;
  for (let i = rows.length - 1; i > budgetStart; i -= 1) {
    if (cleanText((rows[i] || [])[0]) === ITEM.TOTAL) { totalIndex = i; break; }
  }
  if (totalIndex < 0) throw new Error(`Grand "${ITEM.TOTAL}" row not found`);
  return { budgetStart, totalIndex };
}

// ── Narrative half ─────────────────────────────────────────────────

/**
 * Build a narrative entry (indicator or output) from a narrative row.
 *
 * @param {Array} row Raw narrative row array.
 * @returns {{code:string|null,title:string|null,measuring_unit:string|null,baseline:*,target_2027:*,target_2028:*,target_2029:*}} Entry.
 * @example narrativeEntry(rows[16]).code // '1.1.1'
 */
function narrativeEntry(row) {
  return {
    code: formatCode(row[N.code]),
    title: cleanText(row[N.title]),
    measuring_unit: cleanText(row[N.unit]),
    baseline: parseValue(row[N.baseline]),
    target_2027: parseValue(row[N.y1]),
    target_2028: parseValue(row[N.y2]),
    target_2029: parseValue(row[N.y3]),
  };
}

/**
 * Decide which narrative bucket the current row belongs to, if any.
 *
 * @param {string|null} mode Label of the section currently open.
 * @param {string|null} label Label carried by this row (null = continuation).
 * @param {Array} row Raw narrative row array.
 * @returns {string|null} Bucket key, or null when the row is not extracted.
 * @example narrativeKey('Output Indicators', null, row) // 'outputIndicators'
 */
function narrativeKey(mode, label, row) {
  if (label && mode === ITEM.OUTCOME_INDICATOR) return 'outcomeIndicators';
  if (label && mode === ITEM.OUTPUT) return 'outputs';
  if (mode !== NARRATIVE_OUTPUT_INDICATORS) return null;
  const hasContent = cleanText(row[N.code]) && cleanText(row[N.title]);
  return hasContent ? 'outputIndicators' : null;
}

/**
 * Parse the narrative (result framework) half of the sheet.
 *
 * Assumption/risk blocks and the Strategic Objective KPI are skipped: the label
 * in col 6 opens a section and continuation rows leave that column empty.
 *
 * @param {Array<Array>} rows Raw rows of the sheet.
 * @param {number} endIndex Exclusive upper bound (the "Budget Details" row).
 * @returns {{outcomeIndicators:Array,outputs:Array,outputIndicators:Array}} Narrative entries in sheet order.
 * @example parseNarrative(rows, 156).outputIndicators.length // 54
 */
function parseNarrative(rows, endIndex) {
  const out = { outcomeIndicators: [], outputs: [], outputIndicators: [] };
  let mode = null;
  for (let i = 0; i < endIndex; i += 1) {
    const row = rows[i] || [];
    const label = cleanText(row[N.label]);
    if (label) mode = label;
    const key = narrativeKey(mode, label, row);
    if (key) out[key].push(narrativeEntry(row));
  }
  return out;
}

// ── Budget half ────────────────────────────────────────────────────

/** Internal row kinds — prefixed so they can never be mistaken for entity types. */
const ROW = Object.freeze({
  OUTCOME: 'ROW_OUTCOME',
  OUTCOME_INDICATOR: 'ROW_OUTCOME_INDICATOR',
  OUTPUT: 'ROW_OUTPUT',
  OUTPUT_INDICATOR: 'ROW_OUTPUT_INDICATOR',
  ACTIVITY: 'ROW_ACTIVITY',
  COSTING: 'ROW_COSTING',
});

const ITEM_KIND = new Map([
  [ITEM.OUTCOME, ROW.OUTCOME],
  [ITEM.OUTCOME_INDICATOR, ROW.OUTCOME_INDICATOR],
  [ITEM.OUTPUT, ROW.OUTPUT],
  [ITEM.OUTPUT_INDICATOR, ROW.OUTPUT_INDICATOR],
  [ITEM.ACTIVITIES, ROW.ACTIVITY],
]);

/**
 * Classify a budget-half row: a hierarchy level, an activity, a costing line,
 * or null for header/decoration rows.
 *
 * @param {Array} row Raw budget-half row array.
 * @returns {string|null} Row kind (a ROW.* value), or null when the row carries no data.
 * @example classifyBudgetRow([null, '1.1.1.02', 'Support...']) // 'ROW_ACTIVITY'
 */
function classifyBudgetRow(row) {
  const item = cleanText(row[B.item]);
  if (item) return ITEM_KIND.get(item) || null;
  const code = cleanText(row[B.code]);
  if (code) return ACTIVITY_CODE_RE.test(code) ? ROW.ACTIVITY : null;
  return typeof row[C.no] === 'number' ? ROW.COSTING : null;
}

/**
 * Parent output-indicator code of an activity: its first three code segments.
 *
 * @param {string|null} activityCode Four-segment activity code.
 * @returns {string|null} Three-segment prefix, or null when unavailable.
 * @example outputIndicatorPrefix('1.1.1.02') // '1.1.1'
 */
function outputIndicatorPrefix(activityCode) {
  if (!activityCode) return null;
  const parts = String(activityCode).split('.');
  return parts.length >= 4 ? parts.slice(0, 3).join('.') : null;
}

const BUDGET_HANDLERS = {
  [ROW.OUTCOME]: (ctx, row) => {
    ctx.outcome = { title: cleanText(row[B.title]), budget: budgetOf(row) };
  },
  [ROW.OUTCOME_INDICATOR]: (ctx, row) => {
    const entry = {
      code: formatCode(row[B.code]),
      title: cleanText(row[B.title]),
      baseline: parseValue(row[B.baseline]),
      target_2027: parseValue(row[B.target]),
      budget: budgetOf(row),
    };
    ctx.outcomeIndicators.push(entry);
    ctx.currentOutcomeIndicator = entry;
  },
  [ROW.OUTPUT]: (ctx, row) => {
    const entry = {
      code: formatCode(row[B.code]),
      title: cleanText(row[B.title]),
      outcome_indicator_code: ctx.currentOutcomeIndicator ? ctx.currentOutcomeIndicator.code : null,
      budget: budgetOf(row),
    };
    ctx.outputs.push(entry);
    ctx.currentOutput = entry;
  },
  [ROW.OUTPUT_INDICATOR]: (ctx, row) => {
    const entry = {
      code: formatCode(row[B.code]),
      title: cleanText(row[B.title]),
      output_code: ctx.currentOutput ? ctx.currentOutput.code : null,
      baseline: parseValue(row[B.baseline]),
      target_2027: parseValue(row[B.target]),
      budget: budgetOf(row),
    };
    ctx.outputIndicators.push(entry);
    ctx.currentOutputIndicator = entry;
  },
  [ROW.ACTIVITY]: (ctx, row) => {
    const code = cleanText(row[B.code]);
    const entry = {
      code,
      title: cleanText(row[B.title]),
      output_indicator_code: outputIndicatorPrefix(code),
      responsible_division_raw: cleanText(row[B.division]),
      budget: budgetOf(row),
    };
    ctx.activities.push(entry);
    ctx.currentActivity = entry;
  },
  [ROW.COSTING]: (ctx, row) => {
    ctx.costingLines.push({
      activity_code: ctx.currentActivity ? ctx.currentActivity.code : null,
      line_no: parseMoney(row[C.no]),
      cost_element: cleanText(row[C.element]),
      cost_type: cleanText(row[C.type]),
      measuring_unit: cleanText(row[C.unit]),
      unit_cost: parseMoney(row[C.unitCost]),
      quantity: parseMoney(row[C.quantity]),
      days_months: parseMoney(row[C.days]),
      amount_2027: parseMoney(row[C.a2027]),
      amount_2028: parseMoney(row[C.a2028]),
      amount_2029: parseMoney(row[C.a2029]),
    });
  },
};

/**
 * Parse the budget-details half of the sheet into flat, parent-linked lists.
 *
 * @param {Array<Array>} rows Raw rows of the sheet.
 * @param {number} startIndex Index of the "Budget Details" row (exclusive).
 * @param {number} endIndex Index of the grand "Total" row (exclusive).
 * @returns {{outcome:Object|null,outcomeIndicators:Array,outputs:Array,outputIndicators:Array,activities:Array,costingLines:Array}} Budget entries.
 * @example parseBudget(rows, 156, 1502).activities.length // 115
 */
function parseBudget(rows, startIndex, endIndex) {
  const ctx = {
    outcome: null,
    outcomeIndicators: [],
    outputs: [],
    outputIndicators: [],
    activities: [],
    costingLines: [],
    currentOutcomeIndicator: null,
    currentOutput: null,
    currentOutputIndicator: null,
    currentActivity: null,
  };
  for (let i = startIndex + 1; i < endIndex; i += 1) {
    const row = rows[i] || [];
    const kind = classifyBudgetRow(row);
    if (kind) BUDGET_HANDLERS[kind](ctx, row);
  }
  return ctx;
}

// ── Narrative <-> budget join ──────────────────────────────────────

/**
 * Match budget entries to narrative entries by normalised title, in order.
 *
 * @param {Array} budgetEntries Budget-half entries (authoritative for codes).
 * @param {Array} narrativeEntries Narrative-half entries, in sheet order.
 * @param {Array<string>} errors Accumulator for validation failures.
 * @param {string} label Human label used in error messages.
 * @returns {{pairs:Array<{budget:Object,narrative:Object}>, unmatched:Array}} Join result.
 * @example joinByTitle(budgetOIs, narrativeOIs, errors, 'outcome indicator').pairs.length // 6
 */
function joinByTitle(budgetEntries, narrativeEntries, errors, label) {
  const pairs = [];
  const used = new Set();
  let cursor = -1;
  for (const entry of budgetEntries) {
    const key = normTitle(entry.title);
    const index = narrativeEntries.findIndex((n, i) => !used.has(i) && normTitle(n.title) === key);
    if (index < 0) {
      errors.push(`${label} "${entry.code}" has no narrative match by title: "${entry.title}"`);
      continue;
    }
    if (index < cursor) {
      errors.push(`${label} "${entry.code}" matches narrative entry out of order (index ${index} after ${cursor})`);
    }
    cursor = index;
    used.add(index);
    pairs.push({ budget: entry, narrative: narrativeEntries[index] });
  }
  const unmatched = narrativeEntries.filter((_n, i) => !used.has(i));
  return { pairs, unmatched };
}

/**
 * Compare a baseline / target value across the two halves.
 *
 * @param {*} a Budget-half value.
 * @param {*} b Narrative-half value.
 * @returns {boolean} True when both halves agree.
 * @example sameValue(0.04, 0.04) // true
 */
function sameValue(a, b) {
  if (a === null && b === null) return true;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  return normTitle(a) === normTitle(b);
}

/**
 * Check that every joined pair agrees on baseline and 2027 target.
 *
 * @param {Array<{budget:Object,narrative:Object}>} pairs Joined pairs.
 * @param {Array<string>} errors Accumulator for validation failures.
 * @param {string} label Human label used in error messages.
 * @returns {void}
 * @example checkPairValues(pairs, errors, 'output indicator')
 */
function checkPairValues(pairs, errors, label) {
  for (const { budget, narrative } of pairs) {
    if (!sameValue(budget.baseline, narrative.baseline)) {
      errors.push(`${label} "${budget.code}" baseline mismatch: budget=${JSON.stringify(budget.baseline)} narrative=${JSON.stringify(narrative.baseline)}`);
    }
    if (!sameValue(budget.target_2027, narrative.target_2027)) {
      errors.push(`${label} "${budget.code}" 2027 target mismatch: budget=${JSON.stringify(budget.target_2027)} narrative=${JSON.stringify(narrative.target_2027)}`);
    }
  }
}

// ── Validation ─────────────────────────────────────────────────────

/**
 * Check the structural counts that a re-export must preserve.
 *
 * @param {Object} narrative Parsed narrative half.
 * @param {Object} budget Parsed budget half.
 * @param {Array<string>} errors Accumulator for validation failures.
 * @returns {void}
 * @example checkCounts(narrative, budget, errors)
 */
function checkCounts(narrative, budget, errors) {
  const actual = {
    outcomes: budget.outcome ? 1 : 0,
    narrativeOutcomeIndicators: narrative.outcomeIndicators.length,
    budgetOutcomeIndicators: budget.outcomeIndicators.length,
    outputs: budget.outputs.length,
    outputIndicators: budget.outputIndicators.length,
    activities: budget.activities.length,
  };
  for (const [key, want] of Object.entries(actual)) {
    if (want !== EXPECTED[key]) errors.push(`count mismatch: ${key} = ${want}, expected ${EXPECTED[key]}`);
  }
  if (narrative.outputs.length !== EXPECTED.outputs) {
    errors.push(`count mismatch: narrative outputs = ${narrative.outputs.length}, expected ${EXPECTED.outputs}`);
  }
  if (narrative.outputIndicators.length !== EXPECTED.outputIndicators) {
    errors.push(`count mismatch: narrative output indicators = ${narrative.outputIndicators.length}, expected ${EXPECTED.outputIndicators}`);
  }
}

/**
 * Check activity codes: no duplicates, and a parent output indicator for each.
 *
 * @param {Object} budget Parsed budget half.
 * @param {Array<string>} errors Accumulator for validation failures.
 * @returns {void}
 * @example checkActivityCodes(budget, errors)
 */
function checkActivityCodes(budget, errors) {
  const indicatorCodes = new Set(budget.outputIndicators.map((oi) => oi.code));
  const seen = new Set();
  for (const activity of budget.activities) {
    if (!activity.code) { errors.push('activity without a code'); continue; }
    if (seen.has(activity.code)) errors.push(`duplicate activity code "${activity.code}"`);
    seen.add(activity.code);
    if (!indicatorCodes.has(activity.output_indicator_code)) {
      errors.push(`activity "${activity.code}" has no matching output indicator "${activity.output_indicator_code}"`);
    }
  }
}

/**
 * Check every activity total against the sum of its costing lines (3 years).
 *
 * @param {Object} budget Parsed budget half.
 * @param {Array<string>} errors Accumulator for validation failures.
 * @returns {void}
 * @example checkCostingSums(budget, errors)
 */
function checkCostingSums(budget, errors) {
  const byActivity = new Map(budget.activities.map((a) => [a.code, a]));
  const sums = new Map(budget.activities.map((a) => [a.code, { total_2027: 0, y2_2028: 0, y3_2029: 0 }]));
  for (const line of budget.costingLines) {
    const bucket = sums.get(line.activity_code);
    if (!bucket) { errors.push(`costing line ${line.line_no} has no parent activity (code "${line.activity_code}")`); continue; }
    bucket.total_2027 += line.amount_2027;
    bucket.y2_2028 += line.amount_2028;
    bucket.y3_2029 += line.amount_2029;
  }
  for (const [code, bucket] of sums) {
    const activity = byActivity.get(code);
    for (const field of Object.keys(bucket)) {
      if (Math.abs(bucket[field] - activity.budget[field]) > MONEY_EPSILON) {
        errors.push(`activity "${code}" ${field} = ${activity.budget[field]} but its costing lines sum to ${bucket[field]}`);
      }
    }
  }
}

/**
 * Check a parent's budget against the sum of its children, field by field.
 *
 * @param {{budget:Object}} parent Parent node.
 * @param {Array<{budget:Object}>} children Child nodes.
 * @param {string} label Human label used in error messages.
 * @param {Array<string>} errors Accumulator for validation failures.
 * @returns {void}
 * @example checkRollup(output, itsIndicators, 'output 1.1', errors)
 */
function checkRollup(parent, children, label, errors) {
  for (const field of BUDGET_FIELDS) {
    const sum = sumBudget(children, field);
    if (Math.abs(sum - parent.budget[field]) > MONEY_EPSILON) {
      errors.push(`${label} ${field} = ${parent.budget[field]} but its children sum to ${sum}`);
    }
  }
}

/**
 * Group nodes by the value of a parent-link field.
 *
 * @param {Array<Object>} nodes Nodes to group.
 * @param {string} field Name of the parent-link field.
 * @returns {Map<string, Array<Object>>} Children keyed by parent code.
 * @example groupBy(activities, 'output_indicator_code').get('1.1.1').length // 2
 */
function groupBy(nodes, field) {
  const map = new Map();
  for (const node of nodes) {
    const key = node[field];
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(node);
  }
  return map;
}

/**
 * Check every rollup of the hierarchy: activities -> output indicator ->
 * output -> outcome indicator -> outcome, plus the grand total.
 *
 * @param {Object} budget Parsed budget half.
 * @param {Array} totalRow Raw grand "Total" row array.
 * @param {Array<string>} errors Accumulator for validation failures.
 * @returns {void}
 * @example checkHierarchyRollups(budget, rows[1502], errors)
 */
function checkHierarchyRollups(budget, totalRow, errors) {
  const activitiesByIndicator = groupBy(budget.activities, 'output_indicator_code');
  for (const indicator of budget.outputIndicators) {
    checkRollup(indicator, activitiesByIndicator.get(indicator.code) || [], `output indicator "${indicator.code}"`, errors);
  }
  const indicatorsByOutput = groupBy(budget.outputIndicators, 'output_code');
  for (const output of budget.outputs) {
    checkRollup(output, indicatorsByOutput.get(output.code) || [], `output "${output.code}"`, errors);
  }
  const outputsByIndicator = groupBy(budget.outputs, 'outcome_indicator_code');
  for (const indicator of budget.outcomeIndicators) {
    checkRollup(indicator, outputsByIndicator.get(indicator.code) || [], `outcome indicator "${indicator.code}"`, errors);
  }
  checkRollup(budget.outcome, budget.outcomeIndicators, 'outcome total', errors);
  const grand = budgetOf(totalRow);
  for (const field of BUDGET_FIELDS) {
    if (Math.abs(grand[field] - budget.outcome.budget[field]) > MONEY_EPSILON) {
      errors.push(`grand total row ${field} = ${grand[field]} but the outcome row holds ${budget.outcome.budget[field]}`);
    }
  }
  if (Math.abs(grand.total_2027 - EXPECTED.grandTotal2027) > MONEY_EPSILON) {
    errors.push(`grand total 2027 = ${grand.total_2027}, expected ${EXPECTED.grandTotal2027}`);
  }
}

/**
 * Join the two halves and validate the whole extraction.
 *
 * @param {Object} narrative Parsed narrative half.
 * @param {Object} budget Parsed budget half.
 * @param {Array} totalRow Raw grand "Total" row array.
 * @returns {{outcomeIndicatorPairs:Array, orphanOutcomeIndicators:Array, outputIndicatorPairs:Array, errors:Array<string>}} Join result and failures.
 * @example validate(narrative, budget, totalRow).errors.length // 0
 */
function validate(narrative, budget, totalRow) {
  const errors = [];
  checkCounts(narrative, budget, errors);
  const oi = joinByTitle(budget.outcomeIndicators, narrative.outcomeIndicators, errors, 'outcome indicator');
  const oind = joinByTitle(budget.outputIndicators, narrative.outputIndicators, errors, 'output indicator');
  if (oind.pairs.length !== EXPECTED.outputIndicators || oind.unmatched.length !== 0) {
    errors.push(`narrative<->budget output-indicator join is ${oind.pairs.length}/${EXPECTED.outputIndicators} (${oind.unmatched.length} narrative entries unmatched)`);
  }
  const expectedOrphans = EXPECTED.narrativeOutcomeIndicators - EXPECTED.budgetOutcomeIndicators;
  if (oi.unmatched.length !== expectedOrphans) {
    errors.push(`expected ${expectedOrphans} unbudgeted narrative outcome indicator(s), found ${oi.unmatched.length}`);
  }
  checkPairValues(oi.pairs, errors, 'outcome indicator');
  checkPairValues(oind.pairs, errors, 'output indicator');
  checkActivityCodes(budget, errors);
  checkCostingSums(budget, errors);
  if (budget.outcome) checkHierarchyRollups(budget, totalRow, errors);
  return {
    outcomeIndicatorPairs: oi.pairs,
    orphanOutcomeIndicators: oi.unmatched,
    outputIndicatorPairs: oind.pairs,
    errors,
  };
}

// ── Document assembly ──────────────────────────────────────────────

/**
 * Merge a budget outcome indicator with its narrative twin.
 *
 * @param {Object} budgetEntry Budget-half outcome indicator.
 * @param {Object} narrativeEntry Narrative-half outcome indicator.
 * @returns {Object} Snapshot entry (budget codes, narrative targets).
 * @example mergeIndicator(b, n).code // '6'
 */
function mergeIndicator(budgetEntry, narrativeEntry) {
  return {
    code: budgetEntry.code,
    title: budgetEntry.title,
    measuring_unit: narrativeEntry.measuring_unit,
    baseline: budgetEntry.baseline,
    target_2027: budgetEntry.target_2027,
    target_2028: narrativeEntry.target_2028,
    target_2029: narrativeEntry.target_2029,
    unbudgeted: false,
    budget: budgetEntry.budget,
  };
}

/**
 * Build the outcome-indicator list: the budgeted ones merged with their
 * narrative twin, then the unbudgeted narrative orphan(s) with the next free
 * code, zero budgets and `unbudgeted: true`.
 *
 * @param {Array<{budget:Object,narrative:Object}>} pairs Joined outcome indicators.
 * @param {Array<Object>} orphans Narrative entries with no budget counterpart.
 * @returns {Array<Object>} Seven outcome indicators.
 * @example buildOutcomeIndicators(pairs, orphans).length // 7
 */
function buildOutcomeIndicators(pairs, orphans) {
  const merged = pairs.map((p) => mergeIndicator(p.budget, p.narrative));
  let nextCode = merged.reduce((max, e) => Math.max(max, parseInt(e.code, 10) || 0), 0);
  for (const orphan of orphans) {
    nextCode += 1;
    merged.push({
      code: String(nextCode),
      title: orphan.title,
      measuring_unit: orphan.measuring_unit,
      baseline: orphan.baseline,
      target_2027: orphan.target_2027,
      target_2028: orphan.target_2028,
      target_2029: orphan.target_2029,
      unbudgeted: true,
      budget: {
        main: 0, pass_through: 0, tech_assistance: 0, special_projects: 0,
        total_2027: 0, y2_2028: 0, y3_2029: 0,
      },
    });
  }
  return merged;
}

/**
 * Assemble the JSON snapshot document.
 *
 * @param {Object} parts Parsed halves, join result and source metadata.
 * @returns {Object} The document printed to stdout.
 * @example buildDocument(parts).activities.length // 115
 */
function buildDocument(parts) {
  const { budget, join, source } = parts;
  const outputIndicators = join.outputIndicatorPairs.map((p) => ({
    code: p.budget.code,
    title: p.budget.title,
    output_code: p.budget.output_code,
    measuring_unit: p.narrative.measuring_unit,
    baseline: p.budget.baseline,
    target_2027: p.budget.target_2027,
    target_2028: p.narrative.target_2028,
    target_2029: p.narrative.target_2029,
    budget: p.budget.budget,
  }));
  const divisionLabels = [...new Set(
    budget.activities.map((a) => a.responsible_division_raw).filter(Boolean),
  )].sort((a, b) => a.localeCompare(b));
  return {
    source,
    outcome: budget.outcome,
    outcome_indicators: buildOutcomeIndicators(join.outcomeIndicatorPairs, join.orphanOutcomeIndicators),
    outputs: budget.outputs,
    output_indicators: outputIndicators,
    activities: budget.activities,
    costing_lines: budget.costingLines,
    division_labels: divisionLabels,
  };
}

// ── Entry point ────────────────────────────────────────────────────

/**
 * Resolve the workbook path from `--file=` or the repo-root default.
 *
 * @param {Array<string>} argv Process arguments (without node/script).
 * @returns {string} Absolute path to the workbook.
 * @example resolveFile(['--file=/tmp/a.xlsx']) // '/tmp/a.xlsx'
 */
function resolveFile(argv) {
  const arg = argv.find((a) => a.startsWith('--file='));
  return arg ? path.resolve(arg.slice('--file='.length)) : DEFAULT_FILE;
}

/**
 * Read, parse, validate and print the snapshot to stdout.
 *
 * @returns {void}
 * @throws {Error} When the workbook is unreadable or any validation fails —
 *   nothing is written to stdout in that case.
 * @example main() // prints the JSON document
 */
function main() {
  const file = resolveFile(process.argv.slice(2));
  const { sheetName, rows } = readSheet(file);
  const { budgetStart, totalIndex } = locateHalves(rows);
  const narrative = parseNarrative(rows, budgetStart);
  const budget = parseBudget(rows, budgetStart, totalIndex);
  const join = validate(narrative, budget, rows[totalIndex] || []);
  if (join.errors.length) {
    throw new Error(`Extraction rejected — ${join.errors.length} validation failure(s):\n  - ${join.errors.join('\n  - ')}`);
  }
  const doc = buildDocument({
    budget,
    join,
    source: {
      file: path.basename(file),
      sheet: sheetName,
      extracted_at: new Date().toISOString().slice(0, 10),
      script: SCRIPT_NAME,
      script_version: SCRIPT_VERSION,
      fiscal_years: FISCAL_YEARS,
    },
  });
  process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`);
  console.error([
    `${SCRIPT_NAME} v${SCRIPT_VERSION} — ${path.basename(file)} / ${sheetName}`,
    `  outcome indicators : ${doc.outcome_indicators.length} (${doc.outcome_indicators.filter((e) => e.unbudgeted).length} unbudgeted)`,
    `  outputs            : ${doc.outputs.length}`,
    `  output indicators  : ${doc.output_indicators.length}`,
    `  activities         : ${doc.activities.length}`,
    `  costing lines      : ${doc.costing_lines.length}`,
    `  division labels    : ${doc.division_labels.length}`,
    `  grand total 2027   : ${doc.outcome.budget.total_2027}`,
  ].join('\n'));
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
