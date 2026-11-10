/* eslint-disable max-lines, complexity, max-depth, no-restricted-syntax --
 * Pre-existing legacy debt carried verbatim from planNodeRoutes.js
 * (task #29).
 *   · max-lines: 227L (3 read routes + enrichment payloads).
 *   · complexity: list (GET /) = 15, detail (GET /:idOrCode) = 18.
 *   · max-depth: detail handler nested if (node.parent_id) block = 5.
 *   · no-restricted-syntax: P-31 for 'SPECIFIC_ACTIVITY' / 'BROAD_ACTIVITY' /
 *     'OUTCOME_INDICATOR' — plan_nodes.node_type column-enum values, NOT
 *     ENTITY_TYPES from @rbm/lib/enums. Allowlisted in
 *     scripts/forbidden.allowlist.json.
 * Pragma is a ceiling — do NOT grow the file or add new violations.
 */

// ── Plan-Nodes Read Routes ──
//
// Extracted from `services/api-server/src/routes/planNodeRoutes.js` as
// part of the task #29 split. Three read-only GET endpoints:
//   GET /               — list nodes (filter by parent_id, node_type, etc.)
//   GET /:idOrCode      — single node detail (by id or code)
//   GET /:id/tree       — recursive subtree
//
// Mounted at `/api/plan-nodes` via the parent aggregator — URL paths
// identical to pre-split.

const router = require('express').Router();
const { authenticateToken } = require('../../middleware/authMiddleware');
const {
  knex,
  log,
  STATUSES,
  PUBLIC_STATUSES,
  enrichNode,
  enrichNodes,
  isAdmin,
  getFocalDivisions,
  getResponsibleDivisions,
  envelopeError,
} = require('./_helpers');
const { NODE_TYPES } = require('@rbm/lib/enums');

// Read-only on specific activities: they show the budget codes of their broad
// (D-20261103-06). Same columns on the list and on the detail page.
const BUDGET_CODE_COLUMNS = ['id', 'budget_code', 'fund_code', 'fund_description'];

/**
 * Broads with their budget codes, shown read-only by the specific activity form.
 *
 * @param {object[]} rows - BROAD_ACTIVITY rows
 * @returns {Promise<object[]>} rows with `budget_codes: [{ id, budget_code, fund_code, fund_description }]`
 * @throws {Error} on DB failure
 * @example await withBudgetCodes([{ id: 4 }]) // [{ id: 4, budget_codes: [{ id: 9, budget_code: '11201', ... }] }]
 */
async function withBudgetCodes(rows) {
  if (!rows.length) return rows;
  const codes = await knex('budget_codes')
    .whereIn('plan_node_id', rows.map((r) => r.id))
    .orderBy('id')
    .select('plan_node_id', ...BUDGET_CODE_COLUMNS);
  return rows.map((r) => ({
    ...r,
    budget_codes: codes.filter((c) => c.plan_node_id === r.id).map(({ plan_node_id: _p, ...c }) => c),
  }));
}

router.use(authenticateToken);

// GET /plan-nodes — all nodes (optionally filter by parent_id, node_type, tier_id)
/**
 * List plan nodes. Defaults to PUBLIC_STATUSES; `mine=true` widens to the caller's own rows, `scope=my_division_review` widens to IN_REVIEW rows in divisions the caller is HOD of.
 *
 * @name GET /api/plan-nodes
 * @param {express.Request} req — supports query: `parent_id`, `node_type`, `tier_id`, `fiscal_year`, `mine`, `scope`
 * @param {express.Response} res — 200 JSON array of enriched node rows
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example
 * GET /api/plan-nodes?node_type=BROAD_ACTIVITY&tier_id=3
 */
router.get('/', async (req, res) => {
  try {
    const { parent_id, node_type, tier_id, fiscal_year, mine, scope } = req.query;
    const includePending = mine === 'true' || scope === 'my_division_review' || await isAdmin(req.user);

    let q = knex('plan_nodes').orderBy('sort_order').limit(5000);
    if (parent_id === 'null') q = q.whereNull('parent_id');
    else if (parent_id) q = q.where('parent_id', parseInt(parent_id));
    if (node_type) q = q.where('node_type', node_type);
    if (tier_id) q = q.where('tier_id', parseInt(tier_id));
    if (fiscal_year) q = q.where('fiscal_year', fiscal_year);

    if (mine === 'true') {
      const focalDivs = await getFocalDivisions(req.user.id);
      const userRow = await knex('users').where('id', req.user.id).select('division_code').first();
      const userDiv = userRow?.division_code || null;
      q = q.where(function () {
        this.where('created_by_user_id', req.user.id);
        // Designated activity focals see + act on their activities too.
        this.orWhere('focal_user_id', req.user.id);
        const allDivs = [...new Set([...focalDivs, ...(userDiv ? [userDiv] : [])])];
        if (allDivs.length) {
          this.orWhereIn('responsible_division_code', allDivs);
        }
      });
    } else if (scope === 'my_division_review') {
      const respDivs = await getResponsibleDivisions(req.user.id);
      if (!respDivs.length) return res.json([]);
      q = q.whereIn('responsible_division_code', respDivs)
           .where('status', STATUSES.IN_REVIEW);
    } else if (!includePending) {
      q = q.whereIn('status', PUBLIC_STATUSES);
    }

    const rows = await enrichNodes(await q);
    res.json(node_type === NODE_TYPES.BROAD_ACTIVITY ? await withBudgetCodes(rows) : rows);
  } catch (err) {
    log.error('plan_nodes.list_failed', { err: err.message });
    envelopeError(res, 500, err.message);
  }
});

/**
 * List the fiscal years that actually hold a plan, newest first.
 *
 * Feeds the year switcher: the UI must offer what exists rather than a range
 * computed from the clock, so loading a new generation makes it selectable
 * with no front-end change.
 *
 * MUST stay registered before `/:idOrCode` — Express matches in order, and the
 * parameterised route would otherwise swallow `/fiscal-years` and try to
 * resolve it as a node code.
 *
 * @name GET /api/plan-nodes/fiscal-years
 * @param {express.Request} req
 * @param {express.Response} res — 200 `{success,data:[{fiscal_year,node_count}]}`
 * @returns {Promise<void>}
 * @example
 * GET /api/plan-nodes/fiscal-years
 * // { success: true, data: [{ fiscal_year: '2027', node_count: 190 }, ...] }
 */
router.get('/fiscal-years', async (req, res) => {
  try {
    const rows = await knex('plan_nodes')
      .whereNotNull('fiscal_year')
      .select('fiscal_year')
      .count({ node_count: '*' })
      .groupBy('fiscal_year')
      .orderBy('fiscal_year', 'desc');
    res.json({
      success: true,
      data: rows.map((r) => ({ fiscal_year: String(r.fiscal_year), node_count: Number(r.node_count) })),
    });
  } catch {
    res.status(500).json({ success: false, message: 'Could not list fiscal years', code: 'INTERNAL_ERROR' });
  }
});

// GET /plan-nodes/:idOrCode — single node (accepts id or code)
/**
 * Fetch a single plan node by numeric id or by code, with enriched children, linked indicators/broads/specifics, budget codes and parent chain.
 *
 * @name GET /api/plan-nodes/:idOrCode
 * @param {express.Request} req — path param `idOrCode` is either a numeric id or a string code
 * @param {express.Response} res — 200 JSON with node + relational payload, 404 when not found
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example
 * GET /api/plan-nodes/4.2.4.01
 */
router.get('/:idOrCode', async (req, res) => {
  try {
    const param = req.params.idOrCode;
    const isNumericId = /^\d+$/.test(param);
    let node;
    if (isNumericId) {
      node = await knex('plan_nodes').where('id', parseInt(param, 10)).first();
    } else {
      // `code` is NOT unique and repeats across fiscal years ("1.1.1" exists in
      // every plan generation), so a bare .first() returns whichever row the
      // engine happens to yield. Prefer the caller's year, otherwise resolve to
      // the most recent one deterministically (D-20260918-01).
      const q = knex('plan_nodes').where('code', param);
      if (req.query.fiscal_year) q.where('fiscal_year', String(req.query.fiscal_year));
      node = await q.orderBy('fiscal_year', 'desc').first();
    }
    if (!node) return envelopeError(res, 404, 'Node not found');
    node = await enrichNode(node);
    // Attach the currently OPEN reporting period so the UI can show the
    // "due this quarter" banner based on what admin actually opened,
    // not the wall-clock month.
    const openPeriod = await knex('reporting_periods').where('status', 'OPEN').first('quarter', 'fiscal_year');
    if (openPeriod) {
      node.open_reporting_period = {
        quarter: openPeriod.quarter,
        quarter_num: Number(String(openPeriod.quarter).replace(/[^0-9]/g, '')) || null,
        fiscal_year: openPeriod.fiscal_year,
      };
    }
    // Gate non-public children for non-admins — the list route enforces
    // PUBLIC_STATUSES but the detail route did not, leaking DRAFT/REJECTED/
    // CANCELLED children to any authenticated user (cleaning bug PN-HIGH).
    const detailAdmin = await isAdmin(req.user);
    const childQ = knex('plan_nodes').where('parent_id', node.id).orderBy('sort_order');
    if (!detailAdmin) childQ.whereIn('status', PUBLIC_STATUSES);
    const children = await enrichNodes(await childQ);

    // For indicators (T3/T4 specifically), also fetch linked activities via M2M + linked_indicator_id
    let linkedBroads = [];
    let linkedSpecifics = [];
    if (node.node_type === 'OUTCOME_INDICATOR' && (node.tier_id === 3 || node.tier_id === 4)) {
      const broadLinks = await knex('indicator_broad_links')
        .join('plan_nodes', 'indicator_broad_links.broad_activity_id', 'plan_nodes.id')
        .where('indicator_broad_links.indicator_id', node.id)
        .select('plan_nodes.*');
      linkedBroads = await enrichNodes(broadLinks);

      const specifics = await knex('plan_nodes')
        .where('node_type', 'SPECIFIC_ACTIVITY')
        .where('linked_indicator_id', node.id)
        .orderBy('code');
      linkedSpecifics = await enrichNodes(specifics);
    }

    // For BROAD_ACTIVITY, fetch budget_codes
    let budgetCodes = [];
    if (node.node_type === 'BROAD_ACTIVITY') {
      const rows = await knex('budget_codes')
        .where('plan_node_id', node.id)
        .orderBy('id');
      budgetCodes = rows.map(b => ({
        ...b,
        amount: b.amount !== null ? parseFloat(b.amount) : null,
        main_budget: b.main_budget !== null ? parseFloat(b.main_budget) : null,
        technical_assistance: b.technical_assistance !== null ? parseFloat(b.technical_assistance) : null,
        total_ips: b.total_ips !== null ? parseFloat(b.total_ips) : null,
        gap: b.gap !== null ? parseFloat(b.gap) : null,
      }));
    }

    // For SPECIFIC_ACTIVITY, fetch the linked indicator (T3/T4) it contributes to
    let linkedIndicator = null;
    let parentBroad = null;
    let tier2Outcome = null;
    if (node.node_type === 'SPECIFIC_ACTIVITY') {
      if (node.linked_indicator_id) {
        const ind = await knex('plan_nodes').where('id', node.linked_indicator_id).first();
        if (ind) linkedIndicator = await enrichNode(ind);
      }
      if (node.parent_id) {
        const broad = await knex('plan_nodes').where('id', node.parent_id).first();
        if (broad) {
          parentBroad = await enrichNode(broad);
          // The activity report fills its budget code from the broad activity
          // the specific belongs to (template item 11); the page lists them.
          parentBroad.budget_codes = await knex('budget_codes')
            .where('plan_node_id', broad.id).orderBy('id').select(BUDGET_CODE_COLUMNS);
          // Template item 1: the Tier 2 outcome the activity contributes to.
          // The broad hangs under an indicator, which is either that Tier 2
          // result or a Tier 3/4 one sitting under it.
          const parent = broad.parent_id ? await knex('plan_nodes').where('id', broad.parent_id).first() : null;
          const grand = parent && parent.tier_id !== 2 && parent.parent_id
            ? await knex('plan_nodes').where('id', parent.parent_id).first() : null;
          const tier2 = [parent, grand].find((n) => n && n.tier_id === 2);
          if (tier2) tier2Outcome = { id: tier2.id, code: tier2.code, title: tier2.title, tier_id: 2 };
        }
      }
    }

    // For BROAD_ACTIVITY, also fetch parent indicator (T2/T3/T4) and outcome area
    let parentIndicator = null;
    let parentOutcomeArea = null;
    if (node.node_type === 'BROAD_ACTIVITY' && node.parent_id) {
      const ind = await knex('plan_nodes').where('id', node.parent_id).first();
      if (ind) {
        parentIndicator = await enrichNode(ind);
        if (ind.parent_id) {
          const area = await knex('plan_nodes').where('id', ind.parent_id).first();
          if (area) parentOutcomeArea = await enrichNode(area);
        }
      }
    }

    res.json({
      ...node, children,
      linked_broads: linkedBroads,
      linked_specifics: linkedSpecifics,
      budget_codes: budgetCodes,
      linked_indicator: linkedIndicator,
      parent_broad: parentBroad,
      tier2_outcome: tier2Outcome,
      parent_indicator: parentIndicator,
      parent_outcome_area: parentOutcomeArea,
    });
  } catch (err) {
    log.error('plan_nodes.get_failed', { err: err.message, param: req.params.idOrCode });
    envelopeError(res, 500, err.message);
  }
});

// GET /plan-nodes/:id/tree — full subtree from a node
/**
 * Return the full recursive subtree rooted at a node (enriched).
 *
 * @name GET /api/plan-nodes/:id/tree
 * @param {express.Request} req — path param `id` is the numeric plan_node id
 * @param {express.Response} res — 200 JSON enriched node with nested `children`, 404 when not found
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example
 * GET /api/plan-nodes/42/tree
 */
router.get('/:id/tree', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    let node = await knex('plan_nodes').where('id', id).first();
    if (!node) return envelopeError(res, 404, 'Node not found');
    node = await enrichNode(node);

    // Same PUBLIC_STATUSES gate as the list/detail routes — the tree must not
    // leak DRAFT/REJECTED/CANCELLED descendants to non-admins (cleaning bug PN-HIGH).
    const treeAdmin = await isAdmin(req.user);
    async function getChildren(parentId) {
      const childQ = knex('plan_nodes').where('parent_id', parentId).orderBy('sort_order');
      if (!treeAdmin) childQ.whereIn('status', PUBLIC_STATUSES);
      const kids = await enrichNodes(await childQ);
      for (const kid of kids) {
        kid.children = await getChildren(kid.id);
      }
      return kids;
    }
    node.children = await getChildren(id);
    res.json(node);
  } catch (err) {
    log.error('plan_nodes.tree_failed', { err: err.message, id: req.params.id });
    envelopeError(res, 500, err.message);
  }
});

module.exports = router;
