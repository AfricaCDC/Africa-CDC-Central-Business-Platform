// ── Who may write a report or its verification files (D-20261108-02) ──

jest.mock('../../src/services/rbacService', () => ({ checkPermission: jest.fn() }));

const db = require('../../src/config/db');
const rbacService = require('../../src/services/rbacService');
const { maySubmitFor, canWriteEvidence, EVIDENCE_PARENTS } = require('../../src/services/reporting/reportAccess');
const { RBAC_SCOPES } = require('@rbm/lib/rbac');

beforeEach(() => {
  jest.clearAllMocks();
  db.__chain.first.mockReset().mockResolvedValue(undefined);
});

describe('maySubmitFor', () => {
  it('should refuse a user without quarterly_report:submit', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    expect((await maySubmitFor(7, 'EPR')).ok).toBe(false);
  });

  it('should accept scope all without looking at divisions', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    expect(await maySubmitFor(7, 'EPR')).toEqual({ ok: true, scope: 'all' });
    expect(db.__chain.first).not.toHaveBeenCalled();
  });

  it('should require a reporting role in that division otherwise', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.DIVISION });
    db.__chain.first.mockResolvedValueOnce({ user_id: 7 });
    expect((await maySubmitFor(7, 'EPR')).ok).toBe(true);
    expect(db.__chain.where).toHaveBeenCalledWith({ user_id: 7, division_code: 'EPR' });
    db.__chain.first.mockResolvedValueOnce(undefined);
    expect((await maySubmitFor(7, 'SDI')).ok).toBe(false);
  });
});

describe('canWriteEvidence', () => {
  it('should refuse an unknown parent type', async () => {
    expect(await canWriteEvidence(7, 'user', 1)).toBe(false);
  });

  it('should allow an upload before the report is first saved', async () => {
    expect(await canWriteEvidence(7, EVIDENCE_PARENTS.ACTIVITY_REPORT, 0)).toBe(true);
  });

  it('should let the author of an activity report attach files', async () => {
    db.__chain.first.mockResolvedValueOnce({ user_id: 7 });
    expect(await canWriteEvidence(7, EVIDENCE_PARENTS.ACTIVITY_REPORT, 12)).toBe(true);
  });

  it('should refuse another user unless administrator', async () => {
    db.__chain.first.mockResolvedValueOnce({ user_id: 7 });
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'own' });
    expect(await canWriteEvidence(8, EVIDENCE_PARENTS.ACTIVITY_REPORT, 12)).toBe(false);
    db.__chain.first.mockResolvedValueOnce({ user_id: 7 });
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    expect(await canWriteEvidence(8, EVIDENCE_PARENTS.ACTIVITY_REPORT, 12)).toBe(true);
  });

  it('should refuse a report that does not exist', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    expect(await canWriteEvidence(7, EVIDENCE_PARENTS.ACTIVITY_REPORT, 999)).toBe(false);
  });

  it('should follow the division of a quarterly indicator report', async () => {
    db.__chain.first.mockResolvedValueOnce({ division_code: 'EPR' });
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: RBAC_SCOPES.DIVISION });
    db.__chain.first.mockResolvedValueOnce(undefined); // not a member
    expect(await canWriteEvidence(7, EVIDENCE_PARENTS.INDICATOR_REPORT, 3)).toBe(false);
  });
});
