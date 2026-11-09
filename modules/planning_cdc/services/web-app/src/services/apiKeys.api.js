// ── Admin API Keys client ──
//
// Thin wrapper around /api/admin/api-keys. The raw secret is returned
// **once** in the POST response — callers must persist / copy it
// immediately as the server cannot recover it later.

import api from './api';

export const apiKeysApi = {
  list:   ()           => api.get('/admin/api-keys').then((r) => r.data),
  create: (body)       => api.post('/admin/api-keys', body).then((r) => r.data),
  update: (id, body)   => api.patch(`/admin/api-keys/${id}`, body).then((r) => r.data),
  revoke: (id)         => api.delete(`/admin/api-keys/${id}`).then((r) => r.data),
};
