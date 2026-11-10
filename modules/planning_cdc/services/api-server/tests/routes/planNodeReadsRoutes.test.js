/* eslint-disable no-restricted-syntax --
 * P-31: these are DB column-enum WIRE values in test fixtures/assertions
 * (plan_nodes.node_type = 'SPECIFIC_ACTIVITY'/'BROAD_ACTIVITY'/'OUTCOME_INDICATOR', etc.;
 * workplan_items.item_type = 'ACTIVITY'/'TASK'), NOT ENTITY_TYPES identifiers.
 * Literal wire values are intentional in tests so a column-enum rename is caught
 * by a failing test instead of masked by importing the enum. Mirrors the source
 * plan-nodes route files which carry the same documented P-31 exception.
 */
// ── plan-nodes reads routes integration tests ──
//
// Covers: GET / (list), GET /:idOrCode (detail by id or code),
//         GET /:id/tree (recursive subtree)

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = global.__testUser || { id: 1, email: 'admin@africacdc.org', division_code: 'DCM' };
    next();
  },
}));

jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn(() => Promise.resolve({ allowed: true, scope: 'all' })),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: true, denies: [] }),
}));

jest.mock('../../src/services/divisionAliasService', () => ({
  scopeCoversDivision: jest.fn().mockResolvedValue(true),
  sameDivision: jest.fn().mockResolvedValue(false),
  getDirectoratesForUser: jest.fn().mockResolvedValue([]),
}));

// Mock user-divisions helper
jest.mock('@rbm/lib/user-divisions', () => ({
  ...jest.requireActual('@rbm/lib/user-divisions'),
  getUserDivisionCodes: jest.fn().mockResolvedValue([]),
}));

const request = require('supertest');
const app = require('../../src/app');
const rbacService = require('../../src/services/rbacService');
const chain = sharedDb.__chain;

function baseNode(overrides = {}) {
  return {
    id: 1,
    code: 'TEST.01',
    title: 'Test Node',
    node_type: 'BROAD_ACTIVITY',
    tier_id: 2,
    status: 'APPROVED',
    parent_id: null,
    sort_order: 1,
    responsible_division_code: 'DCM',
    unit_of_measure_id: null,
    strategic_plan_id: null,
    linked_indicator_id: null,
    contributing_divisions: null,
    ...overrides,
  };
}

function resetChain() {
  chain.first.mockReset().mockResolvedValue(undefined);
  chain.insert.mockReset().mockResolvedValue([1]);
  chain.update.mockReset().mockResolvedValue(1);
  chain.del.mockReset().mockResolvedValue(1);
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  ['select', 'where', 'whereIn', 'whereNotNull', 'whereNull', 'orderBy',
    'leftJoin', 'join', 'limit', 'pluck', 'orderByRaw', 'whereRaw'].forEach((m) => {
    if (chain[m]) chain[m].mockClear().mockReturnValue(chain);
    else chain[m] = jest.fn().mockReturnValue(chain);
  });
  sharedDb.raw = jest.fn().mockReturnValue(chain);
}

const ADMIN_USER = { id: 1, email: 'admin@africacdc.org', division_code: 'DCM' };

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  global.__testUser = ADMIN_USER;
  rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
});

afterEach(() => {
  global.__testUser = null;
});

// ── GET /api/plan-nodes ───────────────────────────────────────────────────────
describe('GET /api/plan-nodes', () => {
  it('should return list of nodes (default public statuses)', async () => {
    const nodes = [baseNode()];
    // enrichNodes resolves attachUom, attachDivision, attachActivePeriods, attachStrategicPlan per node
    // All those use chain.first or chain.then; we need them to resolve safely
    chain.then.mockImplementation((r) => Promise.resolve(nodes).then(r));
    chain.first.mockResolvedValue(undefined); // uom, division, period, sp all null

    const res = await request(app).get('/api/plan-nodes');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should filter by node_type', async () => {
    chain.then.mockImplementation((r) => Promise.resolve([]).then(r));
    const res = await request(app).get('/api/plan-nodes?node_type=BROAD_ACTIVITY');
    expect(res.status).toBe(200);
  });

  it('should attach the budget codes of each broad activity', async () => {
    const lastTable = () => sharedDb.mock.calls[sharedDb.mock.calls.length - 1]?.[0];
    chain.then.mockImplementation((r) => Promise.resolve({
      budget_codes: [{ plan_node_id: 2, id: 9, budget_code: '11201', fund_code: 'MS-1', fund_description: 'Member States' }],
    }[lastTable()] || [baseNode(), baseNode({ id: 2, code: 'TEST.02' })]).then(r));
    chain.first.mockResolvedValue(undefined);
    const res = await request(app).get('/api/plan-nodes?node_type=BROAD_ACTIVITY&fiscal_year=2026');
    expect(res.status).toBe(200);
    expect(res.body.map((b) => b.budget_codes)).toEqual([[], [{ id: 9, budget_code: '11201', fund_code: 'MS-1', fund_description: 'Member States' }]]);
  });

  it('should filter by parent_id=null', async () => {
    chain.then.mockImplementation((r) => Promise.resolve([]).then(r));
    const res = await request(app).get('/api/plan-nodes?parent_id=null');
    expect(res.status).toBe(200);
  });

  it('should filter by parent_id (numeric)', async () => {
    chain.then.mockImplementation((r) => Promise.resolve([]).then(r));
    const res = await request(app).get('/api/plan-nodes?parent_id=5');
    expect(res.status).toBe(200);
  });

  it('should filter by tier_id', async () => {
    chain.then.mockImplementation((r) => Promise.resolve([]).then(r));
    const res = await request(app).get('/api/plan-nodes?tier_id=3');
    expect(res.status).toBe(200);
  });

  it('should filter by fiscal_year', async () => {
    chain.then.mockImplementation((r) => Promise.resolve([]).then(r));
    const res = await request(app).get('/api/plan-nodes?fiscal_year=2026');
    expect(res.status).toBe(200);
  });

  it('should apply mine=true filter', async () => {
    // getUserDivisionCodes returns [] (already mocked globally)
    chain.first.mockResolvedValueOnce({ division_code: 'DCM' }); // userRow
    chain.then.mockImplementation((r) => Promise.resolve([]).then(r));
    const res = await request(app).get('/api/plan-nodes?mine=true');
    expect(res.status).toBe(200);
  });

  it('should apply scope=my_division_review — returns empty when no resp divs', async () => {
    // getResponsibleDivisions returns [] (no resp divs)
    chain.then.mockImplementation((r) => Promise.resolve([]).then(r));
    const res = await request(app).get('/api/plan-nodes?scope=my_division_review');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('should NOT filter by public statuses when user is admin', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    chain.then.mockImplementation((r) => Promise.resolve([]).then(r));
    const res = await request(app).get('/api/plan-nodes');
    expect(res.status).toBe(200);
  });

});

// ── GET /api/plan-nodes/:idOrCode ─────────────────────────────────────────────
describe('GET /api/plan-nodes/:idOrCode', () => {
  it('should return 404 when node not found by id', async () => {
    chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app).get('/api/plan-nodes/9999');
    expect(res.status).toBe(404);
  });

  it('should return node by numeric id', async () => {
    const node = baseNode({ id: 1, node_type: 'BROAD_ACTIVITY' });
    chain.first
      .mockResolvedValueOnce(node)   // plan_nodes by id
      .mockResolvedValueOnce(undefined) // uom
      .mockResolvedValueOnce(undefined) // division
      .mockResolvedValueOnce(undefined) // reporting_periods (openPeriod)
      .mockResolvedValueOnce(undefined); // budget_codes left join
    chain.then.mockImplementation((r) => Promise.resolve([]).then(r)); // children, budget_codes

    const res = await request(app).get('/api/plan-nodes/1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it('should return node by code string', async () => {
    const node = baseNode({ id: 2, code: 'TEST.02', node_type: 'BROAD_ACTIVITY' });
    chain.first
      .mockResolvedValueOnce(node)
      .mockResolvedValueOnce(undefined) // uom
      .mockResolvedValueOnce(undefined) // division
      .mockResolvedValueOnce(undefined); // openPeriod
    chain.then.mockImplementation((r) => Promise.resolve([]).then(r));

    const res = await request(app).get('/api/plan-nodes/TEST.02');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('TEST.02');
  });

  // D-20260918-01: `code` repeats across fiscal years ("1.1.1" exists in every
  // plan generation), so resolving by code must be deterministic instead of
  // returning whichever row the engine yields first.
  it('should resolve a repeated code deterministically, newest fiscal year first', async () => {
    const node = baseNode({ id: 4, code: '1.1.1', node_type: 'BROAD_ACTIVITY' });
    chain.first
      .mockResolvedValueOnce(node)
      .mockResolvedValueOnce(undefined) // uom
      .mockResolvedValueOnce(undefined) // division
      .mockResolvedValueOnce(undefined); // openPeriod
    chain.then.mockImplementation((r) => Promise.resolve([]).then(r));

    const res = await request(app).get('/api/plan-nodes/1.1.1');
    expect(res.status).toBe(200);
    expect(chain.orderBy).toHaveBeenCalledWith('fiscal_year', 'desc');
  });

  it('should honour an explicit fiscal_year when resolving by code', async () => {
    const node = baseNode({ id: 5, code: '1.1.1', node_type: 'BROAD_ACTIVITY' });
    chain.first
      .mockResolvedValueOnce(node)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    chain.then.mockImplementation((r) => Promise.resolve([]).then(r));

    const res = await request(app).get('/api/plan-nodes/1.1.1?fiscal_year=2026');
    expect(res.status).toBe(200);
    expect(chain.where).toHaveBeenCalledWith('fiscal_year', '2026');
  });

  it('should enrich OUTCOME_INDICATOR node with linked broads and specifics', async () => {
    const node = baseNode({ id: 3, node_type: 'OUTCOME_INDICATOR', tier_id: 3 });
    chain.first
      .mockResolvedValueOnce(node)
      .mockResolvedValueOnce(undefined) // uom
      .mockResolvedValueOnce(undefined) // division
      .mockResolvedValueOnce(undefined); // openPeriod

    // children, broads, specifics
    chain.then.mockImplementation((r) => Promise.resolve([]).then(r));

    const res = await request(app).get('/api/plan-nodes/3');
    expect(res.status).toBe(200);
    expect(res.body.linked_broads).toBeDefined();
    expect(res.body.linked_specifics).toBeDefined();
  });

  it('should include budget_codes for BROAD_ACTIVITY', async () => {
    const node = baseNode({ id: 4, node_type: 'BROAD_ACTIVITY' });
    chain.first
      .mockResolvedValueOnce(node)
      .mockResolvedValueOnce(undefined) // uom
      .mockResolvedValueOnce(undefined) // division
      .mockResolvedValueOnce(undefined); // openPeriod

    const budgetRows = [{ id: 1, plan_node_id: 4, amount: '1000.00', main_budget: '800.00', technical_assistance: null, total_ips: null, gap: null }];
    // children (empty), budget_codes, plus enrichNode subroutines for children
    chain.then
      .mockImplementationOnce((r) => Promise.resolve([]).then(r))   // children
      .mockImplementationOnce((r) => Promise.resolve(budgetRows).then(r)); // budget_codes

    const res = await request(app).get('/api/plan-nodes/4');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.budget_codes)).toBe(true);
  });

  it('should enrich SPECIFIC_ACTIVITY node with linked indicator and parent broad', async () => {
    const node = baseNode({ id: 5, node_type: 'SPECIFIC_ACTIVITY', linked_indicator_id: 10, parent_id: 20 });
    const linkedIndicator = baseNode({ id: 10, node_type: 'OUTCOME_INDICATOR' });
    const parentBroad = baseNode({ id: 20, node_type: 'BROAD_ACTIVITY' });

    chain.first
      .mockResolvedValueOnce(node)           // node
      .mockResolvedValueOnce(undefined)      // uom for main node
      .mockResolvedValueOnce(undefined)      // division for main node
      .mockResolvedValueOnce(undefined)      // openPeriod
      .mockResolvedValueOnce(linkedIndicator) // linked indicator
      .mockResolvedValueOnce(undefined)      // uom for indicator
      .mockResolvedValueOnce(undefined)      // division for indicator
      .mockResolvedValueOnce(parentBroad)    // parent broad
      .mockResolvedValueOnce(undefined)      // uom for broad
      .mockResolvedValueOnce(undefined);     // division for broad
    chain.then.mockImplementation((r) => Promise.resolve([]).then(r));

    const res = await request(app).get('/api/plan-nodes/5');
    expect(res.status).toBe(200);
    expect(res.body.linked_indicator).toBeDefined();
    expect(res.body.parent_broad).toBeDefined();
  });

  // Activity Reporting Template, items 1 and 11 (D-20261001-01).
  // Keyed on the id being looked up rather than on call order: node enrichment
  // makes a variable number of lookups, so an ordered queue drifts silently.
  function mockSpecificUnder(broadParent, grandParent) {
    const byId = {
      5: baseNode({ id: 5, node_type: 'SPECIFIC_ACTIVITY', parent_id: 20 }),
      20: baseNode({ id: 20, node_type: 'BROAD_ACTIVITY', parent_id: broadParent.id }),
      [broadParent.id]: broadParent,
      ...(grandParent ? { [grandParent.id]: grandParent } : {}),
    };
    let idLookup = null;
    let budgetLookup = false;
    chain.where.mockImplementation((col, val) => {
      if (col === 'id') idLookup = val;
      if (col === 'plan_node_id') budgetLookup = true;
      return chain;
    });
    chain.first.mockImplementation(() => {
      const hit = idLookup == null ? undefined : byId[idLookup];
      idLookup = null;
      return Promise.resolve(hit);
    });
    chain.then.mockImplementation((r) => {
      const rows = budgetLookup ? [{ id: 1, fund_code: 'MS-0042' }] : [];
      budgetLookup = false;
      return Promise.resolve(rows).then(r);
    });
  }

  it('should give a specific activity the budget codes of its broad activity', async () => {
    mockSpecificUnder(baseNode({ id: 30, node_type: 'OUTCOME_INDICATOR', tier_id: 2 }));
    const res = await request(app).get('/api/plan-nodes/5');
    expect(res.status).toBe(200);
    expect(res.body.parent_broad.budget_codes).toEqual([{ id: 1, fund_code: 'MS-0042' }]);
  });

  it('should return the Tier 2 outcome when the broad sits directly under it', async () => {
    mockSpecificUnder(baseNode({ id: 30, code: '1.1.1', node_type: 'OUTCOME_INDICATOR', tier_id: 2 }));
    const res = await request(app).get('/api/plan-nodes/5');
    expect(res.body.tier2_outcome).toMatchObject({ id: 30, code: '1.1.1', tier_id: 2 });
  });

  it('should climb one level when the broad sits under a Tier 3/4 indicator', async () => {
    mockSpecificUnder(
      baseNode({ id: 30, node_type: 'OUTCOME_INDICATOR', tier_id: 4, parent_id: 40 }),
      baseNode({ id: 40, code: '2.1.1', node_type: 'OUTCOME_INDICATOR', tier_id: 2 }),
    );
    const res = await request(app).get('/api/plan-nodes/5');
    expect(res.body.tier2_outcome).toMatchObject({ id: 40, code: '2.1.1' });
  });

  it('should return a null Tier 2 outcome rather than guess when none is found', async () => {
    mockSpecificUnder(baseNode({ id: 30, node_type: 'OUTCOME_AREA', tier_id: null, parent_id: null }));
    const res = await request(app).get('/api/plan-nodes/5');
    expect(res.status).toBe(200);
    expect(res.body.tier2_outcome).toBeNull();
  });

  it('should return 500 on DB error', async () => {
    chain.first.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app).get('/api/plan-nodes/1');
    expect(res.status).toBe(500);
  });
});

// ── GET /api/plan-nodes/:id/tree ──────────────────────────────────────────────
describe('GET /api/plan-nodes/:id/tree', () => {
  it('should return 404 when root node not found', async () => {
    chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app).get('/api/plan-nodes/999/tree');
    expect(res.status).toBe(404);
  });

  it('should return root node with empty children', async () => {
    const node = baseNode({ id: 1 });
    chain.first
      .mockResolvedValueOnce(node)
      .mockResolvedValueOnce(undefined) // uom
      .mockResolvedValueOnce(undefined); // division
    chain.then.mockImplementation((r) => Promise.resolve([]).then(r)); // children always empty

    const res = await request(app).get('/api/plan-nodes/1/tree');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(Array.isArray(res.body.children)).toBe(true);
  });

  it('should return 500 on DB error', async () => {
    chain.first.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app).get('/api/plan-nodes/1/tree');
    expect(res.status).toBe(500);
  });
});
// ── GET /fiscal-years ────────────────────────────────────────────────
//
// Feeds the year switcher. Two things matter: the route must answer before
// `/:idOrCode` gets a chance to treat "fiscal-years" as a node code, and it
// must report what the database actually holds rather than a computed range.
describe('GET /api/plan-nodes/fiscal-years', () => {
  it('should list the years that hold a plan, newest first', async () => {
    chain.then.mockImplementation((r) => Promise.resolve([
      { fiscal_year: '2027', node_count: 190 },
      { fiscal_year: '2026', node_count: 1059 },
    ]).then(r));

    const res = await request(app).get('/api/plan-nodes/fiscal-years');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([
      { fiscal_year: '2027', node_count: 190 },
      { fiscal_year: '2026', node_count: 1059 },
    ]);
    expect(chain.orderBy).toHaveBeenCalledWith('fiscal_year', 'desc');
  });

  it('should not be swallowed by the :idOrCode route', async () => {
    // Express matches in registration order. If /fiscal-years were declared
    // after /:idOrCode, this request would be resolved as a node code and
    // come back 404 instead of a list.
    chain.then.mockImplementation((r) => Promise.resolve([]).then(r));
    const res = await request(app).get('/api/plan-nodes/fiscal-years');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('should skip rows with no fiscal year', async () => {
    chain.then.mockImplementation((r) => Promise.resolve([]).then(r));
    await request(app).get('/api/plan-nodes/fiscal-years');
    expect(chain.whereNotNull).toHaveBeenCalledWith('fiscal_year');
  });

  it('should coerce the count to a number', async () => {
    // MySQL returns COUNT(*) as a string through some drivers; the switcher
    // renders it, so a "1059" that sorts like text would be a visible bug.
    chain.then.mockImplementation((r) => Promise.resolve([{ fiscal_year: 2026, node_count: '1059' }]).then(r));
    const res = await request(app).get('/api/plan-nodes/fiscal-years');
    expect(res.body.data[0]).toEqual({ fiscal_year: '2026', node_count: 1059 });
  });

  it('should return the canonical error envelope on a DB failure', async () => {
    // A knex chain is a thenable: `await q` calls q.then(onOk, onErr). Rejecting
    // the returned promise instead of invoking onErr leaves it unhandled and
    // never reaches the route's catch.
    chain.then.mockImplementation((_ok, onErr) => Promise.resolve().then(() => onErr(new Error('db down'))));
    const res = await request(app).get('/api/plan-nodes/fiscal-years');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: expect.any(String), code: 'INTERNAL_ERROR' });
  });
});
