// ── Admin staff-account client ──
//
// Thin wrapper around /api/admin/users and its role sub-resource. Used by the
// create / edit / duplicate user modal. Methods return the raw axios response
// so callers can read status and body.

import api from './api';

export const adminUsersApi = {
  create:     (payload)         => api.post('/admin/users', payload),
  update:     (id, payload)     => api.put(`/admin/users/${id}`, payload),
  addRole:    (userId, roleId)  => api.post(`/admin/users/${userId}/roles`, { role_id: roleId }),
  removeRole: (userId, roleId)  => api.delete(`/admin/users/${userId}/roles/${roleId}`),
};
