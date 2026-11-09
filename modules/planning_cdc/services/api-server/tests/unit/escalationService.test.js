// ── Escalation of approval steps that wait too long (D-20261105-09) ──

jest.mock('../../src/services/eventBusService', () => ({ emitEvent: jest.fn().mockResolvedValue({}) }));
jest.mock('../../src/services/settingsService', () => ({
  getInt: jest.fn(async (_k, d) => d),
  getSetting: jest.fn(async () => '2026-11-01'),
  getBool: jest.fn(async () => true),
}));
jest.mock('../../src/services/approvals/stepSummary', () => ({
  decideUrl: (id) => `http://localhost:5000/decide/${id}`,
  summarize: jest.fn(async (id) => ({
    step_id: id, step_label: 'Responsible Person of the Business Unit', approver_name: 'Ama Diallo',
    type_label: 'Specific activity', code: '1.2.3.01', title: 'Lab training', unit_code: 'EPR',
  })),
}));

const db = require('../../src/config/db');
const { emitEvent } = require('../../src/services/eventBusService');
const settings = require('../../src/services/settingsService');
const svc = require('../../src/services/approvals/escalationService');
const job = require('../../src/cron/approvalEscalationJob');

const NOW = new Date('2026-11-20T08:00:00Z'); // Friday
const stepsOnce = (rows) => db.__chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));

beforeEach(() => {
  jest.clearAllMocks();
  db.__chain.whereNotExists = jest.fn().mockReturnValue(db.__chain);
  db.__chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  db.__chain.first.mockReset().mockResolvedValue(undefined);
  db.__chain.update.mockReset().mockResolvedValue(1);
});

// division_codes rows returned in order by `first()`: the unit, then its ancestors.
const chainOf = (...rows) => rows.forEach((r) => db.__chain.first.mockResolvedValueOnce(r));

describe('holderAbove', () => {
  it('should climb to the first Responsible Person above the unit who is not the approver', async () => {
    chainOf(
      { code: 'CLDS', alias_of: null, parent_code: 'CLSN' },
      { code: 'CLSN', alias_of: null, parent_code: 'DG', responsible_user_id: 14 },
      { code: 'DG', alias_of: null, parent_code: null, responsible_user_id: 1 },
    );
    expect(await svc.holderAbove('CLDS', 14)).toBe(1);
  });

  it('should return null at the top of the tree', async () => {
    chainOf({ code: 'DG', alias_of: null, parent_code: null });
    expect(await svc.holderAbove('DG', 1)).toBeNull();
  });
});

describe('unitOf', () => {
  it('should use the contributing unit on a contributor step, else the main unit', () => {
    expect(svc.unitOf({ scope: 'CONTRIB_DIVISION', contrib_org_code: 'LAB', main_org_code: 'EPR' })).toBe('LAB');
    expect(svc.unitOf({ scope: null, division_code: 'EPR', main_org_code: null })).toBe('EPR');
  });
});

describe('escalateDueSteps', () => {
  it('should escalate a step waiting longer than the setting, once, and email both people', async () => {
    stepsOnce([
      { id: 31, approver_id: 14, scope: null, division_code: 'CLDS', pending_since: '2026-11-05T10:00:00Z' },
      { id: 32, approver_id: 14, scope: null, division_code: 'CLDS', pending_since: '2026-11-18T10:00:00Z' }, // 2 days only
      { id: 33, approver_id: 14, scope: null, division_code: 'CLDS', pending_since: '2026-10-20T10:00:00Z' }, // before « since »
    ]);
    chainOf(
      { code: 'CLDS', alias_of: null, parent_code: 'CLSN' },
      { code: 'CLSN', alias_of: null, parent_code: null, responsible_user_id: 20 },
    );
    expect(await svc.escalateDueSteps(NOW)).toEqual({ escalated: 1, skipped: 0 });
    expect(db.__chain.update).toHaveBeenCalledWith({ escalated_to_id: 20, escalated_at: 'CURRENT_TIMESTAMP' });
    const event = emitEvent.mock.calls[0][0];
    expect(event.eventKey).toBe('approval_step.escalated');
    expect(event.entity).toEqual({ id: 31, owner_user_id: 20, previous_owner_user_id: 14 });
    expect(event.metadata.ctaUrl).toBe('http://localhost:5000/decide/31');
    expect(event.metadata.subject).toBe('Approval waiting 14 days: 1.2.3.01');
    expect(event.metadata.intro).toContain('Ama Diallo');
  });

  it('should skip a step with nobody above', async () => {
    stepsOnce([{ id: 31, approver_id: 14, scope: null, division_code: 'DG', pending_since: '2026-11-05T10:00:00Z' }]);
    chainOf({ code: 'DG', alias_of: null, parent_code: null });
    expect(await svc.escalateDueSteps(NOW)).toEqual({ escalated: 0, skipped: 1 });
    expect(emitEvent).not.toHaveBeenCalled();
  });
});

describe('approvalEscalationJob', () => {
  it('should do nothing when switched off, on a weekend or before the hour', async () => {
    settings.getBool.mockResolvedValueOnce(false);
    expect(await job.tick(NOW)).toBeNull();
    expect(await job.tick(new Date('2026-11-21T08:00:00Z'))).toBeNull(); // Saturday
    expect(await job.tick(new Date('2026-11-20T05:00:00Z'))).toBeNull();
  });

  it('should escalate when due', async () => {
    expect(await job.tick(NOW)).toEqual({ escalated: 0, skipped: 0 });
  });
});
