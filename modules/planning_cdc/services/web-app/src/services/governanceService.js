import api from './api';

const unwrap = (p) => p.then((r) => r.data);

/**
 * API client for governance: approvals, audit log, inbox, drafts,
 * notifications and entity snapshots.
 *
 * @example
 * const inbox = await governanceService.getInbox();
 */
export const governanceService = {
  decide: (stepId, data) => unwrap(api.put(`/governance/steps/${stepId}/decide`, data)),

  // Audit
  getAuditLog: (params) => unwrap(api.get('/governance/audit', { params })),

  // Inbox & Drafts
  getInbox: () => unwrap(api.get('/governance/inbox')),
  getMyDrafts: () => unwrap(api.get('/governance/my-drafts')),

  // Notifications
  getNotifications: (params) => unwrap(api.get('/governance/notifications', { params })),
  markNotificationRead: (id) => unwrap(api.put(`/governance/notifications/${id}/read`)),
  markAllNotificationsRead: () => unwrap(api.put('/governance/notifications/read-all')),
};
