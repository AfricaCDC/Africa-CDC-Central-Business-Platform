// ── reportPermissions unit tests (D-20260415-11) ──
//
// Verifies the union-of-focal-divisions rule for edit/submit gates on
// indicator, activity and quarterly reports. No real DB — we stub
// rbacService.checkPermission and @rbm/lib/user-divisions.getUserDivisionCodes.

jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn(),
}));

jest.mock('@rbm/lib/user-divisions', () => ({
  getUserDivisionCodes: jest.fn(),
  DIVISION_ROLE_FOCAL: 'FOCAL',
}));

// Program a shared knex mock so the by-id helpers can resolve rows.
const knexMock = global.__makeKnexMock();
jest.mock('../../src/config/db', () => knexMock);

const rbacService = require('../../src/services/rbacService');
const userDivisions = require('@rbm/lib/user-divisions');
const {
  canEditReport,
  parseContributingDivisions,
  ROLE_MAIN,
  ROLE_CONTRIB,
  ROLE_ADMIN,
} = require('../../src/services/reportPermissions');

beforeEach(() => {
  rbacService.checkPermission.mockReset();
  userDivisions.getUserDivisionCodes.mockReset();
  // Default: no admin bypass.
  rbacService.checkPermission.mockResolvedValue({ allowed: false, scope: null });
});

describe('parseContributingDivisions', () => {
  it('returns [] on null/undefined/empty', () => {
    expect(parseContributingDivisions(null)).toEqual([]);
    expect(parseContributingDivisions(undefined)).toEqual([]);
    expect(parseContributingDivisions('')).toEqual([]);
  });

  it('parses a JSON string array', () => {
    expect(parseContributingDivisions('["SRH","DSI"]')).toEqual(['SRH', 'DSI']);
  });

  it('accepts a pre-parsed array, uppercasing and trimming', () => {
    expect(parseContributingDivisions(['srh ', ' dsi'])).toEqual(['SRH', 'DSI']);
  });

  it('returns [] on malformed JSON', () => {
    expect(parseContributingDivisions('not json')).toEqual([]);
  });
});

describe('canEditReport — D-20260415-11', () => {
  it('denies when userId is missing', async () => {
    const res = await canEditReport({ userId: null, mainDivisionCode: 'SRH' });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('NOT_AUTHENTICATED');
  });

  it('grants ADMIN bypass when reports.approve scope = all', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
    const res = await canEditReport({ userId: 42, mainDivisionCode: 'SRH' });
    expect(res.allowed).toBe(true);
    expect(res.role).toBe(ROLE_ADMIN);
    // Admin short-circuits — no user-divisions lookup.
    expect(userDivisions.getUserDivisionCodes).not.toHaveBeenCalled();
  });

  it('SCENARIO 1 — focal(A,B), active=A, MAIN=B → 200 (role=MAIN)', async () => {
    userDivisions.getUserDivisionCodes.mockResolvedValue(['SRH', 'DSI']);
    const res = await canEditReport({
      userId: 10,
      mainDivisionCode: 'DSI',
      contributingDivisions: null,
    });
    expect(res.allowed).toBe(true);
    expect(res.role).toBe(ROLE_MAIN);
  });

  it('SCENARIO 2 — focal(A,B), active=A, MAIN=C, contrib=[A] → CONTRIB path', async () => {
    userDivisions.getUserDivisionCodes.mockResolvedValue(['SRH', 'DSI']);
    const res = await canEditReport({
      userId: 10,
      mainDivisionCode: 'WHC',
      contributingDivisions: ['SRH'],
    });
    expect(res.allowed).toBe(true);
    expect(res.role).toBe(ROLE_CONTRIB);
  });

  it('SCENARIO 3 — focal(A), MAIN=B → 403', async () => {
    userDivisions.getUserDivisionCodes.mockResolvedValue(['SRH']);
    const res = await canEditReport({
      userId: 10,
      mainDivisionCode: 'DSI',
      contributingDivisions: null,
    });
    expect(res.allowed).toBe(false);
    expect(res.role).toBe(null);
    expect(res.reason).toBe('NOT_IN_MAIN_OR_CONTRIB');
  });

  it('SCENARIO 4 — admin bypass intact regardless of divisions', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
    userDivisions.getUserDivisionCodes.mockResolvedValue([]);
    const res = await canEditReport({
      userId: 1,
      mainDivisionCode: 'ANY',
      contributingDivisions: ['OTHER'],
    });
    expect(res.allowed).toBe(true);
    expect(res.role).toBe(ROLE_ADMIN);
  });

  it('is case-insensitive on MAIN vs focal set', async () => {
    userDivisions.getUserDivisionCodes.mockResolvedValue(['srh']);
    const res = await canEditReport({
      userId: 10,
      mainDivisionCode: 'SRH',
      contributingDivisions: null,
    });
    expect(res.allowed).toBe(true);
    expect(res.role).toBe(ROLE_MAIN);
  });

  it('prefers MAIN over CONTRIB when both match', async () => {
    userDivisions.getUserDivisionCodes.mockResolvedValue(['SRH']);
    const res = await canEditReport({
      userId: 10,
      mainDivisionCode: 'SRH',
      contributingDivisions: ['SRH'],
    });
    expect(res.role).toBe(ROLE_MAIN);
  });

  it('accepts a JSON-string contrib column', async () => {
    userDivisions.getUserDivisionCodes.mockResolvedValue(['SRH']);
    const res = await canEditReport({
      userId: 10,
      mainDivisionCode: 'DSI',
      contributingDivisions: '["SRH","WHC"]',
    });
    expect(res.allowed).toBe(true);
    expect(res.role).toBe(ROLE_CONTRIB);
  });

  it('denies when focal set is empty and no contrib intersection', async () => {
    userDivisions.getUserDivisionCodes.mockResolvedValue([]);
    const res = await canEditReport({
      userId: 10,
      mainDivisionCode: 'DSI',
      contributingDivisions: ['OTHER'],
    });
    expect(res.allowed).toBe(false);
  });

  it('never consults req.user.division_code — only the injected union', async () => {
    userDivisions.getUserDivisionCodes.mockResolvedValue(['SRH']);
    // Even if the caller naively passed an "active" division, the helper
    // only cares about the injected MAIN + the resolved focal set.
    const res = await canEditReport({
      userId: 10,
      mainDivisionCode: 'SRH',
    });
    expect(res.allowed).toBe(true);
    expect(userDivisions.getUserDivisionCodes).toHaveBeenCalledWith(
      expect.anything(),
      10,
      expect.objectContaining({ roles: ['FOCAL'] }),
    );
  });
});
