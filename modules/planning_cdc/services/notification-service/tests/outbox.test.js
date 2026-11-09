/**
 * Unit tests for notification-service outbox helpers.
 *
 * Covers:
 *   - `validateResetUrl` allow-list (F-010 open-redirect fix).
 *   - `normalizeEventKey` handles canonical + legacy kebab-case keys.
 *   - `buildMessageId` produces RFC-compliant Message-IDs.
 *
 * DB-touching paths (`enqueue`, `claimBatch`, `markSent`, `markFailed`) are
 * exercised by integration tests that run against a MySQL test database —
 * those are mocked away here so this file stays deterministic.
 */

jest.mock('../src/db', () => jest.fn());
jest.mock('@rbm/lib/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-secret-test-secret-test-secret';

const outbox = require('../src/outbox');

describe('validateResetUrl', () => {
  it('returns { ok: true } when reset_url is absent', () => {
    expect(outbox.validateResetUrl({})).toEqual({ ok: true });
    expect(outbox.validateResetUrl(null)).toEqual({ ok: true });
  });

  it('accepts allow-listed hosts and suffix matches', () => {
    const ok1 = outbox.validateResetUrl({ reset_url: 'https://africacdc.org/reset?t=1' });
    const ok2 = outbox.validateResetUrl({ reset_url: 'https://app.africacdc.org/reset?t=1' });
    const ok3 = outbox.validateResetUrl({ reset_url: 'http://localhost:5173/reset?t=1' });
    expect(ok1.ok).toBe(true);
    expect(ok2.ok).toBe(true);
    expect(ok3.ok).toBe(true);
  });

  it('rejects attacker-controlled hosts (F-010)', () => {
    const bad1 = outbox.validateResetUrl({ reset_url: 'https://evil.com/reset?t=1' });
    const bad2 = outbox.validateResetUrl({ reset_url: 'https://africacdc.org.evil.com/reset' });
    expect(bad1.ok).toBe(false);
    expect(bad2.ok).toBe(false);
  });

  it('rejects malformed URLs', () => {
    const bad = outbox.validateResetUrl({ reset_url: 'not a url' });
    expect(bad.ok).toBe(false);
    expect(bad.reason).toMatch(/valid URL/);
  });
});

describe('normalizeEventKey', () => {
  it('passes canonical keys unchanged', () => {
    expect(outbox.normalizeEventKey('REPORT_REVIEWED')).toBe('REPORT_REVIEWED');
    expect(outbox.normalizeEventKey('ACTIVITY_UPDATED')).toBe('ACTIVITY_UPDATED');
  });

  it('maps kebab-case aliases to canonical values', () => {
    expect(outbox.normalizeEventKey('activity-updated')).toBe('ACTIVITY_UPDATED');
    expect(outbox.normalizeEventKey('report-submitted')).toBe('REPORT_SUBMITTED');
  });

  it('throws for unknown keys', () => {
    expect(() => outbox.normalizeEventKey('totally-made-up')).toThrow(/Unknown notification event key/);
  });
});

describe('buildMessageId', () => {
  it('produces a RFC-compliant Message-ID with the configured domain', () => {
    const id = outbox.buildMessageId(42);
    expect(id).toMatch(/^<outbox-42-[a-z0-9]+@[^>]+>$/);
  });

  it('emits distinct ids for the same row', () => {
    const a = outbox.buildMessageId(42);
    const b = outbox.buildMessageId(42);
    expect(a).not.toBe(b);
  });
});
