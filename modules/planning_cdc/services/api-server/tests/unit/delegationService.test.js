// ── Out-of-office delegation (D-20261105-09) ──

jest.mock('../../src/services/settingsService', () => ({ getInt: jest.fn(async (_k, d) => d) }));

const db = require('../../src/config/db');
const svc = require('../../src/services/approvals/delegationService');

const TODAY = new Date('2026-11-10T09:00:00Z');
const base = { delegatorId: 5, delegateId: 12, startsOn: '2026-11-10', endsOn: '2026-11-20', reason: 'Mission', createdBy: 5 };

beforeEach(() => {
  jest.clearAllMocks();
  db.__chain.first.mockReset().mockResolvedValue(undefined);
  db.__chain.insert.mockReset().mockResolvedValue([3]);
  db.__chain.update.mockReset().mockResolvedValue(1);
});

describe('create', () => {
  it('should create a delegation for an active delegate', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 12, status: 'ACTIVE' }).mockResolvedValueOnce(undefined);
    expect(await svc.create(base, TODAY)).toBe(3);
    expect(db.__chain.insert).toHaveBeenCalledWith({
      delegator_id: 5, delegate_id: 12, starts_on: '2026-11-10', ends_on: '2026-11-20', reason: 'Mission', created_by: 5,
    });
  });

  it('should refuse a delegation to oneself or without a delegate', async () => {
    await expect(svc.create({ ...base, delegateId: 5 }, TODAY)).rejects.toThrow('yourself');
    await expect(svc.create({ ...base, delegateId: null }, TODAY)).rejects.toThrow('delegate_id is required');
  });

  it('should refuse bad, reversed, past or too long dates', async () => {
    await expect(svc.create({ ...base, startsOn: '10/11/2026' }, TODAY)).rejects.toThrow('YYYY-MM-DD');
    await expect(svc.create({ ...base, endsOn: '2026-11-09' }, TODAY)).rejects.toThrow('on or after');
    await expect(svc.create({ ...base, startsOn: '2026-11-01', endsOn: '2026-11-05' }, TODAY)).rejects.toThrow('over already');
    await expect(svc.create({ ...base, endsOn: '2027-01-30' }, TODAY)).rejects.toThrow('at most 60 days');
  });

  it('should refuse an inactive delegate', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 12, status: 'INACTIVE' });
    await expect(svc.create(base, TODAY)).rejects.toThrow('active user');
  });

  it('should answer 409 when a delegation already covers the dates', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 12, status: 'ACTIVE' }).mockResolvedValueOnce({ id: 2 });
    await expect(svc.create(base, TODAY)).rejects.toMatchObject({ statusCode: 409, code: 'DELEGATION_OVERLAP' });
  });
});

describe('revoke', () => {
  it('should let the delegator end it', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 3, delegator_id: 5, created_by: 5 });
    await svc.revoke(3, 5, false);
    expect(db.__chain.update).toHaveBeenCalledWith(expect.objectContaining({ revoked_at: 'CURRENT_TIMESTAMP' }));
  });

  it('should refuse somebody else, unless administrator', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 3, delegator_id: 5, created_by: 5 });
    await expect(svc.revoke(3, 9, false)).rejects.toThrow('cannot end');
    db.__chain.first.mockResolvedValueOnce({ id: 3, delegator_id: 5, created_by: 5 });
    await svc.revoke(3, 9, true);
    expect(db.__chain.update).toHaveBeenCalled();
  });

  it('should answer not found for an unknown or ended delegation', async () => {
    await expect(svc.revoke(99, 5, false)).rejects.toThrow('not found');
  });
});

describe('candidates', () => {
  it('should list active users, filtered by name or email when a term is given', async () => {
    db.__chain.then.mockImplementation((r) => Promise.resolve([{ id: 12, name: 'Ama Diallo', email: 'ama@example.org' }]).then(r));
    expect(await svc.candidates()).toEqual([{ id: 12, name: 'Ama Diallo', email: 'ama@example.org' }]);
    await svc.candidates('ama');
    expect(db.__chain.where).toHaveBeenCalledWith(expect.any(Function));
    expect(db.__chain.limit).toHaveBeenCalledWith(2000);
  });
});
