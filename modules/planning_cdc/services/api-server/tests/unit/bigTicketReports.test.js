// ── Big Tickets quarterly reports (D-20261015-05) ──
//
// Who may report (lead, contributors, M&E on behalf of the business units),
// and what a save may change (M&E corrects submitted or approved reports
// without changing their status). DB and RBAC are mocked.

jest.mock('../../src/services/rbacService', () => ({ checkPermission: jest.fn() }));
jest.mock('../../src/services/divisionAliasService', () => ({ scopeCoversDivision: jest.fn() }));

const { STATUSES } = require('@rbm/lib/enums');
const { RBAC_SCOPES } = require('@rbm/lib/rbac');
const { ConflictError } = require('@rbm/lib/errors');
const db = require('../../src/config/db');
const rbacService = require('../../src/services/rbacService');
const { scopeCoversDivision } = require('../../src/services/divisionAliasService');
const { canReport, saveReport } = require('../../src/services/bigTickets/bigTicketReports');

const chain = db.__chain;
const ticket = {
  id: 29, lead_division_code: 'Digital', contributors: [{ division_code: 'PHC' }, { division_code: 'RCC' }],
  lines: [{ id: 7, target: { annual_target_numeric: 200 } }],
};
const body = { progress_status: 'ON_TRACK', narrative: 'Progress', values: [{ line_id: 7, achieved: '225', achieved_numeric: 225 }] };

beforeEach(() => {
  jest.clearAllMocks();
  chain.first.mockReset().mockResolvedValue(undefined);
  chain.insert.mockReset().mockResolvedValue([50]);
  chain.update.mockReset().mockResolvedValue(1);
  scopeCoversDivision.mockResolvedValue(false);
});

describe('canReport', () => {
  it('should let M&E (submit at scope all) report on any ticket', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.ALL });
    expect(await canReport({ id: 3 }, ticket)).toBe(true);
    expect(scopeCoversDivision).not.toHaveBeenCalled();
  });

  it('should let a contributing business unit report, not only the lead', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.OWN });
    scopeCoversDivision.mockImplementation(async (_u, scope, code) => scope === RBAC_SCOPES.DIVISION && code === 'PHC');
    expect(await canReport({ id: 4 }, ticket)).toBe(true);
  });

  it('should refuse a business unit outside the ticket, and a user without submit', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.DIVISION });
    expect(await canReport({ id: 5 }, ticket)).toBe(false);
    rbacService.checkPermission.mockResolvedValue({ allowed: false, scope: null });
    expect(await canReport({ id: 5 }, ticket)).toBe(false);
  });
});

describe('saveReport', () => {
  const args = { ticket, fiscalYear: '2026', quarter: 'Q3', body, userId: 4 };

  it('should create a draft with the values and their performance', async () => {
    const res = await saveReport({ ...args, submit: false });
    expect(res).toEqual({ id: 50, status: STATUSES.DRAFT });
    expect(chain.insert.mock.calls[0][0]).toMatchObject({ big_ticket_id: 29, quarter: 'Q3', status: STATUSES.DRAFT, imported: false });
    expect(chain.insert.mock.calls[1][0]).toMatchObject({ report_id: 50, line_id: 7, achieved: '225', performance_pct: 112.5 });
  });

  it('should refuse a business unit change to a submitted or approved report', async () => {
    chain.first.mockResolvedValueOnce({ id: 9, status: STATUSES.APPROVED });
    await expect(saveReport({ ...args, submit: false })).rejects.toBeInstanceOf(ConflictError);
  });

  it('should let M&E correct an approved (imported) report and keep it approved', async () => {
    chain.first.mockResolvedValueOnce({ id: 9, status: STATUSES.APPROVED, imported: 1 });
    const res = await saveReport({ ...args, submit: true, canEditAny: true });
    expect(res).toEqual({ id: 9, status: STATUSES.APPROVED });
    const fields = chain.update.mock.calls[0][0];
    expect(fields).toMatchObject({ status: STATUSES.APPROVED, narrative: 'Progress', imported: false });
    expect(fields).not.toHaveProperty('submitted_by');
    expect(fields).not.toHaveProperty('submitted_at');
  });

  it('should submit a draft', async () => {
    chain.first.mockResolvedValueOnce({ id: 9, status: STATUSES.DRAFT });
    const res = await saveReport({ ...args, submit: true });
    expect(res).toEqual({ id: 9, status: STATUSES.SUBMITTED });
    expect(chain.update.mock.calls[0][0]).toMatchObject({ status: STATUSES.SUBMITTED, submitted_by: 4 });
  });
});
