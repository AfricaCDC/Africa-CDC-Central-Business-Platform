// ── CBP Staff Sync Job ──
//
// Pulls staff data from the CBP (Capacity Building Platform) and forwards
// it to api-server's POST /api/admin/sync-staff as SINGLE batched requests
// carrying `records[]` (T-07). Service-to-service auth is via a short-lived
// JWT with `svc: 'sync-service'` claim (D-07).

const { signServiceToken } = require('@rbm/lib/serviceToken');

const config = require('../config');
const { withRetry } = require('../lib/retry');
const { getJson, postJson } = require('../lib/http');

/**
 * Normalize one CBP staff row into the shape expected by `syncRequestSchema`
 * on api-server. Returns null when the row cannot be upserted (no email).
 *
 * @param {object} staff
 * @returns {object|null}
 */
function pick(...candidates) {
  for (const c of candidates) {
    if (c !== undefined && c !== null && c !== '') return c;
  }
  return undefined;
}

function normalize(staff) {
  const email = staff.email ? String(staff.email).trim().toLowerCase() : '';
  if (!email) return null;

  const firstLast = `${staff.first_name || ''} ${staff.last_name || ''}`.trim();
  const isActive = typeof staff.status === 'string' ? staff.status === 'active' : undefined;

  return {
    cbp_id: String(pick(staff.id, staff.cbp_id, '')).trim(),
    full_name: pick(staff.full_name, firstLast),
    email,
    division_code: pick(staff.division_code, staff.division_id),
    role: pick(staff.role),
    title: pick(staff.position, staff.title),
    is_active: isActive,
  };
}

function retryOpts(log, event) {
  return {
    maxAttempts: config.RETRY_MAX_ATTEMPTS,
    baseDelayMs: config.RETRY_BASE_DELAY_MS,
    maxDelayMs: config.RETRY_MAX_DELAY_MS,
    onRetry: (err, attempt, delay) => {
      if (log && log.warn) log.warn(event, { attempt, delay, err: err.message });
    },
  };
}

/**
 * Fetch staff records from CBP with retries. On unreachable host returns
 * `null` so the caller can mark the run `skipped`.
 *
 * @param {object} log
 * @returns {Promise<any[]|null>}
 */
async function fetchStaff(log) {
  const headers = {};
  if (config.CBP_API_KEY) headers['X-API-Key'] = config.CBP_API_KEY;

  try {
    const response = await withRetry(
      () => getJson(`${config.CBP_API_URL}/staff`, { headers, timeoutMs: 30000 }),
      retryOpts(log, 'cbp.fetch.retry'),
    );
    const body = response.data;
    return (body && body.data) || body || [];
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      if (log && log.warn) log.warn('cbp.fetch.unreachable', { code: err.code });
      return null;
    }
    throw err;
  }
}

/**
 * POST one batch to api-server /api/admin/sync-staff.
 *
 * @returns {Promise<{inserted:number, updated:number, skipped:number, errors:number}>}
 */
async function forwardBatch(batch, token, correlationId, log) {
  const body = { records: batch, correlationId };
  const resp = await withRetry(
    () => postJson(`${config.API_SERVER_URL}/api/admin/sync-staff`, body, {
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: 30000,
    }),
    retryOpts(log, 'cbp.forward.retry'),
  );
  const data = (resp.data && resp.data.data) || {};
  return {
    inserted: Number(data.inserted || 0),
    updated: Number(data.updated || 0),
    skipped: Number(data.skipped || 0),
    errors: Array.isArray(data.errors) ? data.errors.length : 0,
  };
}

/**
 * Run a full CBP → api-server sync.
 *
 * @param {object} [opts]
 * @param {object} [opts.log] — `@rbm/lib/logger` instance; falls back to console.
 * @returns {Promise<{fetched:number, inserted:number, updated:number, skipped:number, errors:number, duration:number, status:string, reason?:string}>}
 */
async function run(opts) {
  const log = (opts && opts.log) || console;
  const startTime = Date.now();

  if (log.info) log.info('cbp.sync.started');

  const staffData = await fetchStaff(log);
  if (staffData === null) {
    const duration = Date.now() - startTime;
    return { fetched: 0, inserted: 0, updated: 0, skipped: 0, errors: 0, duration, status: 'skipped', reason: 'CBP API unreachable' };
  }

  const records = [];
  let preSkipped = 0;
  for (const row of staffData) {
    const rec = normalize(row);
    if (rec) records.push(rec);
    else preSkipped += 1;
  }
  if (log.info) log.info('cbp.fetch.ok', { fetched: staffData.length, normalized: records.length, preSkipped });

  const token = signServiceToken('sync-service', config.SERVICE_TOKEN_SECRET, { expiresIn: '5m' });
  const correlationId = `cbp-sync-${startTime}`;
  const batchSize = config.SYNC_STAFF_BATCH_SIZE;

  const totals = { inserted: 0, updated: 0, skipped: preSkipped, errors: 0 };
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const batchResult = await forwardBatch(batch, token, `${correlationId}:${i}`, log);
    totals.inserted += batchResult.inserted;
    totals.updated += batchResult.updated;
    totals.skipped += batchResult.skipped;
    totals.errors += batchResult.errors;
  }

  const duration = Date.now() - startTime;
  const result = { fetched: staffData.length, ...totals, duration, status: 'completed' };
  if (log.info) log.info('cbp.sync.completed', result);
  return result;
}

module.exports = { run };
