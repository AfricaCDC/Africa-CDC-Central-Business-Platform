// ── Division team API (HOD-managed reporting members) ──
//
// Thin wrapper over the caller-scoped /api/me/divisions/:code/members
// endpoints. A Head of Division adds/removes staff as user_divisions
// MEMBER so they can report on the division's activities.

import api from '@/services/api';

export const divisionTeamApi = {
  /** List the division's members. @returns {Promise<Array<{id,first_name,last_name,email,role}>>} */
  list: (code) => api
    .get(`/me/divisions/${encodeURIComponent(code)}/members`)
    .then((r) => (Array.isArray(r.data) ? r.data : (r.data?.data || []))),

  /** Enrol a staff user as a MEMBER of the division (idempotent). */
  add: (code, userId) => api
    .post(`/me/divisions/${encodeURIComponent(code)}/members`, { user_id: userId }),

  /** Remove a user's MEMBER row from the division. */
  remove: (code, userId) => api
    .delete(`/me/divisions/${encodeURIComponent(code)}/members`, { data: { user_id: userId } }),
};
