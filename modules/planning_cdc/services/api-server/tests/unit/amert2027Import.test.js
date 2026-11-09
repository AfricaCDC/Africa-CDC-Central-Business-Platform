// ── FY2027 load migration ──
//
// Two things are worth pinning without a live database: the column mapping
// (which encodes reviewed decisions about where targets and budgets land), and
// the refusal to run at all when the division mapping has not been signed off.

const migration = require('../../src/db/migrations/20260919000000_import_amert_2027');

const { display, numeric, budgetColumns, EXPECTED, EXPECTED_TOTAL } = migration._internals;

describe('display', () => {
  it('should render a percentage the way the 2026 generation stores it', () => {
    expect(display(0.04, 'PERCENTAGE')).toBe('4%');
    expect(display(0.7, 'PROPORTION')).toBe('70%');
  });

  it('should keep one decimal on a fractional percentage', () => {
    expect(display(0.285, 'PERCENTAGE')).toBe('28.5%');
  });

  it('should render a count as a plain number', () => {
    expect(display(25, 'NUMBER')).toBe('25');
  });

  it.each([null, undefined, ''])('should return null for %p', (value) => {
    expect(display(value, 'NUMBER')).toBeNull();
  });

  it('should pass a non-numeric value through untouched', () => {
    expect(display('Yes/No', 'NUMBER')).toBe('Yes/No');
  });
});

describe('numeric', () => {
  it('should keep the raw value alongside the rendered one', () => {
    expect(numeric(0.04)).toBe(0.04);
  });

  it.each([null, undefined, '', 'n/a'])('should return null for %p', (value) => {
    expect(numeric(value)).toBeNull();
  });
});

describe('budgetColumns', () => {
  const columns = budgetColumns({
    main: 10, pass_through: 20, tech_assistance: 30, special_projects: 40,
    total_2027: 100, y2_2028: 200, y3_2029: 300,
  });

  it('should put the plan year total in the plan-year slot, not in budget_2027', () => {
    // The columns are relative slots, not calendar years (D4). For a FY2027
    // plan the "plan year" column holds 2027 and the look-ahead columns hold
    // 2028 and 2029. Getting this backwards silently halves every dashboard.
    expect(columns.budget_total_2026).toBe(100);
    expect(columns.budget_2027).toBe(200);
    expect(columns.budget_2028).toBe(300);
  });

  it('should carry the four funding splits', () => {
    expect(columns.budget_main).toBe(10);
    expect(columns.budget_pass_through).toBe(20);
    expect(columns.budget_tech_assistance).toBe(30);
    expect(columns.budget_special_projects).toBe(40);
  });

  it('should default every column to 0 rather than null', () => {
    expect(Object.values(budgetColumns(undefined))).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('expected volumes', () => {
  it('should assert the volumes the proposal was signed off on', () => {
    expect(EXPECTED).toEqual({
      IMPACT: 1, IMPACT_INDICATOR: 7, OUTCOME_AREA: 13, OUTCOME_INDICATOR: 54, BROAD_ACTIVITY: 115,
    });
    expect(EXPECTED_TOTAL).toBe(105563940);
  });
});

describe('up', () => {
  it('should refuse to run when the division mapping is unsigned', async () => {
    jest.isolateModules(async () => {});
    const map = require('../../src/db/data/amert_2027_division_map.json');
    const signed = map.reviewed_by;
    map.reviewed_by = null;
    try {
      const knex = { schema: { hasTable: async () => true } };
      await expect(migration.up(knex)).rejects.toThrow(/reviewed_by/);
    } finally {
      map.reviewed_by = signed;
    }
  });

  it('should do nothing when plan_nodes does not exist', async () => {
    const knex = { schema: { hasTable: async () => false } };
    await expect(migration.up(knex)).resolves.toBeUndefined();
  });
});

describe('down', () => {
  it('should be a documented no-op rather than a destructive rollback', async () => {
    await expect(migration.down()).resolves.toBeUndefined();
  });
});
