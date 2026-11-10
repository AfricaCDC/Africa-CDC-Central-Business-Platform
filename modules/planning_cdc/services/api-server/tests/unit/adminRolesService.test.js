// ── admin/roles service unit tests ──
//
// Covers: getRoles, getRoleById, getUserRoles, assignRole, removeRole, updateRolePermissions

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

// Mock adminService lazy-require inside assignRole
jest.mock('../../src/services/adminService', () => ({
  updateDivision: jest.fn().mockResolvedValue(1),
}));
jest.mock('../../src/services/rbacService', () => ({ invalidateUserPermissions: jest.fn() }));
const { invalidateUserPermissions } = require('../../src/services/rbacService');

const svc = require('../../src/services/admin/roles');
const { updateDivision } = require('../../src/services/adminService');
const chain = sharedDb.__chain;

function resetChain() {
  chain.first.mockReset().mockResolvedValue(undefined);
  chain.insert.mockReset().mockResolvedValue([1]);
  chain.update.mockReset().mockResolvedValue(1);
  chain.del.mockReset().mockResolvedValue(1);
  chain.delete.mockReset().mockResolvedValue(1);
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  ['select', 'where', 'whereIn', 'orderBy', 'join'].forEach((m) => {
    if (chain[m]) chain[m].mockClear().mockReturnValue(chain);
  });
}

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
});

// ── getRoles ──────────────────────────────────────────────────────────────────
describe('getRoles()', () => {
  it('should return all roles ordered by id', async () => {
    const roles = [{ id: 1, code: 'SYSTEM_ADMIN' }, { id: 2, code: 'FOCAL_PERSON' }];
    chain.then.mockImplementationOnce((r) => Promise.resolve(roles).then(r));
    const result = await svc.getRoles();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── getRoleById ───────────────────────────────────────────────────────────────
describe('getRoleById()', () => {
  it('should return the role when found', async () => {
    const role = { id: 3, code: 'M_AND_E_OFFICER' };
    chain.first.mockResolvedValueOnce(role);
    const result = await svc.getRoleById(3);
    expect(result).toEqual(role);
  });

  it('should return undefined when role not found', async () => {
    chain.first.mockResolvedValueOnce(undefined);
    const result = await svc.getRoleById(999);
    expect(result).toBeUndefined();
  });
});

// ── getUserRoles ──────────────────────────────────────────────────────────────
describe('getUserRoles()', () => {
  it('should return roles for a user', async () => {
    const roles = [{ id: 2, code: 'FOCAL_PERSON' }];
    chain.then.mockImplementationOnce((r) => Promise.resolve(roles).then(r));
    const result = await svc.getUserRoles(7);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should return empty array when user has no roles', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    const result = await svc.getUserRoles(999);
    expect(result).toEqual([]);
  });
});

// ── removeRole ────────────────────────────────────────────────────────────────
describe('removeRole()', () => {
  it('should delete the user_role row', async () => {
    chain.del.mockResolvedValueOnce(1);
    const result = await svc.removeRole(7, 3);
    expect(result).toBe(1);
  });

  it('should drop the cached permissions of the user (D-20261108-02)', async () => {
    await svc.removeRole('7', 3);
    expect(invalidateUserPermissions).toHaveBeenCalledWith(7);
  });
});

describe('assignRole() permission cache', () => {
  it('should drop the cached permissions of the user (D-20261108-02)', async () => {
    await svc.assignRole('7', 3);
    expect(invalidateUserPermissions).toHaveBeenCalledWith(7);
  });
});

// ── updateRolePermissions ─────────────────────────────────────────────────────
describe('updateRolePermissions()', () => {
  it('should update the role permissions JSON', async () => {
    chain.update.mockResolvedValueOnce(1);
    const result = await svc.updateRolePermissions(3, { workplans: ['read', 'write'] });
    expect(result).toBe(1);
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: JSON.stringify({ workplans: ['read', 'write'] }) }),
    );
  });
});

// ── assignRole ────────────────────────────────────────────────────────────────
describe('assignRole()', () => {
  it('should not re-insert if role already exists', async () => {
    chain.first
      .mockResolvedValueOnce({ id: 1 })          // exists check
      .mockResolvedValueOnce({ id: 3, code: 'FOCAL_PERSON' }) // role
      .mockResolvedValueOnce({ id: 7, division_code: 'DCM' }) // user
      .mockResolvedValueOnce({ code: 'DCM', focal_user_id: 99 }); // division (slot taken)
    const result = await svc.assignRole(7, 3);
    expect(result).toBeUndefined();
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('should insert a new user_role when none exists', async () => {
    chain.first
      .mockResolvedValueOnce(undefined)           // not exists
      .mockResolvedValueOnce({ id: 3, code: 'ME_OFFICER' }) // role
      .mockResolvedValueOnce({ id: 7, division_code: 'DCM' }) // user
      .mockResolvedValueOnce({ code: 'DCM', m_and_e_user_id: null }); // division (slot vacant)
    chain.insert.mockResolvedValueOnce([1]);
    await svc.assignRole(7, 3);
    expect(chain.insert).toHaveBeenCalled();
    expect(updateDivision).toHaveBeenCalledWith('DCM', { m_and_e_user_id: 7 });
  });

  it('should auto-promote HOD when division slot is vacant', async () => {
    chain.first
      .mockResolvedValueOnce(undefined)                         // not exists
      .mockResolvedValueOnce({ id: 2, code: 'HEAD_OF_DIVISION' }) // role
      .mockResolvedValueOnce({ id: 7, division_code: 'WHC' })   // user
      .mockResolvedValueOnce({ code: 'WHC', responsible_user_id: null }); // slot vacant
    chain.insert.mockResolvedValueOnce([1]);
    await svc.assignRole(7, 2);
    expect(updateDivision).toHaveBeenCalledWith('WHC', { responsible_user_id: 7 });
  });

  it('should not promote if role not found', async () => {
    chain.first
      .mockResolvedValueOnce(undefined)  // not exists
      .mockResolvedValueOnce(undefined); // role not found
    chain.insert.mockResolvedValueOnce([1]);
    await svc.assignRole(7, 999);
    expect(updateDivision).not.toHaveBeenCalled();
  });

  it('should not promote if user has no division_code', async () => {
    chain.first
      .mockResolvedValueOnce(undefined)                         // not exists
      .mockResolvedValueOnce({ id: 2, code: 'HEAD_OF_DIVISION' }) // role
      .mockResolvedValueOnce({ id: 7, division_code: null });   // user no division
    chain.insert.mockResolvedValueOnce([1]);
    await svc.assignRole(7, 2);
    expect(updateDivision).not.toHaveBeenCalled();
  });

  it('should not promote if division not found', async () => {
    chain.first
      .mockResolvedValueOnce(undefined)                         // not exists
      .mockResolvedValueOnce({ id: 2, code: 'FOCAL_PERSON' })  // role
      .mockResolvedValueOnce({ id: 7, division_code: 'GHOST' }) // user
      .mockResolvedValueOnce(undefined);                        // division not found
    chain.insert.mockResolvedValueOnce([1]);
    await svc.assignRole(7, 2);
    expect(updateDivision).not.toHaveBeenCalled();
  });

  it('should not update division if no matching patch fields', async () => {
    chain.first
      .mockResolvedValueOnce(undefined)                       // not exists
      .mockResolvedValueOnce({ id: 5, code: 'SYSTEM_ADMIN' }) // role (no slot mapping)
      .mockResolvedValueOnce({ id: 7, division_code: 'DCM' }) // user
      .mockResolvedValueOnce({ code: 'DCM', responsible_user_id: 1 }); // division
    chain.insert.mockResolvedValueOnce([1]);
    await svc.assignRole(7, 5);
    expect(updateDivision).not.toHaveBeenCalled();
  });

  it('should not promote FOCAL_PERSON when slot is already taken', async () => {
    chain.first
      .mockResolvedValueOnce(undefined)                        // not exists
      .mockResolvedValueOnce({ id: 3, code: 'FOCAL_PERSON' }) // role
      .mockResolvedValueOnce({ id: 7, division_code: 'DCM' }) // user
      .mockResolvedValueOnce({ code: 'DCM', focal_user_id: 5 }); // slot taken
    chain.insert.mockResolvedValueOnce([1]);
    await svc.assignRole(7, 3);
    expect(updateDivision).not.toHaveBeenCalled();
  });
});
