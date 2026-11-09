// ── No raw SQL in 5xx responses, public export limited to approved data (D-20261108-02) ──

const db = require('../../src/config/db');
const { envelopeError } = require('../../src/routes/plan-nodes/_helpers');
const { buildQuarterlyReportRows } = require('../../src/services/reporting/quarterlyReportExportService');

const resMock = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
};

describe('plan-node envelopeError', () => {
  it('should hide the message of a server error (Knex puts the SQL in it)', () => {
    const res = resMock();
    envelopeError(res, 500, "select * from `plan_nodes` where `id` = 'x' - ER_BAD_FIELD_ERROR");
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ success: false, code: 'INTERNAL_ERROR' });
    expect(body.message).not.toMatch(/select|ER_/);
  });

  it('should keep the message of a client error', () => {
    const res = resMock();
    envelopeError(res, 404, 'Indicator not found');
    expect(res.json.mock.calls[0][0]).toMatchObject({ message: 'Indicator not found', code: 'NOT_FOUND' });
  });
});

describe('buildQuarterlyReportRows publicOnly', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should keep published indicators only for the public API', async () => {
    await buildQuarterlyReportRows({ fiscalYear: '2026', quarter: 'Q1', publicOnly: true });
    expect(db.__chain.whereIn).toHaveBeenCalledWith('p.status', expect.arrayContaining(['APPROVED']));
    expect(db.__chain.whereIn.mock.calls.find(([col]) => col === 'p.status')[1]).not.toContain('DRAFT');
  });

  it('should not filter statuses for the in-app export', async () => {
    await buildQuarterlyReportRows({ fiscalYear: '2026', quarter: 'Q1' });
    expect(db.__chain.whereIn.mock.calls.find(([col]) => col === 'p.status')).toBeUndefined();
  });
});
