// ── staffRoutes integration tests ──
//
// Covers: GET /api/staff, /api/staff/divisions, /api/staff/duty-stations, /api/staff/:staffId

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = global.__testUser || { id: 1, email: 'admin@africacdc.org' };
    next();
  },
}));

jest.mock('../../src/middleware/auditLog', () => ({
  audit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn(() => Promise.resolve({ allowed: true, scope: 'all' })),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: true, denies: [] }),
}));

jest.mock('../../src/services/cbpService', () => ({
  getStaffDivisions: jest.fn().mockResolvedValue(['DCM', 'AMERT']),
  getStaffDutyStations: jest.fn().mockResolvedValue(['Addis Ababa', 'Geneva']),
  fetchCBPDivisions: jest.fn().mockResolvedValue([{ code: 'DCM', name: 'Disease Control' }]),
  fetchAllStaff: jest.fn().mockResolvedValue([]),
  searchStaff: jest.fn().mockResolvedValue([]),
  getStaffByStaffId: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const app = require('../../src/app');
const cbpService = require('../../src/services/cbpService');
const rbacService = require('../../src/services/rbacService');

const ADMIN_USER = { id: 1, email: 'admin@africacdc.org', roles: ['SYSTEM_ADMIN'] };

beforeEach(() => {
  jest.clearAllMocks();
  global.__testUser = ADMIN_USER;
  cbpService.getStaffDivisions.mockResolvedValue(['DCM', 'AMERT']);
  cbpService.getStaffDutyStations.mockResolvedValue(['Addis Ababa']);
  cbpService.fetchCBPDivisions.mockResolvedValue([{ code: 'DCM' }]);
  cbpService.fetchAllStaff.mockResolvedValue([]);
  cbpService.searchStaff.mockResolvedValue([]);
  cbpService.getStaffByStaffId.mockResolvedValue(undefined);
});

afterEach(() => {
  global.__testUser = null;
});

// ── GET /api/staff/divisions ──────────────────────────────────────────────────
describe('GET /api/staff/divisions', () => {
  it('should return staff divisions', async () => {
    cbpService.getStaffDivisions.mockResolvedValueOnce(['DCM', 'AMERT', 'FMG']);
    const res = await request(app).get('/api/staff/divisions');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(['DCM', 'AMERT', 'FMG']);
  });
});

// ── GET /api/staff/duty-stations ──────────────────────────────────────────────
describe('GET /api/staff/duty-stations', () => {
  it('should return duty stations', async () => {
    cbpService.getStaffDutyStations.mockResolvedValueOnce(['Addis Ababa', 'Geneva']);
    const res = await request(app).get('/api/staff/duty-stations');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(['Addis Ababa', 'Geneva']);
  });
});

// ── GET /api/staff/cbp-divisions ─────────────────────────────────────────────
describe('GET /api/staff/cbp-divisions', () => {
  it('should return CBP divisions', async () => {
    cbpService.fetchCBPDivisions.mockResolvedValueOnce([{ code: 'DCM', name: 'Disease' }]);
    const res = await request(app).get('/api/staff/cbp-divisions');
    expect(res.status).toBe(200);
    expect(res.body.data[0].code).toBe('DCM');
  });
});

// ── GET /api/staff ────────────────────────────────────────────────────────────
describe('GET /api/staff', () => {
  it('should return all staff with pagination', async () => {
    const staffList = [
      { staffId: 'CDC001', name: 'John Doe', division: 'DCM' },
      { staffId: 'CDC002', name: 'Jane Smith', division: 'AMERT' },
    ];
    cbpService.fetchAllStaff.mockResolvedValueOnce(staffList);
    const res = await request(app).get('/api/staff');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(2);
  });

  it('should use search when search term is provided (>=2 chars)', async () => {
    const results = [{ staffId: 'CDC001', name: 'John Doe' }];
    cbpService.searchStaff.mockResolvedValueOnce(results);
    const res = await request(app).get('/api/staff?search=Jo');
    expect(res.status).toBe(200);
    expect(cbpService.searchStaff).toHaveBeenCalledWith('Jo');
  });

  it('should not search when search term is less than 2 chars', async () => {
    cbpService.fetchAllStaff.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/staff?search=J');
    expect(res.status).toBe(200);
    expect(cbpService.fetchAllStaff).toHaveBeenCalled();
    expect(cbpService.searchStaff).not.toHaveBeenCalled();
  });

  it('should paginate results', async () => {
    const staffList = Array.from({ length: 10 }, (_, i) => ({ staffId: `S${i}`, name: `Staff ${i}` }));
    cbpService.fetchAllStaff.mockResolvedValueOnce(staffList);
    const res = await request(app).get('/api/staff?page=2&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.meta.page).toBe(2);
    expect(res.body.meta.totalPages).toBe(2);
  });
});

// ── GET /api/staff/:staffId ───────────────────────────────────────────────────
describe('GET /api/staff/:staffId', () => {
  it('should return 404 when staff member not found', async () => {
    cbpService.getStaffByStaffId.mockResolvedValueOnce(undefined);
    const res = await request(app).get('/api/staff/GHOST999');
    expect(res.status).toBe(404);
  });

  it('should return staff member when found', async () => {
    const staff = { staffId: 'CDC001', name: 'John Doe', division: 'DCM' };
    cbpService.getStaffByStaffId.mockResolvedValueOnce(staff);
    const res = await request(app).get('/api/staff/CDC001');
    expect(res.status).toBe(200);
    expect(res.body.data.staffId).toBe('CDC001');
  });
});

// ── HR fields only for users:read holders (D-20261108-02) ────────────────────
describe('CBP staff record visibility', () => {
  const RECORD = {
    staffId: 'S1', firstName: 'Ama', lastName: 'Diallo', workEmail: 'ama@africacdc.org', divisionName: 'EPR',
    dateOfBirth: '1985-01-01', privateEmail: 'ama@example.org', phone1: '+251', signature: 'sig.png', sapNo: '123',
  };

  it('should give the whole record to a users:read holder', async () => {
    cbpService.fetchAllStaff.mockResolvedValueOnce([RECORD]);
    const res = await request(app).get('/api/staff');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ dateOfBirth: '1985-01-01', privateEmail: 'ama@example.org' });
  });

  it('should give only the directory fields to everyone else', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    cbpService.fetchAllStaff.mockResolvedValueOnce([RECORD]);
    const res = await request(app).get('/api/staff');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ staffId: 'S1', firstName: 'Ama', workEmail: 'ama@africacdc.org', divisionName: 'EPR' });
    for (const hidden of ['dateOfBirth', 'privateEmail', 'phone1', 'signature', 'sapNo']) {
      expect(res.body.data[0]).not.toHaveProperty(hidden);
    }
  });

  it('should hide the HR fields of a single record too', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    cbpService.getStaffByStaffId.mockResolvedValueOnce(RECORD);
    const res = await request(app).get('/api/staff/S1');
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('dateOfBirth');
    expect(res.body.data.lastName).toBe('Diallo');
  });
});
