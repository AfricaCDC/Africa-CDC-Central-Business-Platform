// ── Activity reports behind a quarterly indicator report (D-20261105-12) ──

const db = require('../../src/config/db');
const { activityEvidence } = require('../../src/services/reporting/indicatorActivityEvidence');

const Q = { indicatorId: 40, divisionCode: 'EPR', quarter: 'Q4', fiscalYear: '2026' };
const rowsOnce = (rows) => db.__chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));

beforeEach(() => {
  jest.clearAllMocks();
  db.__chain.where.mockReset().mockReturnValue(db.__chain);
  db.__chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
});

describe('activityEvidence', () => {
  it('should read the approved reports of the quarter, for the unit, linked to the indicator directly or through the broad', async () => {
    const inner = { where: jest.fn().mockReturnThis(), orWhere: jest.fn().mockReturnThis(), whereNull: jest.fn().mockReturnThis(), orWhereExists: jest.fn().mockReturnThis(), from: jest.fn().mockReturnThis(), whereRaw: jest.fn().mockReturnThis() };
    db.__chain.where.mockImplementation((arg) => {
      if (typeof arg === 'function') arg.call(inner);
      return db.__chain;
    });
    await activityEvidence(Q);
    expect(inner.where).toHaveBeenCalledWith('s.linked_indicator_id', 40);
    inner.orWhereExists.mock.calls[0][0].call(inner);
    expect(inner.from).toHaveBeenCalledWith('indicator_broad_links as l');
    expect(inner.where).toHaveBeenCalledWith('l.indicator_id', 40);
    expect(db.__chain.where).toHaveBeenCalledWith('s.responsible_division_code', 'EPR');
    expect(db.__chain.where).toHaveBeenCalledWith('ar.status', 'APPROVED');
    expect(db.__chain.where).toHaveBeenCalledWith('ar.quarter', 'Q4');
    expect(db.__chain.where).toHaveBeenCalledWith('ar.fiscal_year', '2026');
  });

  it('should prefer the indicator achievement, fall back to the achievements and link each report', async () => {
    rowsOnce([
      { id: 7, plan_node_id: 42, code: '1.2.3.01', title: 'EQA round', indicator_achievement: ' 3 labs assessed ', achievements: 'Round done' },
      { id: 8, plan_node_id: 43, code: '1.2.3.02', title: 'Workshop', indicator_achievement: null, achievements: '25 trained' },
      { id: 9, plan_node_id: 44, code: '1.2.3.03', title: 'Mission', indicator_achievement: '', achievements: null },
    ]);
    expect(await activityEvidence(Q)).toEqual([
      { id: 7, plan_node_id: 42, code: '1.2.3.01', title: 'EQA round', text: '3 labs assessed', link: '/activity-report/42/report/7' },
      { id: 8, plan_node_id: 43, code: '1.2.3.02', title: 'Workshop', text: '25 trained', link: '/activity-report/43/report/8' },
      { id: 9, plan_node_id: 44, code: '1.2.3.03', title: 'Mission', text: '', link: '/activity-report/44/report/9' },
    ]);
  });
});
