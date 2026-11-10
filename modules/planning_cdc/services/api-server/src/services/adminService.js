// ── Admin Service · Facade ──
//
// Legacy 949-line adminService has been decomposed into focused
// sub-modules under `./admin/` (task #28: D-20260418-17 users, -18 roles,
// -19 refdata, -20 hierarchy; codegen removed by D-20261106-14). This file
// is a pure aggregator — no inline logic, no pragmas, no P-31 allowlist
// entries.
//
// Existing callers `require('../services/adminService')` continue to
// resolve the named exports through the spread below:
//   · Users    (4): getUsers, getUserById, createUser, updateUser
//   · Roles    (6): getRoles, getRoleById, getUserRoles, assignRole,
//                   removeRole, updateRolePermissions
//   · Ref data (7): getBusinessUnits, getBusinessUnitById, getTiers,
//                   getStrategicPlan, getDivisionCodes, getPartners,
//                   getMemberStates
//   · Hierarchy (6): getDivisionTree, getDivisionByCode,
//                    getDivisionDetail, updateDivision, createDivision,
//                    deleteDivision

module.exports = {
  ...require('./admin/users'),
  ...require('./admin/roles'),
  ...require('./admin/refdata'),
  ...require('./admin/hierarchy'),
};
