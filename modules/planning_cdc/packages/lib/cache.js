/**
 * @rbm/lib/cache — Optional Redis-backed cache helper for the api-server.
 *
 * Design goals
 * ────────────
 * 1. **Zero hard dependency.** `ioredis` is optional. If it isn't installed
 *    OR `REDIS_URL` is unset, `createCache()` returns a no-op cache so the
 *    api-server still boots in dev/test environments without Redis.
 * 2. **Same shape, two backends.** Callers always see `{ get, set, del, wrap }`.
 *    The `wrap(key, fn, ttl)` helper is the canonical way to memoize an
 *    expensive query: if the key exists in Redis, return it; otherwise call
 *    `fn`, store the result, and return it.
 * 3. **Fail-open.** Any Redis error is swallowed and falls back to running
 *    the fresh `fn`. We never want a cache outage to break the API.
 * 4. **JSON-only.** Values are serialized via `JSON.stringify` so callers can
 *    pass any plain object. Buffers/binary data are out of scope.
 *
 * Usage
 * ─────
 *   const { createCache } = require('@rbm/lib/cache');
 *   const cache = createCache({ url: process.env.REDIS_URL });
 *
 *   // Memoize a slow query for 5 minutes:
 *   const data = await cache.wrap(`workplan:${fy}`, () => fetchWorkplan(fy), 300);
 */

const noopCache = () => ({
    get: async () => null,
    set: async () => {},
    del: async () => {},
    wrap: async (_key, fn, _ttlSeconds) => fn(),
});

const createCache = (options = {}) => {
    const url = options.url || process.env.REDIS_URL;
    if (!url) return noopCache();

    let RedisClient;
    try {
        // eslint-disable-next-line global-require, import/no-unresolved
        RedisClient = require('ioredis');
    } catch (_err) {
        // ioredis not installed — silently degrade.
        return noopCache();
    }

    let redis;
    try {
        redis = new RedisClient(url, {
            // Lazy connect so importing the module doesn't trigger a TCP
            // round-trip during boot. Connection happens on the first command.
            lazyConnect: true,
            // Avoid noisy reconnect-loop logs in dev when Redis is down.
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
        });
    } catch (_err) {
        return noopCache();
    }

    const safeGet = async (key) => {
        try {
            const raw = await redis.get(key);
            if (raw == null) return null;
            return JSON.parse(raw);
        } catch (_err) {
            return null;
        }
    };

    const safeSet = async (key, value, ttlSeconds = 300) => {
        try {
            const payload = JSON.stringify(value);
            if (ttlSeconds && ttlSeconds > 0) {
                await redis.setex(key, ttlSeconds, payload);
            } else {
                await redis.set(key, payload);
            }
        } catch (_err) {
            // fail-open
        }
    };

    const safeDel = async (key) => {
        try {
            await redis.del(key);
        } catch (_err) {
            // fail-open
        }
    };

    const wrap = async (key, fn, ttlSeconds = 300) => {
        const cached = await safeGet(key);
        if (cached !== null && cached !== undefined) return cached;
        const fresh = await fn();
        if (fresh !== null && fresh !== undefined) {
            await safeSet(key, fresh, ttlSeconds);
        }
        return fresh;
    };

    return {
        get: safeGet,
        set: safeSet,
        del: safeDel,
        wrap,
        // Escape hatch for advanced consumers (e.g. pipelines, pub/sub).
        // May be undefined when ioredis isn't installed.
        _client: redis,
    };
};

module.exports = { createCache };
