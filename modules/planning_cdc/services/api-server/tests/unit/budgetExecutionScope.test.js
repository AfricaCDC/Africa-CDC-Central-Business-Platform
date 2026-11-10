// ── Budget execution — business units a user may see (D-20261015-04) ──
//
// Other business units are visible to scope `all` (admins, M&E) and to the
// finance unit only. DB-backed helpers are mocked: no real connection.

jest.mock('../../src/services/divisionAliasService', () => ({
  getUserDivisionScope: jest.fn(),
  getDirectoratesForUser: jest.fn().mockResolvedValue([]),
  getDirectorateChildren: jest.fn(),
}));
jest.mock('../../src/services/budgetExecution/budgetImportReminder', () => ({
  financeDivision: jest.fn().mockResolvedValue('FMG'),
}));

const { RBAC_SCOPES } = require('@rbm/lib/rbac');
const aliases = require('../../src/services/divisionAliasService');
const { allowedDivisions } = require('../../src/services/budgetExecution/budgetExecutionScope');

beforeEach(() => {
  aliases.getDirectorateChildren.mockImplementation(async (code) => (code === 'FMG' ? ['FMG', 'ACCOUNTS'] : []));
});

describe('allowedDivisions', () => {
  it('should see every business unit at scope all', async () => {
    expect(await allowedDivisions({ id: 1 }, RBAC_SCOPES.ALL)).toBeNull();
    expect(aliases.getUserDivisionScope).not.toHaveBeenCalled();
  });

  it('should see every business unit as a member of the finance unit or one under it', async () => {
    aliases.getUserDivisionScope.mockResolvedValue(new Set(['ACCOUNTS']));
    expect(await allowedDivisions({ id: 2 }, RBAC_SCOPES.DIVISION)).toBeNull();
  });

  it('should see only its own business units otherwise', async () => {
    aliases.getUserDivisionScope.mockResolvedValue(new Set(['EPR']));
    expect(await allowedDivisions({ id: 3 }, RBAC_SCOPES.DIVISION)).toEqual(['EPR']);
  });

  it('should see nothing outside a business unit', async () => {
    aliases.getUserDivisionScope.mockResolvedValue(new Set());
    expect(await allowedDivisions({ id: 4 }, RBAC_SCOPES.DIVISION)).toEqual([]);
  });
});
