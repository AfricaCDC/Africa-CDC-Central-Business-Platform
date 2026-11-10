/**
 * Unit tests — formatQueue.
 *
 * Verifies concurrency cap, FIFO ordering, and RATE_LIMITED on backlog
 * overflow. Pure in-memory, deterministic (no timers relied upon for
 * scheduling logic).
 */

// Ensure config validation passes.
process.env.JWT_ACCESS_SECRET = 'x'.repeat(32);

const {
  createFormatQueue,
  queues,
  snapshot,
  FORMATS,
} = require('../../src/queue/formatQueue');

describe('formatQueue', () => {
  describe('createFormatQueue', () => {
    test('caps concurrency at the configured value', async () => {
      const q = createFormatQueue({ name: 't', concurrency: 2, backlogLimit: 10 });
      let inFlight = 0;
      let max = 0;
      const jobs = Array.from({ length: 6 }, () =>
        q.submit(async () => {
          inFlight += 1;
          if (inFlight > max) max = inFlight;
          await new Promise((r) => setTimeout(r, 5));
          inFlight -= 1;
        }),
      );
      await Promise.all(jobs);
      expect(max).toBeLessThanOrEqual(2);
    });

    test('rejects with RATE_LIMITED once backlog is exceeded', async () => {
      const q = createFormatQueue({ name: 't', concurrency: 1, backlogLimit: 2 });
      const running = [];
      for (let i = 0; i < 3; i += 1) {
        running.push(q.submit(() => new Promise((r) => setTimeout(r, 30))));
      }
      await expect(q.submit(() => Promise.resolve('rejected?'))).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        statusCode: 429,
      });
      await Promise.all(running);
    });

    test('preserves FIFO order of completion when concurrency=1', async () => {
      const q = createFormatQueue({ name: 't', concurrency: 1, backlogLimit: 10 });
      const order = [];
      const jobs = [1, 2, 3, 4].map((n) =>
        q.submit(async () => {
          await new Promise((r) => setTimeout(r, 5));
          order.push(n);
          return n;
        }),
      );
      await Promise.all(jobs);
      expect(order).toEqual([1, 2, 3, 4]);
    });

    test('stats report running + pending accurately while draining', async () => {
      const q = createFormatQueue({ name: 't', concurrency: 1, backlogLimit: 5 });
      const jobs = Array.from({ length: 3 }, () =>
        q.submit(() => new Promise((r) => setTimeout(r, 20))),
      );
      const s = q.stats();
      expect(s.running).toBe(1);
      expect(s.pending).toBe(2);
      expect(s.concurrency).toBe(1);
      expect(s.backlogLimit).toBe(5);
      await Promise.all(jobs);
      expect(q.stats().running).toBe(0);
      expect(q.stats().pending).toBe(0);
    });
  });

  describe('registry', () => {
    test('exposes one queue per supported format', () => {
      expect(FORMATS).toEqual(['pdf', 'pptx', 'xlsx', 'docx', 'csv', 'zip']);
      FORMATS.forEach((f) => {
        expect(queues[f]).toBeDefined();
        expect(typeof queues[f].submit).toBe('function');
      });
    });

    test('snapshot returns one stats row per format', () => {
      const s = snapshot();
      expect(s).toHaveLength(FORMATS.length);
      s.forEach((row) => {
        expect(FORMATS).toContain(row.name);
        expect(row.concurrency).toBeGreaterThan(0);
      });
    });
  });
});
