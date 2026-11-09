// ── cbpService unit tests ──
//
// Covers: cacheGet/cacheSet, normaliseStaffRecord, fetchAllStaff,
//         searchStaff, getStaffByStaffId, getStaffDivisions, getStaffDutyStations, fetchCBPDivisions

// The cbpService uses a module-level cache object. To isolate tests we
// reset the module registry before each describe group and re-require the
// service so every group starts with a cold cache.

const axios = require('axios');

// Zero back-off keeps the retry tests deterministic and fast.
process.env.CBP_RETRY_BASE_MS = '0';
// The endpoints (they carry CBP's share token) come from the environment only
// (D-20261108-02): fictitious values here.
process.env.CBP_STAFF_ENDPOINT = '/staff/share/get_current_staff/test-token';
process.env.CBP_DIVISIONS_ENDPOINT = '/staff/share/divisions/test-token';

function makeStaffRaw(overrides = {}) {
  return {
    staff_id: 'S001',
    fname: 'John',
    lname: 'Doe',
    oname: 'M',
    title: 'Dr',
    gender: 'M',
    date_of_birth: '1980-01-01',
    nationality: 'Ethiopian',
    work_email: 'j.doe@africacdc.org',
    private_email: 'jdoe@gmail.com',
    tel_1: '+251911',
    tel_2: '',
    whatsapp: '+251911',
    division_name: 'Disease Control',
    division_id: '10',
    duty_station_name: 'Addis Ababa',
    duty_station_id: '1',
    job_name: 'Officer',
    job_acting: '',
    grade: 'P3',
    SAPNO: 'SAP123',
    first_supervisor: 'S002',
    second_supervisor: 'S003',
    funder: 'WHO',
    funder_id: '5',
    contract_type: 'FT',
    contracting_institution: 'Africa CDC',
    start_date: '2020-01-01',
    end_date: '2025-12-31',
    initiation_date: '2019-12-01',
    status: 'ACTIVE',
    physical_location: 'HQ',
    signature: 'sig.png',
    ...overrides,
  };
}

// Helper: get a fresh (cold-cache) instance of cbpService
function freshSvc() {
  jest.resetModules();
  // Re-apply axios mock after module reset
  jest.mock('axios');
  return require('../../src/services/cbpService');
}

beforeEach(() => {
  jest.clearAllMocks();
  axios.get.mockReset();
});

// ── fetchAllStaff ─────────────────────────────────────────────────────────────
describe('fetchAllStaff()', () => {
  it('should return normalised staff list from API', async () => {
    const svc = freshSvc();
    const raw = [makeStaffRaw(), makeStaffRaw({ staff_id: 'S002', fname: 'Jane', lname: 'Smith' })];
    require('axios').get.mockResolvedValueOnce({ data: { data: raw } });
    const result = await svc.fetchAllStaff(true);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].staffId).toBe('S001');
    expect(result[0].firstName).toBe('John');
    expect(result[0].workEmail).toBe('j.doe@africacdc.org');
  });

  it('should handle API returning plain array', async () => {
    const svc = freshSvc();
    const raw = [makeStaffRaw()];
    require('axios').get.mockResolvedValueOnce({ data: raw });
    const result = await svc.fetchAllStaff(true);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should return empty array when API returns nothing', async () => {
    const svc = freshSvc();
    require('axios').get.mockResolvedValueOnce({ data: null });
    const result = await svc.fetchAllStaff(true);
    expect(result).toEqual([]);
  });

  it('should return cached result on second call', async () => {
    const svc = freshSvc();
    const axiosMock = require('axios');
    const raw = [makeStaffRaw()];
    axiosMock.get.mockResolvedValueOnce({ data: { data: raw } });
    await svc.fetchAllStaff(true);  // fills cache
    await svc.fetchAllStaff();      // uses cache
    expect(axiosMock.get).toHaveBeenCalledTimes(1);
  });

  it('should throw when API errors', async () => {
    const svc = freshSvc();
    require('axios').get.mockRejectedValue(new Error('Network error'));
    await expect(svc.fetchAllStaff(true)).rejects.toThrow('Network error');
    expect(require('axios').get).toHaveBeenCalledTimes(3); // no response = transient, retried
  });
});

// ── fetchAllStaff retry (CBP is intermittently flaky; the GET is idempotent) ──
describe('fetchAllStaff() retry', () => {
  const httpErr = (status) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status } });

  it('should retry a transient 503 and succeed on the next attempt', async () => {
    const svc = freshSvc();
    require('axios').get
      .mockRejectedValueOnce(httpErr(503))
      .mockResolvedValueOnce({ data: { data: [makeStaffRaw()] } });
    const staff = await svc.fetchAllStaff(true);
    expect(staff).toHaveLength(1);
    expect(require('axios').get).toHaveBeenCalledTimes(2);
  });

  it('should not retry a rejected basic-auth (401) and surface it immediately', async () => {
    const svc = freshSvc();
    require('axios').get.mockRejectedValue(httpErr(401));
    await expect(svc.fetchAllStaff(true)).rejects.toThrow('status code 401');
    expect(require('axios').get).toHaveBeenCalledTimes(1);
  });
});

// ── searchStaff ───────────────────────────────────────────────────────────────
describe('searchStaff()', () => {
  it('should return matching staff', async () => {
    const svc = freshSvc();
    const raw = [makeStaffRaw(), makeStaffRaw({ staff_id: 'S002', fname: 'Jane', lname: 'Smith' })];
    require('axios').get.mockResolvedValueOnce({ data: { data: raw } });
    const result = await svc.searchStaff('John');
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((s) => s.firstName === 'John')).toBe(true);
  });

  it('should return empty array for empty search term', async () => {
    const svc = freshSvc();
    const result = await svc.searchStaff('');
    expect(result).toEqual([]);
  });

  it('should return empty array when no matches', async () => {
    const svc = freshSvc();
    require('axios').get.mockResolvedValueOnce({ data: { data: [makeStaffRaw()] } });
    const result = await svc.searchStaff('Zyxwvuts');
    expect(result).toEqual([]);
  });
});

// ── getStaffByStaffId ─────────────────────────────────────────────────────────
describe('getStaffByStaffId()', () => {
  it('should return matching staff member', async () => {
    const svc = freshSvc();
    const raw = [makeStaffRaw({ staff_id: 'CDC001' })];
    require('axios').get.mockResolvedValueOnce({ data: { data: raw } });
    // fetchAllStaff(true) populates the per-id cache; then getStaffByStaffId reads it
    await svc.fetchAllStaff(true);
    const result = await svc.getStaffByStaffId('CDC001');
    expect(result).toBeTruthy();
    expect(result.staffId).toBe('CDC001');
  });

  it('should return null when staff not found', async () => {
    const svc = freshSvc();
    require('axios').get.mockResolvedValueOnce({ data: { data: [makeStaffRaw()] } });
    const result = await svc.getStaffByStaffId('GHOST999');
    expect(result).toBeNull();
  });

  it('should return null for falsy staffId', async () => {
    const svc = freshSvc();
    const result = await svc.getStaffByStaffId('');
    expect(result).toBeNull();
  });
});

// ── getStaffDivisions ─────────────────────────────────────────────────────────
describe('getStaffDivisions()', () => {
  it('should return divisions populated during fetchAllStaff', async () => {
    const svc = freshSvc();
    const raw = [
      makeStaffRaw({ division_id: '10', division_name: 'Disease Control' }),
      makeStaffRaw({ staff_id: 'S002', division_id: '10', division_name: 'Disease Control' }),
      makeStaffRaw({ staff_id: 'S003', division_id: '20', division_name: 'Women Health' }),
    ];
    require('axios').get.mockResolvedValueOnce({ data: { data: raw } });
    // Populate the divisions cache via fetchAllStaff(true)
    await svc.fetchAllStaff(true);
    const result = await svc.getStaffDivisions();
    expect(Array.isArray(result)).toBe(true);
    const names = result.map((d) => d.name);
    expect(names).toContain('Disease Control');
    expect(names).toContain('Women Health');
    // No duplicates
    expect(names.filter((n) => n === 'Disease Control').length).toBe(1);
  });
});

// ── getStaffDutyStations ──────────────────────────────────────────────────────
describe('getStaffDutyStations()', () => {
  it('should return duty stations populated during fetchAllStaff', async () => {
    const svc = freshSvc();
    const raw = [
      makeStaffRaw({ duty_station_id: '100', duty_station_name: 'Addis Ababa' }),
      makeStaffRaw({ staff_id: 'S002', duty_station_id: '200', duty_station_name: 'Geneva' }),
    ];
    require('axios').get.mockResolvedValueOnce({ data: { data: raw } });
    await svc.fetchAllStaff(true);
    const result = await svc.getStaffDutyStations();
    expect(Array.isArray(result)).toBe(true);
    const names = result.map((d) => d.name);
    expect(names).toContain('Addis Ababa');
    expect(names).toContain('Geneva');
  });
});

// ── fetchCBPDivisions ─────────────────────────────────────────────────────────
describe('fetchCBPDivisions()', () => {
  it('should return divisions from CBP API', async () => {
    const svc = freshSvc();
    const divs = [{ id: '1', name: 'Disease Control' }];
    require('axios').get.mockResolvedValueOnce({ data: { data: divs } });
    const result = await svc.fetchCBPDivisions(true);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].name).toBe('Disease Control');
  });

  it('should use cache on second call without forceRefresh', async () => {
    const svc = freshSvc();
    const axiosMock = require('axios');
    const divs = [{ id: '1', name: 'Disease Control' }];
    axiosMock.get.mockResolvedValueOnce({ data: { data: divs } });
    await svc.fetchCBPDivisions(true);  // populate cache
    await svc.fetchCBPDivisions();      // should use cache
    expect(axiosMock.get).toHaveBeenCalledTimes(1);
  });

  it('should throw on API error', async () => {
    const svc = freshSvc();
    require('axios').get.mockRejectedValueOnce(new Error('Network down'));
    await expect(svc.fetchCBPDivisions(true)).rejects.toThrow();
  });
});

describe('CBP basic-auth survives the 307 redirect', () => {
  it('should send credentials as an explicit Authorization header, not the axios auth option', async () => {
    const svc = freshSvc();
    const get = require('axios').get;
    get.mockResolvedValueOnce({ data: [] });
    await svc.fetchAllStaff(true);
    const config = get.mock.calls[0][1];
    expect(config.auth).toBeUndefined();
    expect(config.headers.Authorization).toMatch(/^Basic /);
  });
});

describe('CBP endpoints come from the environment (D-20261108-02)', () => {
  it('should refuse to call CBP when the staff endpoint is not set', async () => {
    const saved = process.env.CBP_STAFF_ENDPOINT;
    process.env.CBP_STAFF_ENDPOINT = '';
    try {
      const cbp = freshSvc();
      await expect(cbp.fetchAllStaff(true)).rejects.toThrow('CBP_STAFF_ENDPOINT is not set');
      expect(axios.get).not.toHaveBeenCalled();
    } finally {
      process.env.CBP_STAFF_ENDPOINT = saved;
    }
  });
});
