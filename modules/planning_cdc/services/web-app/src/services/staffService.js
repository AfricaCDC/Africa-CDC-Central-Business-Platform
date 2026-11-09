import api from './api';

const unwrap = (p) => p.then((r) => r.data);

/**
 * API client for staff directory, divisions and duty stations.
 *
 * @example
 * const staff = await staffService.search('jane');
 */
export const staffService = {
  // Staff
  getAll: (params) => unwrap(api.get('/staff', { params })),
  getById: (staffId) => unwrap(api.get(`/staff/${staffId}`)),
  search: (query) => unwrap(api.get('/staff', { params: { search: query } })),

  // CBP import (admin). Resolves to the run summary.
  importCbpUsers: () => unwrap(api.post('/admin/import-cbp-users', {})),
};
