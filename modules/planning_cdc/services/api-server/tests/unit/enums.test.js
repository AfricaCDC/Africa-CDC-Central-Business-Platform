// ── @rbm/lib/enums unit tests ──
//
// Pure-function helpers: no DB, no mocks needed. Validates the CLAUDE.md
// "Zero Hardcoded Values" contract at the helper boundary.

const {
  STATUSES,
  getStatusConfig,
  statusToProgress,
  getTierByNumber,
  getTierByCode,
  TIERS,
} = require('@rbm/lib/enums');

describe('@rbm/lib/enums', () => {
  // ── getStatusConfig ────────────────────────────────────────
  describe('getStatusConfig', () => {
    it('should return label + tailwind classes for a known status', () => {
      const cfg = getStatusConfig(STATUSES.APPROVED);
      expect(cfg.label).toBe('Approved');
      expect(cfg.bg).toMatch(/emerald/);
      expect(cfg.text).toMatch(/emerald/);
      expect(cfg.border).toMatch(/emerald/);
      expect(cfg.dot).toMatch(/emerald/);
    });

    it('should return distinct styles for DRAFT vs REJECTED', () => {
      const draft = getStatusConfig(STATUSES.DRAFT);
      const rejected = getStatusConfig(STATUSES.REJECTED);
      expect(draft.label).toBe('Draft');
      expect(rejected.label).toBe('Rejected');
      expect(draft.bg).not.toBe(rejected.bg);
    });

    it('should humanise an unknown status by replacing underscores', () => {
      const cfg = getStatusConfig('WAITING_FOR_THINGS');
      expect(cfg.label).toBe('WAITING FOR THINGS');
    });

    it('should return fallback gray style for unknown status', () => {
      const cfg = getStatusConfig('NOPE');
      expect(cfg.bg).toContain('gray');
      expect(cfg.text).toContain('gray');
    });

    it('should return "Unknown" label for null/undefined input', () => {
      expect(getStatusConfig(null).label).toBe('Unknown');
      expect(getStatusConfig(undefined).label).toBe('Unknown');
    });
  });

  // ── statusToProgress ───────────────────────────────────────
  describe('statusToProgress', () => {
    it('should return "completed" for COMPLETED status', () => {
      expect(statusToProgress(STATUSES.COMPLETED)).toBe('completed');
    });

    it('should return "on_track" for APPROVED/IN_EXECUTION/PUBLISHED/IN_PROGRESS', () => {
      expect(statusToProgress(STATUSES.APPROVED)).toBe('on_track');
      expect(statusToProgress(STATUSES.IN_EXECUTION)).toBe('on_track');
      expect(statusToProgress(STATUSES.PUBLISHED)).toBe('on_track');
      expect(statusToProgress(STATUSES.IN_PROGRESS)).toBe('on_track');
    });

    it('should return "at_risk" for DRAFT/IN_REVIEW/PLANNING/SUBMITTED', () => {
      expect(statusToProgress(STATUSES.DRAFT)).toBe('at_risk');
      expect(statusToProgress(STATUSES.IN_REVIEW)).toBe('at_risk');
      expect(statusToProgress(STATUSES.PLANNING)).toBe('at_risk');
      expect(statusToProgress(STATUSES.SUBMITTED)).toBe('at_risk');
    });

    it('should return "delayed" for BLOCKED/REJECTED/CANCELLED', () => {
      expect(statusToProgress(STATUSES.BLOCKED)).toBe('delayed');
      expect(statusToProgress(STATUSES.REJECTED)).toBe('delayed');
      expect(statusToProgress(STATUSES.CANCELLED)).toBe('delayed');
    });

    it('should return "unknown" for unmapped statuses', () => {
      expect(statusToProgress('ANYTHING_ELSE')).toBe('unknown');
      expect(statusToProgress(null)).toBe('unknown');
      expect(statusToProgress(undefined)).toBe('unknown');
    });
  });

  // ── getTierByNumber ────────────────────────────────────────
  describe('getTierByNumber', () => {
    it('should resolve numeric id 1 to the T1 (Impact) config', () => {
      const t = getTierByNumber(1);
      expect(t.code).toBe('T1');
      expect(t.full).toBe('Impact');
      expect(t.id).toBe(1);
    });

    it('should resolve numeric id 4 to T4 (Output)', () => {
      const t = getTierByNumber(4);
      expect(t.code).toBe('T4');
      expect(t.full).toBe('Output');
    });

    it('should accept a numeric string like "2"', () => {
      const t = getTierByNumber('2');
      expect(t.code).toBe('T2');
    });

    it('should return null for unknown numeric id', () => {
      expect(getTierByNumber(99)).toBeNull();
      expect(getTierByNumber(0)).toBeNull();
    });

    it('should return null for null / undefined input', () => {
      expect(getTierByNumber(null)).toBeNull();
      expect(getTierByNumber(undefined)).toBeNull();
    });
  });

  // ── getTierByCode ──────────────────────────────────────────
  describe('getTierByCode', () => {
    it('should resolve T1 to the Impact tier', () => {
      const t = getTierByCode('T1');
      expect(t.full).toBe('Impact');
      expect(t.id).toBe(1);
    });

    it('should be case-insensitive', () => {
      expect(getTierByCode('t3').code).toBe('T3');
      expect(getTierByCode('T3').code).toBe('T3');
    });

    it('should return null for unknown codes', () => {
      expect(getTierByCode('T99')).toBeNull();
      expect(getTierByCode('XX')).toBeNull();
    });

    it('should return null for null / undefined / empty string', () => {
      expect(getTierByCode(null)).toBeNull();
      expect(getTierByCode(undefined)).toBeNull();
      expect(getTierByCode('')).toBeNull();
    });
  });

  // ── TIERS shape sanity ─────────────────────────────────────
  describe('TIERS export', () => {
    it('should expose all four tiers keyed by code', () => {
      expect(Object.keys(TIERS).sort()).toEqual(['T1', 'T2', 'T3', 'T4']);
    });

    it('should preserve legacy keys (label, color) on each tier', () => {
      for (const code of ['T1', 'T2', 'T3', 'T4']) {
        expect(typeof TIERS[code].label).toBe('string');
        expect(typeof TIERS[code].color).toBe('string');
        expect(TIERS[code].color).toMatch(/^#[0-9A-F]{6}$/i);
      }
    });
  });
});
