// ── periodsService unit tests ──

const svc = require('../../src/services/reporting/periodsService');
const db = require('../../src/config/db');

function resetChain() {
  const c = db.__chain;
  c.first.mockReset().mockResolvedValue(undefined);
  c.insert.mockReset().mockResolvedValue([1]);
  c.update.mockReset().mockResolvedValue(1);
  c.del.mockReset().mockResolvedValue(1);
  c.delete.mockReset().mockResolvedValue(1);
  c.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  c.where.mockReset().mockReturnValue(c);
  c.whereNot.mockReset().mockReturnValue(c);
  c.select.mockReset().mockReturnValue(c);
  c.orderBy.mockReset().mockReturnValue(c);
}

beforeEach(() => {
  resetChain();
});

// ── listPeriods ───────────────────────────────────────────────────────────────
describe('periodsService.listPeriods', () => {
  it('should return all periods with no filter', async () => {
    const period = { id: 1, fiscal_year: 2026, quarter: 'Q1', status: 'OPEN' };
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([period]).then(r));
    const result = await svc.listPeriods();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 1 });
  });

  it('should apply status filter when provided', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await svc.listPeriods({ status: 'OPEN' });
    expect(db.__chain.where).toHaveBeenCalledWith('status', 'OPEN');
  });

  it('should apply fiscal_year filter when provided', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await svc.listPeriods({ fiscal_year: 2026 });
    expect(db.__chain.where).toHaveBeenCalledWith('fiscal_year', 2026);
  });

  it('should return an empty array when no periods match', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    const result = await svc.listPeriods({ status: 'DRAFT' });
    expect(result).toEqual([]);
  });
});

// ── getActivePeriod ───────────────────────────────────────────────────────────
describe('periodsService.getActivePeriod', () => {
  it('should return the OPEN period when one exists', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 3, status: 'OPEN', fiscal_year: 2026, quarter: 'Q2' });
    const result = await svc.getActivePeriod();
    expect(result).toMatchObject({ id: 3, status: 'OPEN' });
  });

  it('should return undefined when no OPEN period exists', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    const result = await svc.getActivePeriod();
    expect(result).toBeUndefined();
  });
});

// ── getPeriodById ─────────────────────────────────────────────────────────────
describe('periodsService.getPeriodById', () => {
  it('should return the period when found', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 5, fiscal_year: 2026, quarter: 'Q3' });
    const result = await svc.getPeriodById(5);
    expect(result).toMatchObject({ id: 5 });
  });

  it('should return undefined when period does not exist', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    const result = await svc.getPeriodById(9999);
    expect(result).toBeUndefined();
  });
});

// ── createPeriod ──────────────────────────────────────────────────────────────
describe('periodsService.createPeriod', () => {
  it('should insert and return the new period', async () => {
    db.__chain.insert.mockResolvedValueOnce([7]);
    db.__chain.first.mockResolvedValueOnce({ id: 7, fiscal_year: 2026, quarter: 'Q1', status: 'DRAFT' });
    const result = await svc.createPeriod({ fiscal_year: 2026, quarter: 'Q1' });
    expect(result).toMatchObject({ id: 7, quarter: 'Q1' });
  });
});

// ── updatePeriod ──────────────────────────────────────────────────────────────
describe('periodsService.updatePeriod', () => {
  it('should update the period and return the fresh row', async () => {
    db.__chain.update.mockResolvedValue(1);
    db.__chain.first.mockResolvedValueOnce({ id: 3, status: 'CLOSED', fiscal_year: 2026 });
    const result = await svc.updatePeriod(3, { status: 'CLOSED' });
    expect(result).toMatchObject({ id: 3, status: 'CLOSED' });
  });

  it('should close any other OPEN periods when setting status to OPEN', async () => {
    db.__chain.update.mockResolvedValue(1);
    db.__chain.first.mockResolvedValueOnce({ id: 4, status: 'OPEN', fiscal_year: 2026 });
    await svc.updatePeriod(4, { status: 'OPEN' });
    // Should call update at least twice: close others, then update the target
    expect(db.__chain.update).toHaveBeenCalledTimes(2);
  });

  it('should not close other periods when not transitioning to OPEN', async () => {
    db.__chain.update.mockResolvedValue(1);
    db.__chain.first.mockResolvedValueOnce({ id: 3, status: 'CLOSED', fiscal_year: 2026 });
    await svc.updatePeriod(3, { status: 'CLOSED' });
    // Only one update call — the target row update
    expect(db.__chain.update).toHaveBeenCalledTimes(1);
  });
});
