// ── App Settings Service ──
//
// Single accessor for the `app_settings` key/value store (D-20260707-01).
// All admin-tunable platform behaviour (reminder schedulers, etc.) reads
// through here — NEVER query `app_settings` directly from a route or cron.
//
// A short in-memory TTL cache keeps cron ticks / hot paths off the DB;
// every write invalidates it so admin changes apply within CACHE_TTL_MS
// at worst (crons poll every 15 min anyway).

'use strict';

const db = require('../config/db');

const CACHE_TTL_MS = 60 * 1000;
let cache = null;        // Map<key, value> | null
let cacheLoadedAt = 0;

/**
 * Load all settings into the cache (one small table — full load is cheap).
 * Missing table (legacy env before the migration ran) degrades to empty.
 * @private
 */
async function loadAll() {
  const now = Date.now();
  if (cache && now - cacheLoadedAt < CACHE_TTL_MS) return cache;
  const hasTable = await db.schema.hasTable('app_settings');
  const rows = hasTable ? await db('app_settings').select('key', 'value') : [];
  cache = new Map(rows.map((r) => [r.key, r.value]));
  cacheLoadedAt = now;
  return cache;
}

/** Drop the cache — next read reloads from DB. Exported for tests. */
function invalidateCache() {
  cache = null;
  cacheLoadedAt = 0;
}

/**
 * Read a raw setting value.
 *
 * @param {string} key — e.g. 'reminders.deadline.enabled'
 * @param {string|null} [fallback=null] — returned when the key is absent
 * @returns {Promise<string|null>}
 * @throws {Error} when the DB read fails
 * @example const v = await getSetting('reminders.deadline.days_before', '7,3,1');
 */
async function getSetting(key, fallback = null) {
  const map = await loadAll();
  return map.has(key) ? map.get(key) : fallback;
}

/**
 * Read a boolean setting ('1'/'true'/'yes'/'on' → true).
 *
 * @param {string} key
 * @param {boolean} [fallback=false]
 * @returns {Promise<boolean>}
 * @example if (await getBool('reminders.deadline.enabled')) { ... }
 */
async function getBool(key, fallback = false) {
  const raw = await getSetting(key, null);
  if (raw === null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

/**
 * Read an integer setting; non-numeric values fall back.
 *
 * @param {string} key
 * @param {number} fallback
 * @returns {Promise<number>}
 * @example const hour = await getInt('reminders.deadline.hour_utc', 6);
 */
async function getInt(key, fallback) {
  const raw = await getSetting(key, null);
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Read a CSV setting as a de-duped ascending list of non-negative integers.
 *
 * @param {string} key
 * @param {number[]} fallback — returned when absent or fully non-numeric
 * @returns {Promise<number[]>}
 * @example const days = await getIntList('reminders.deadline.days_before', [7, 3, 1]);
 */
async function getIntList(key, fallback) {
  const raw = await getSetting(key, null);
  if (raw === null) return [...fallback].sort((a, b) => a - b);
  const parsed = String(raw)
    .split(',')
    .map((s) => parseInt(String(s).trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0);
  const list = parsed.length ? parsed : fallback;
  return Array.from(new Set(list)).sort((a, b) => a - b);
}

/**
 * List settings rows (full metadata) — optionally filtered by key prefix.
 * Used by the admin settings UI.
 *
 * @param {string} [prefix] — e.g. 'reminders.'
 * @returns {Promise<Array<object>>} rows with key/value/description/updated_by/updated_at
 * @example const rows = await listSettings('reminders.');
 */
async function listSettings(prefix) {
  const hasTable = await db.schema.hasTable('app_settings');
  if (!hasTable) return [];
  const q = db('app_settings')
    .select('key', 'value', 'description', 'updated_by', 'updated_at')
    .orderBy('key');
  if (prefix) q.where('key', 'like', `${prefix}%`);
  return q;
}

/**
 * Update EXISTING settings in bulk — all-or-nothing. Unknown keys reject the
 * whole batch BEFORE any write, so a typo can never half-apply a change. The
 * API must not become a free-form key creator; new settings arrive via
 * migration with a description and a seeded default.
 *
 * @param {Record<string, string|number|boolean>} entries — key → new value
 * @param {number} userId — the admin performing the change (audit column)
 * @returns {Promise<{ updated: string[], unknown: string[] }>} `updated` is empty when `unknown` is not
 * @throws {Error} when the DB write fails
 * @example await setSettings({ 'reminders.deadline.enabled': '1' }, req.user.id);
 */
async function setSettings(entries, userId) {
  const keys = Object.keys(entries || {});
  const existing = keys.length
    ? await db('app_settings').whereIn('key', keys).pluck('key')
    : [];
  const known = new Set(existing);
  const unknown = keys.filter((k) => !known.has(k));
  if (unknown.length) return { updated: [], unknown };

  const updated = [];
  for (const key of keys) {
    await db('app_settings').where('key', key).update({
      value: String(entries[key]),
      updated_by: userId || null,
      updated_at: db.fn.now(),
    });
    updated.push(key);
  }

  if (updated.length) invalidateCache();
  return { updated, unknown };
}

module.exports = {
  getSetting,
  getBool,
  getInt,
  getIntList,
  listSettings,
  setSettings,
  invalidateCache,
};
