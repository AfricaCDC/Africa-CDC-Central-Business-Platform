const axios = require('axios');

const CBP_BASE_URL = process.env.CBP_BASE_URL || 'https://cbp.africacdc.org';
// The endpoints carry CBP's share token: they come from the environment only,
// never from a default in the code (D-20261108-02).
const CBP_STAFF_ENDPOINT = process.env.CBP_STAFF_ENDPOINT || '';
const CBP_DIVISIONS_ENDPOINT = process.env.CBP_DIVISIONS_ENDPOINT || '';

/** CBP URL for an endpoint read from the environment; refuses a missing one. */
function cbpUrl(endpoint, name) {
  if (!endpoint) throw new Error(`${name} is not set: the CBP staff import is not configured`);
  return `${CBP_BASE_URL}${endpoint}`;
}
const CBP_AUTH_USERNAME = process.env.CBP_AUTH_USERNAME || '';
const CBP_AUTH_PASSWORD = process.env.CBP_AUTH_PASSWORD || '';
// CBP answers /staff/share/* with a 307 to /staff/backend/share/*. axios drops
// its `auth` option when it follows a redirect, so every call came back 401.
// An explicit header survives the same-host redirect.
const CBP_AUTH_HEADERS = Object.freeze({
  Authorization: `Basic ${Buffer.from(`${CBP_AUTH_USERNAME}:${CBP_AUTH_PASSWORD}`).toString('base64')}`,
});
const CBP_CACHE_TTL = parseInt(process.env.CBP_CACHE_TTL, 10) || 600;

// In-memory cache
const cache = {};

function cacheGet(key) {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { delete cache[key]; return null; }
  return entry.data;
}

function cacheSet(key, data, ttlSeconds = CBP_CACHE_TTL) {
  cache[key] = { data, expiresAt: Date.now() + ttlSeconds * 1000 };
}

// eslint-disable-next-line complexity -- 32-field snake_case ↔ camelCase coalesce with `a || b || ''` fallbacks per field. Complexity count tracks the field count 1:1; converting to a table-driven map would change the data-contract surface and risk silent shape drift on the CBP external API. (D-20260416-07)
function normaliseStaffRecord(raw) {
  return {
    staffId: String(raw.staff_id || raw.staffId || ''),
    firstName: raw.fname || raw.firstName || '',
    lastName: raw.lname || raw.lastName || '',
    otherName: raw.oname || raw.otherName || '',
    title: raw.title || '',
    gender: raw.gender || '',
    dateOfBirth: raw.date_of_birth || raw.dateOfBirth || '',
    nationality: raw.nationality || '',
    workEmail: raw.work_email || raw.workEmail || '',
    privateEmail: raw.private_email || raw.privateEmail || '',
    phone1: raw.tel_1 || raw.phone1 || '',
    phone2: raw.tel_2 || raw.phone2 || '',
    whatsapp: raw.whatsapp || '',
    divisionName: raw.division_name || raw.divisionName || '',
    divisionId: String(raw.division_id || raw.divisionId || ''),
    dutyStationName: raw.duty_station_name || raw.dutyStationName || '',
    dutyStationId: String(raw.duty_station_id || raw.dutyStationId || ''),
    jobName: raw.job_name || raw.jobName || '',
    jobActing: raw.job_acting || raw.jobActing || '',
    grade: raw.grade || '',
    sapNo: raw.SAPNO || raw.sapNo || '',
    firstSupervisor: raw.first_supervisor || raw.firstSupervisor || '',
    secondSupervisor: raw.second_supervisor || raw.secondSupervisor || '',
    funder: raw.funder || '',
    funderId: String(raw.funder_id || raw.funderId || ''),
    contractType: raw.contract_type || raw.contractType || '',
    contractingInstitution: raw.contracting_institution || raw.contractingInstitution || '',
    contractStartDate: raw.start_date || raw.contractStartDate || '',
    contractEndDate: raw.end_date || raw.contractEndDate || '',
    initiationDate: raw.initiation_date || raw.initiationDate || '',
    status: raw.status || '',
    physicalLocation: raw.physical_location || raw.physicalLocation || '',
    signature: raw.signature || '',
  };
}

function extractUniqueDivisions(staffList) {
  const map = new Map();
  for (const s of staffList) {
    if (s.divisionId && s.divisionName && !map.has(s.divisionId)) {
      map.set(s.divisionId, { id: s.divisionId, name: s.divisionName });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function extractUniqueDutyStations(staffList) {
  const map = new Map();
  for (const s of staffList) {
    if (s.dutyStationId && s.dutyStationName && !map.has(s.dutyStationId)) {
      map.set(s.dutyStationId, { id: s.dutyStationId, name: s.dutyStationName });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Fetch every staff record from the CBP API (basic-auth), normalize, and cache.
 *
 * Populates per-id, per-email, divisions and duty stations caches as a side effect.
 *
 * @param {boolean} [forceRefresh=false] — when true, bypass the in-memory cache
 * @returns {Promise<Array<object>>} normalised staff records
 * @throws {Error} when the HTTP call fails
 * @example
 * const staff = await fetchAllStaff();
 */
/** Total GET attempts for the staff directory (idempotent, so safe to repeat). */
const CBP_STAFF_FETCH_ATTEMPTS = 3;
/** Base back-off between attempts; attempt n waits n * base ms. */
const CBP_RETRY_BASE_MS = Number.isFinite(parseInt(process.env.CBP_RETRY_BASE_MS, 10))
  ? parseInt(process.env.CBP_RETRY_BASE_MS, 10)
  : 1000;

/**
 * Transient = no HTTP response (network, timeout) or a CBP 5xx. A 4xx such as a
 * rejected basic-auth (401/403) is permanent and must fail fast.
 *
 * @param {object} err — axios error
 * @returns {boolean}
 * @example isTransientCbpError({ response: { status: 503 } }) // true
 */
function isTransientCbpError(err) {
  const status = err?.response?.status;
  return !status || status >= 500;
}

/**
 * GET the staff directory with bounded retries on transient failures.
 *
 * @param {string} url
 * @returns {Promise<object>} axios response
 * @throws {Error} the last axios error once attempts are exhausted or on a permanent error
 * @example const res = await getStaffWithRetry(url);
 */
async function getStaffWithRetry(url) {
  const config = {
    headers: CBP_AUTH_HEADERS,
    timeout: 30000,
  };
  let lastErr;
  for (let attempt = 1; attempt <= CBP_STAFF_FETCH_ATTEMPTS; attempt += 1) {
    try {
      // Sequential on purpose: a parallel retry would hammer CBP.
      return await axios.get(url, config);
    } catch (err) {
      lastErr = err;
      if (!isTransientCbpError(err) || attempt === CBP_STAFF_FETCH_ATTEMPTS) break;
      await new Promise((resolve) => { setTimeout(resolve, CBP_RETRY_BASE_MS * attempt); });
    }
  }
  throw lastErr;
}

// eslint-disable-next-line complexity -- cache check + upstream fetch + response-shape coalesce (array|{data}|{results}) + derived-cache population loop (per-id + per-email + divisions + duty stations). Each branch is a distinct cache-population target; splitting would scatter the side-effect contract of the one canonical fetch path. (D-20260416-07)
async function fetchAllStaff(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = cacheGet('all_staff');
    if (cached) return cached;
  }

  const url = cbpUrl(CBP_STAFF_ENDPOINT, 'CBP_STAFF_ENDPOINT');
  const response = await getStaffWithRetry(url);

  const staffList = Array.isArray(response.data)
    ? response.data
    : response.data?.data || response.data?.results || [];

  const normalised = staffList.map(normaliseStaffRecord);

  cacheSet('all_staff', normalised);
  for (const s of normalised) {
    if (s.staffId) cacheSet(`staff:id:${s.staffId}`, s);
    if (s.workEmail) cacheSet(`staff:email:${s.workEmail.toLowerCase()}`, s);
  }
  cacheSet('divisions', extractUniqueDivisions(normalised));
  cacheSet('duty_stations', extractUniqueDutyStations(normalised));

  return normalised;
}

/**
 * Return a cached staff record by `staffId`, falling back to a full fetch.
 *
 * @param {string|number} staffId — CBP staff id
 * @returns {Promise<object|null>} staff record or null when not found
 * @throws {Error} when the upstream fetch fails
 * @example
 * const staff = await getStaffByStaffId('123');
 */
async function getStaffByStaffId(staffId) {
  const cached = cacheGet(`staff:id:${staffId}`);
  if (cached) return cached;
  const allStaff = await fetchAllStaff();
  return allStaff.find(s => String(s.staffId) === String(staffId)) || null;
}

/**
 * Return a cached staff record by work email (case-insensitive).
 *
 * @param {string} email — staff work email
 * @returns {Promise<object|null>} staff record or null when not found
 * @throws {Error} when the upstream fetch fails
 * @example
 * const staff = await getStaffByEmail('user@africacdc.org');
 */
async function getStaffByEmail(email) {
  const normEmail = email.toLowerCase().trim();
  const cached = cacheGet(`staff:email:${normEmail}`);
  if (cached) return cached;
  const allStaff = await fetchAllStaff();
  return allStaff.find(s => s.workEmail && s.workEmail.toLowerCase() === normEmail) || null;
}

/**
 * Case-insensitive substring search across name, email, division and job fields.
 *
 * @param {string} query — search term (min 2 chars)
 * @returns {Promise<Array<object>>} matching staff records; empty when query is too short
 * @throws {Error} when the upstream fetch fails
 * @example
 * const results = await searchStaff('Lenny');
 */
async function searchStaff(query) {
  if (!query || query.trim().length < 2) return [];
  const allStaff = await fetchAllStaff();
  const q = query.toLowerCase().trim();
  return allStaff.filter(s => {
    const fullName = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase();
    return fullName.includes(q) ||
      (s.workEmail && s.workEmail.toLowerCase().includes(q)) ||
      (s.divisionName && s.divisionName.toLowerCase().includes(q)) ||
      (s.jobName && s.jobName.toLowerCase().includes(q));
  });
}

/**
 * Return the unique set of divisions observed in the staff list.
 *
 * @returns {Promise<Array<{id: string, name: string}>>} alphabetically sorted divisions
 * @throws {Error} when the upstream fetch fails
 * @example
 * const divs = await getStaffDivisions();
 */
async function getStaffDivisions() {
  const cached = cacheGet('divisions');
  if (cached) return cached;
  const allStaff = await fetchAllStaff();
  return extractUniqueDivisions(allStaff);
}

/**
 * Return the unique set of duty stations observed in the staff list.
 *
 * @returns {Promise<Array<{id: string, name: string}>>} alphabetically sorted duty stations
 * @throws {Error} when the upstream fetch fails
 * @example
 * const stations = await getStaffDutyStations();
 */
async function getStaffDutyStations() {
  const cached = cacheGet('duty_stations');
  if (cached) return cached;
  const allStaff = await fetchAllStaff();
  return extractUniqueDutyStations(allStaff);
}

/**
 * Fetch the canonical division list directly from the CBP divisions endpoint.
 *
 * @param {boolean} [forceRefresh=false] — when true, bypass the in-memory cache
 * @returns {Promise<Array<{id: string, name: string}>>} alphabetically sorted divisions
 * @throws {Error} when the HTTP call fails
 * @example
 * const divs = await fetchCBPDivisions(true);
 */
async function fetchCBPDivisions(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = cacheGet('cbp_divisions');
    if (cached) return cached;
  }

  const url = cbpUrl(CBP_DIVISIONS_ENDPOINT, 'CBP_DIVISIONS_ENDPOINT');
  const response = await axios.get(url, {
    headers: CBP_AUTH_HEADERS,
    timeout: 15000,
  });

  const raw = Array.isArray(response.data)
    ? response.data
    : response.data?.data || response.data?.results || [];

  const divisions = raw.map(d => ({
    id: String(d.id || d.division_id || ''),
    name: d.name || d.division_name || '',
  })).filter(d => d.id && d.name).sort((a, b) => a.name.localeCompare(b.name));

  cacheSet('cbp_divisions', divisions);
  return divisions;
}

module.exports = {
  fetchAllStaff,
  getStaffByStaffId,
  getStaffByEmail,
  searchStaff,
  getStaffDivisions,
  getStaffDutyStations,
  fetchCBPDivisions,
};
