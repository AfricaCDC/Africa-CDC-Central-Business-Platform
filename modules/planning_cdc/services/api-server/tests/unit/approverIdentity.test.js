// ── Who may act on an approval step (D-20261105-09) ──

jest.mock('@rbm/lib/user-divisions', () => ({
  ...jest.requireActual('@rbm/lib/user-divisions'),
  getUserDivisionCodes: jest.fn(),
}));

jest.mock('../../src/services/rbacService', () => ({ checkPermission: jest.fn() }));

const db = require('../../src/config/db');
const rbacService = require('../../src/services/rbacService');
const { getUserDivisionCodes } = require('@rbm/lib/user-divisions');
const { APPROVAL_ENTITIES } = require('@rbm/lib/enums');
const { RBAC_MODULES, RBAC_SCOPES } = require('@rbm/lib/rbac');
const id = require('../../src/services/approvals/approverIdentity');

const TODAY = new Date('2026-11-10T09:00:00Z');

beforeEach(() => {
  jest.clearAllMocks();
  db.__chain.pluck.mockReset().mockReturnValue(db.__chain);
  db.__chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  db.__chain.first.mockReset().mockResolvedValue(undefined);
});

const delegatorsOnce = (ids) => db.__chain.pluck.mockReturnValueOnce(Promise.resolve(ids));

describe('actingFor', () => {
  it('should return the user then the users who delegated to them today', async () => {
    delegatorsOnce([5, 9, 12]);
    expect(await id.actingFor(12, TODAY)).toEqual([12, 5, 9]);
    expect(db.__chain.where).toHaveBeenCalledWith('starts_on', '<=', '2026-11-10');
    expect(db.__chain.where).toHaveBeenCalledWith('ends_on', '>=', '2026-11-10');
    expect(db.__chain.whereNull).toHaveBeenCalledWith('revoked_at');
  });

  it('should return nothing without a user', async () => {
    expect(await id.actingFor(null)).toEqual([]);
  });
});

describe('isActingApproverOf', () => {
  it('should accept the escalation target', async () => {
    expect(await id.isActingApproverOf(30, { approver_id: 5, escalated_to_id: 30 })).toBe(true);
  });

  it('should accept the approver and their delegate, and refuse anybody else', async () => {
    delegatorsOnce([]);
    expect(await id.isActingApproverOf(5, { approver_id: 5 })).toBe(true);
    delegatorsOnce([5]);
    expect(await id.isActingApproverOf(12, { approver_id: 5 })).toBe(true);
    delegatorsOnce([]);
    expect(await id.isActingApproverOf(13, { approver_id: 5 })).toBe(false);
  });

  it('should refuse a missing or unassigned step', async () => {
    expect(await id.isActingApproverOf(5, null)).toBe(false);
    expect(await id.isActingApproverOf(5, { approver_id: null })).toBe(false);
  });
});

describe('canActOnPendingStep', () => {
  it('should check the earliest pending step of the open instance', async () => {
    db.__chain.first.mockResolvedValueOnce({ approver_id: 5, escalated_to_id: null });
    delegatorsOnce([5]);
    expect(await id.canActOnPendingStep(12, 'ACTIVITY_REPORT', 7)).toBe(true);
    expect(db.__chain.where).toHaveBeenCalledWith({ 'ai.entity_type': 'ACTIVITY_REPORT', 'ai.entity_id': 7, 'ai.status': 'IN_REVIEW' });
  });

  it('should refuse when no step is pending', async () => {
    expect(await id.canActOnPendingStep(12, 'ACTIVITY_REPORT', 7)).toBe(false);
  });
});

describe('whereActionable', () => {
  it('should add one grouped clause: approver among the acting ids, or escalated to the user', () => {
    const inner = { whereIn: jest.fn().mockReturnThis(), orWhere: jest.fn().mockReturnThis(), orWhereNull: jest.fn().mockReturnThis() };
    const query = { where: jest.fn((fn) => { fn.call(inner); return query; }) };
    id.whereActionable(query, { alias: 's', userId: 12, actingIds: [12, 5], includeUnassigned: true });
    expect(inner.whereIn).toHaveBeenCalledWith('s.approver_id', [12, 5]);
    expect(inner.orWhere).toHaveBeenCalledWith('s.escalated_to_id', 12);
    expect(inner.orWhereNull).toHaveBeenCalledWith('s.approver_id');
  });
});

describe('getResponsibleDivisions', () => {
  it('should add the units of the users who delegated to the caller', async () => {
    delegatorsOnce([5]);
    getUserDivisionCodes.mockImplementation(async (_k, userId) => (userId === 12 ? ['EPR'] : ['SDI', 'EPR']));
    expect(await id.getResponsibleDivisions(12)).toEqual(['EPR', 'SDI']);
  });
});

// ── Who may decide a step (D-20261108-02) ──
describe('approvesEverything', () => {
  it('should check the approve right of the module of the entity type', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    expect(await id.approvesEverything(3, APPROVAL_ENTITIES.ACTIVITY_REPORT)).toBe(true);
    expect(rbacService.checkPermission).toHaveBeenCalledWith(3, RBAC_MODULES.ACTIVITY_REPORT, 'approve');
  });

  it('should refuse a right limited to a division', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: RBAC_SCOPES.DIVISION });
    expect(await id.approvesEverything(3, APPROVAL_ENTITIES.INDICATOR_DIVISION_REPORT)).toBe(false);
  });

  it('should refuse an entity type without a module, without asking RBAC', async () => {
    expect(await id.approvesEverything(3, 'UNKNOWN')).toBe(false);
    expect(rbacService.checkPermission).not.toHaveBeenCalled();
  });
});

describe('canDecideStep', () => {
  it('should accept the acting approver of the step', async () => {
    db.__chain.first.mockResolvedValueOnce({ approver_id: 5, escalated_to_id: null, entity_type: APPROVAL_ENTITIES.ACTIVITY_REPORT });
    delegatorsOnce([]);
    expect(await id.canDecideStep(5, 311)).toBe(true);
    expect(rbacService.checkPermission).not.toHaveBeenCalled();
  });

  it('should judge an outsider on the module of the step entity, not the quarterly report', async () => {
    db.__chain.first.mockResolvedValueOnce({ approver_id: 5, escalated_to_id: null, entity_type: APPROVAL_ENTITIES.ACTIVITY_REPORT });
    delegatorsOnce([]);
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    expect(await id.canDecideStep(40, 311)).toBe(true);
    expect(rbacService.checkPermission).toHaveBeenCalledWith(40, RBAC_MODULES.ACTIVITY_REPORT, 'approve');
  });

  it('should refuse an outsider without approve rights at scope all', async () => {
    db.__chain.first.mockResolvedValueOnce({ approver_id: 5, escalated_to_id: null, entity_type: APPROVAL_ENTITIES.INDICATOR_DIVISION_REPORT });
    delegatorsOnce([]);
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: RBAC_SCOPES.DIVISION });
    expect(await id.canDecideStep(40, 311)).toBe(false);
  });

  it('should refuse an unknown step', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    expect(await id.canDecideStep(40, 999)).toBe(false);
  });
});
