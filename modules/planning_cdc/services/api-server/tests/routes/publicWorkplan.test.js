/* eslint-disable no-restricted-syntax --
 * P-31: DB column-enum WIRE values in test fixtures/assertions
 * (plan_nodes.node_type = 'OUTCOME_INDICATOR'/'BROAD_ACTIVITY'/'SPECIFIC_ACTIVITY').
 * Literal wire values are intentional in tests so a column-enum rename is
 * caught by a failing test instead of masked by importing the enum.
 */
// ── GET /api/public/workplan — API-key gated workplan export ──
//
// Data model: each T3/T4 indicator carries the specific activities that
// target it (specific.linked_indicator_id → indicator.id); each specific
// embeds its parent broad (specific.parent_id → broad.id).
//
// Covers:
//   · auth: 401 without key, 401 invalid key, 403 wrong scope
//   · 200 JSON shape (indicator → specifics, specific.broad_activity) + counts
//   · tier validation (400) and format validation (400)
//   · CSV output: UTF-8 BOM, header line, one row per specific activity
//   · flattenWorkplanTree unit behavior (indicator without specifics)

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

// API-key auth driven by global.__apiKey (null → invalid).
jest.mock('../../src/services/apiKeyService', () => ({
  verifyKey: jest.fn(() => Promise.resolve(global.__apiKey || null)),
}));

// Alias resolution: identity (no alias expansion in tests).
jest.mock('../../src/services/divisionAliasService', () => ({
  sameDivision: jest.fn((a, b) => Promise.resolve(a === b)),
  resolveAliases: jest.fn((code) => Promise.resolve([code])),
  scopeCoversDivision: jest.fn((_user, scope) => Promise.resolve(scope === 'all')),
  getUserDivisionCodes: jest.fn(() => Promise.resolve([])),
  invalidateAliasCache: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const { flattenWorkplanTree, workplanCsv } = require('../../src/services/reporting/workplanTreeExportService');

function resetChain() {
  const c = sharedDb.__chain;
  c.first.mockReset().mockResolvedValue(undefined);
  c.insert.mockReset().mockResolvedValue([1]);
  c.update.mockReset().mockResolvedValue(1);
  c.del.mockReset().mockResolvedValue(1);
  c.delete.mockReset().mockResolvedValue(1);
  c.pluck.mockReset().mockResolvedValue([]);
  c.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
}

const KEY_OK = { id: 1, scopes: ['workplan:read'] };
const KEY_WRONG_SCOPE = { id: 2, scopes: ['report_export:read'] };

const INDICATOR = {
  id: 10, code: '4.2.4', title: 'Indicator T3', node_type: 'OUTCOME_INDICATOR',
  tier_id: 3, status: 'APPROVED', fiscal_year: '2026',
  responsible_division_code: 'DPHI', pillar_id: null, unit_of_measure_id: null,
  baseline_numeric: '5', target_y1_numeric: '10', target_y2_numeric: null, target_y3_numeric: null,
};
const BROAD = {
  id: 20, code: '4.2.4.01', title: 'Broad A', node_type: 'BROAD_ACTIVITY',
  parent_id: 5, status: 'APPROVED', responsible_division_code: 'DPHI',
  budget_main: '1000', start_date: null, end_date: null,
};
// Specific targets INDICATOR (linked_indicator_id: 10) and its broad parent is BROAD (parent_id: 20).
const SPECIFIC = {
  id: 30, code: '4.2.4.01.01', title: 'Specific A', node_type: 'SPECIFIC_ACTIVITY',
  parent_id: 20, linked_indicator_id: 10, status: 'APPROVED', responsible_division_code: 'DPHI',
  secondary_division_codes: '["EPR","SCI"]', contributing_divisions: '["CT"]',
  focal_user_id: 55, activity_type: 'EVENT', location: 'Virtual', is_operational: 1,
  budget_main: '500', q1_budget: '100', q2_budget: '200', q3_budget: '100', q4_budget: '100',
  budget_2027: '0', budget_2028: '0',
  primary_funding_source: 'WB', other_funding_source: null, grant_name: 'HSPA II',
  budgeting_arrangement: 'Extramural', start_date: null, end_date: null,
};

/**
 * Program the then-queue for a happy-path build. Query order in
 * buildWorkplanTree: indicators → specifics(linked) → broad parents,
 * then the lookup Promise.all (division_codes, users; pillars/uom
 * skipped as fixtures carry no ids).
 */
function queueHappyTree() {
  const c = sharedDb.__chain;
  c.then
    .mockImplementationOnce((r) => Promise.resolve([INDICATOR]).then(r)) // indicators
    .mockImplementationOnce((r) => Promise.resolve([SPECIFIC]).then(r)) // specifics (linked_indicator_id)
    .mockImplementationOnce((r) => Promise.resolve([BROAD]).then(r)) // broad parents
    .mockImplementationOnce((r) => Promise.resolve([{ code: 'DPHI', division_name: 'Digital PH' }]).then(r)) // divisions
    .mockImplementationOnce((r) => Promise.resolve([{ id: 55, first_name: 'Awa', last_name: 'Diop', full_name: null }]).then(r)); // users
}

beforeEach(() => {
  resetChain();
  global.__apiKey = null;
});

describe('GET /api/public/workplan — auth', () => {
  it('should return 401 when no API key is provided', async () => {
    const res = await request(app).get('/api/public/workplan');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('API_KEY_REQUIRED');
  });

  it('should return 401 for an invalid or revoked key', async () => {
    const res = await request(app).get('/api/public/workplan').set('X-API-Key', 'cdc_nope');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('API_KEY_INVALID');
  });

  it('should return 403 when the key lacks the workplan:read scope', async () => {
    global.__apiKey = KEY_WRONG_SCOPE;
    const res = await request(app).get('/api/public/workplan').set('X-API-Key', 'cdc_x');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('API_KEY_SCOPE_MISSING');
  });
});

describe('GET /api/public/workplan — validation', () => {
  it('should return 400 for an invalid tier', async () => {
    global.__apiKey = KEY_OK;
    const res = await request(app).get('/api/public/workplan?tier=2').set('X-API-Key', 'cdc_x');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('should return 400 for an unknown format', async () => {
    global.__apiKey = KEY_OK;
    const res = await request(app).get('/api/public/workplan?format=xml').set('X-API-Key', 'cdc_x');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });
});

describe('GET /api/public/workplan — JSON', () => {
  it('should return the indicator → specifics (with embedded broad) + meta counts', async () => {
    global.__apiKey = KEY_OK;
    queueHappyTree();

    const res = await request(app).get('/api/public/workplan?fiscal_year=2026').set('X-API-Key', 'cdc_x');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.meta.fiscal_year).toBe('2026');
    expect(res.body.meta.counts).toEqual({ indicators: 1, specific_activities: 1, broad_activities: 1 });

    const ind = res.body.data[0];
    expect(ind.code).toBe('4.2.4');
    expect(ind.tier).toBe(3);
    expect(ind.division).toEqual({ code: 'DPHI', name: 'Digital PH' });
    expect(ind.baseline).toBe(5);
    expect(ind.targets.y1).toBe(10);

    const spec = ind.specific_activities[0];
    expect(spec.code).toBe('4.2.4.01.01');
    expect(spec.focal_person).toEqual({ id: 55, name: 'Awa Diop' });
    expect(spec.contributing_divisions).toEqual(['CT']);
    expect(spec.secondary_division_codes).toEqual(['EPR', 'SCI']);
    // Kept for existing consumers: the first secondary division.
    expect(spec.secondary_division_code).toBe('EPR');
    expect(spec.budget_main).toBe(500);
    expect(spec.is_operational).toBe(true);

    // The parent broad is embedded on the specific.
    expect(spec.broad_activity.code).toBe('4.2.4.01');
    expect(spec.broad_activity.budget_main).toBe(1000);
  });
});

describe('GET /api/public/workplan — CSV', () => {
  it('should ship a UTF-8 BOM, header line and one row per specific activity', async () => {
    global.__apiKey = KEY_OK;
    queueHappyTree();

    const res = await request(app).get('/api/public/workplan?format=csv').set('X-API-Key', 'cdc_x');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.text.charCodeAt(0)).toBe(0xfeff);

    const lines = res.text.slice(1).split('\r\n');
    expect(lines[0].startsWith('indicator_code,indicator_title,tier')).toBe(true);
    expect(lines).toHaveLength(2); // header + 1 specific row
    expect(lines[1]).toContain('4.2.4.01.01'); // specific code
    expect(lines[1]).toContain('4.2.4.01'); // parent broad code
    expect(lines[1]).toContain('Awa Diop'); // focal person
  });
});

describe('flattenWorkplanTree — unit', () => {
  it('should emit one row per specific with its embedded broad columns', () => {
    const rows = flattenWorkplanTree([{
      code: 'I1', title: 'Ind', tier: 4, division: { code: 'CT' }, pillar: null,
      specific_activities: [{
        code: 'S1', title: 'Spec', status: 'APPROVED', division: { code: 'CT' },
        broad_activity: { code: 'B1', title: 'Broad', division: { code: 'CT' }, budget_main: 10 },
        secondary_division_codes: ['EPR', 'SCI'], contributing_divisions: [], focal_person: null,
      }],
    }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].indicator_code).toBe('I1');
    expect(rows[0].broad_code).toBe('B1');
    expect(rows[0].secondary_division).toBe('EPR|SCI');
    expect(rows[0].specific_code).toBe('S1');
  });

  it('should emit one row for an indicator with no specifics', () => {
    const rows = flattenWorkplanTree([{
      code: 'I2', title: 'Empty Ind', tier: 3, division: { code: 'CT' }, pillar: null,
      specific_activities: [],
    }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].indicator_code).toBe('I2');
    expect(rows[0].specific_code).toBeUndefined();

    const csv = workplanCsv(rows);
    expect(csv.split('\r\n')).toHaveLength(2);
  });
});
