import api from './api';

const unwrap = (p) => p.then((r) => r.data);

/**
 * API client for the admin module — roles, reference data, RBAC, periods and settings.
 *
 * @example
 * const roles = await adminService.getRoles();
 */
export const adminService = {
  // Roles
  getRoles: () => unwrap(api.get('/admin/roles')),
  removeRole: (userId, roleId) => unwrap(api.delete(`/admin/users/${userId}/roles/${roleId}`)),

  // Reference Data
  getBusinessUnits: () => unwrap(api.get('/admin/business-units')),
  getTiers: () => unwrap(api.get('/admin/tiers')),

  // RBAC Matrix
  getRbacMatrix: () => unwrap(api.get('/admin/rbac/matrix')),
  updateRbacPermission: (data) => unwrap(api.put('/admin/rbac/permission', data)),
  deleteRbacPermission: (data) => unwrap(api.delete('/admin/rbac/permission', { data })),
  updateRolePermissions: (roleId, permissions) =>
    unwrap(api.put(`/admin/roles/${roleId}/permissions`, { permissions })),

  // Reporting Periods
  getReportingPeriods: () => unwrap(api.get('/reporting/periods')),
  createReportingPeriod: (data) => unwrap(api.post('/reporting/periods', data)),
  updateReportingPeriod: (id, data) => unwrap(api.put(`/reporting/periods/${id}`, data)),

  // App Settings (D-20260707-01)
  getAppSettings: (prefix) => unwrap(api.get('/admin/settings', { params: prefix ? { prefix } : {} })),
  updateAppSettings: (settings) => unwrap(api.put('/admin/settings', { settings })),
};
