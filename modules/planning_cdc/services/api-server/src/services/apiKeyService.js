// ── API Key service ──
//
// Generate / hash / verify / revoke personal access tokens stored in
// `api_keys`. The raw secret is shown to the operator once at creation
// time; only the SHA-256 hash is persisted, so a DB leak cannot be
// replayed against the API.

'use strict';

const crypto = require('crypto');
const db = require('../config/db');

const PREFIX = 'cdc_';          // make keys easy to grep in logs / configs
const RAW_BYTES = 32;           // 256 bits of entropy → 64 hex chars

/**
 * Hash a raw key value for storage / lookup.
 * @param {string} raw
 * @returns {string} 64-char hex sha256
 */
function hashKey(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Generate a cryptographically random key. Returns both the raw key
 * (show once to the user) and its hash (store in DB).
 * @returns {{ raw: string, hash: string, prefix: string }}
 */
function generateKey() {
  const raw = PREFIX + crypto.randomBytes(RAW_BYTES).toString('base64url');
  return { raw, hash: hashKey(raw), prefix: raw.slice(0, 12) };
}

/**
 * Create + persist a new API key for the given user. Returns the DB row
 * **plus** the one-time raw secret.
 *
 * @param {{ name: string, scopes?: string[], createdBy: number, note?: string }} input
 * @returns {Promise<{ id: number, name: string, raw: string, prefix: string, created_at: Date }>}
 */
async function createKey({ name, scopes, createdBy, note }) {
  const cleanName = String(name || '').trim().slice(0, 120);
  if (!cleanName) throw new Error('name is required');
  const { raw, hash, prefix } = generateKey();
  const [id] = await db('api_keys').insert({
    name: cleanName,
    key_hash: hash,
    key_prefix: prefix,
    scopes: scopes ? JSON.stringify(scopes) : null,
    created_by: createdBy,
    note: note ? String(note).slice(0, 255) : null,
  });
  const row = await db('api_keys').where({ id }).first();
  return { ...row, raw };
}

/**
 * Lookup a key by raw value. Returns `null` when missing or revoked.
 * Side-effect: touches `last_used_at` on success.
 *
 * @param {string} raw
 * @returns {Promise<{ id: number, scopes: string[]|null, created_by: number }|null>}
 */
async function verifyKey(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const hash = hashKey(raw);
  const row = await db('api_keys').where('key_hash', hash).first();
  if (!row || row.revoked_at) return null;
  // fire-and-forget last_used_at bump
  db('api_keys').where('id', row.id).update({ last_used_at: db.fn.now() })
    .catch(() => { /* ignore */ });
  return { id: row.id, scopes: parseScopes(row.scopes), created_by: row.created_by };
}

/**
 * MySQL JSON columns are sometimes returned as native JS objects/arrays
 * (mysql2 default) and sometimes as strings (older drivers). Handle both
 * so downstream code can rely on `Array<string>|null`.
 * @param {*} raw
 * @returns {string[]|null}
 */
function parseScopes(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * List all API keys (metadata only — never the raw secret).
 * @returns {Promise<Array>}
 */
async function listKeys() {
  const rows = await db('api_keys as k')
    .leftJoin('users as u', 'u.id', 'k.created_by')
    .select(
      'k.id', 'k.name', 'k.key_prefix', 'k.scopes', 'k.note',
      'k.created_at', 'k.last_used_at', 'k.revoked_at',
      'u.email as created_by_email',
      db.raw('CONCAT(COALESCE(u.first_name, \'\'), \' \', COALESCE(u.last_name, \'\')) as created_by_name'),
    )
    .orderBy('k.created_at', 'desc');
  return rows.map((r) => ({ ...r, scopes: parseScopes(r.scopes) }));
}

/**
 * Mark a key as revoked. Idempotent.
 * @param {number} id
 */
async function revokeKey(id) {
  await db('api_keys').where('id', id).whereNull('revoked_at')
    .update({ revoked_at: db.fn.now() });
}

/**
 * Update mutable metadata on an existing key. Only `name`, `note` and
 * `scopes` are editable — the secret hash is immutable.
 *
 * @param {number} id
 * @param {{ name?: string, note?: string, scopes?: string[]|null }} patch
 * @returns {Promise<object>} the updated row (metadata only, never the raw key)
 */
async function updateKey(id, patch) {
  const update = {};
  if (typeof patch.name === 'string') update.name = patch.name.trim().slice(0, 120);
  if (patch.note !== undefined) update.note = patch.note ? String(patch.note).slice(0, 255) : null;
  if (patch.scopes !== undefined) {
    const cleaned = Array.isArray(patch.scopes)
      ? patch.scopes.filter(Boolean).map(String)
      : null;
    update.scopes = cleaned && cleaned.length ? JSON.stringify(cleaned) : null;
  }
  if (!Object.keys(update).length) {
    return db('api_keys').where('id', id).first();
  }
  await db('api_keys').where('id', id).update(update);
  const row = await db('api_keys').where('id', id).first();
  return { ...row, scopes: parseScopes(row?.scopes) };
}

module.exports = { createKey, verifyKey, listKeys, revokeKey, updateKey, hashKey, KEY_PREFIX: PREFIX };
