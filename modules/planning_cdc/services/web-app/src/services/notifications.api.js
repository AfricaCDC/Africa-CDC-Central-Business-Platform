// ── Notifications Admin API service ──
// All URLs for the Notification Wizard admin UI live here. Components and
// hooks never call axios directly (CHARTER §8). Paths target
// `/api/admin/notifications/*` per spec §6.2 (D-20260417-01).

import httpClient from './api';

const BASE = '/admin/notifications';

export const notificationsApi = {
  /**
   * List the catalog of notification events (active only).
   *
   * @returns {Promise<{data: {success: true, data: Array}}>}
   * @example const { data } = await notificationsApi.listEvents();
   */
  listEvents: () => httpClient.get(`${BASE}/events`),

  /**
   * List recent outbox rows (emails queued / sent / failed).
   * @param {{ status?: string, recipient?: string, event_key?: string, limit?: number }} [filters]
   */
  listOutbox: (filters = {}) => httpClient.get(`${BASE}/outbox`, { params: filters }),

  /** Render the HTML body stored/derived for a single outbox row. */
  previewOutbox: (id) => httpClient.get(`${BASE}/outbox/${id}/preview`),

  /**
   * List registered notification templates (active only).
   *
   * @returns {Promise<{data: {success: true, data: Array}}>}
   */
  listTemplates: () => httpClient.get(`${BASE}/templates`),

  /**
   * List recipient resolver scope codes the form dropdown can bind to.
   *
   * @returns {Promise<{data: {success: true, data: Array<{code: string}>}}>}
   */
  listResolvers: () => httpClient.get(`${BASE}/resolvers`),

  /**
   * List subscriptions joined with event + template metadata.
   *
   * @param {object} [params]
   * @param {string} [params.event_key] — narrow to one event
   * @param {boolean} [params.is_active]
   * @returns {Promise<{data: {success: true, data: Array}}>}
   */
  listSubscriptions: (params) => httpClient.get(`${BASE}/subscriptions`, { params }),

  /**
   * Fetch a single subscription with joins.
   *
   * @param {string|number} id
   * @returns {Promise<{data: {success: true, data: object}}>}
   */
  getSubscription: (id) => httpClient.get(`${BASE}/subscriptions/${id}`),

  /**
   * Create a subscription. See spec §6.2 for the body schema.
   *
   * @param {object} payload
   * @returns {Promise<{data: {success: true, data: object}}>}
   */
  createSubscription: (payload) => httpClient.post(`${BASE}/subscriptions`, payload),

  /**
   * Partial update.
   *
   * @param {string|number} id
   * @param {object} payload
   * @returns {Promise<{data: {success: true, data: object}}>}
   */
  updateSubscription: (id, payload) => httpClient.put(`${BASE}/subscriptions/${id}`, payload),

  /**
   * Flip is_active on a subscription.
   *
   * @param {string|number} id
   * @param {boolean} isActive
   * @returns {Promise<{data: {success: true, data: object}}>}
   */
  toggleSubscription: (id, isActive) =>
    httpClient.patch(`${BASE}/subscriptions/${id}/toggle`, { is_active: isActive }),

  /**
   * Delete a subscription.
   *
   * @param {string|number} id
   * @returns {Promise<{data: {success: true, data: {id, deleted}}}>}
   */
  deleteSubscription: (id) => httpClient.delete(`${BASE}/subscriptions/${id}`),

  /**
   * Fire `emitEvent` synchronously and return the dispatch counts.
   *
   * @param {{ event_key: string, entity?: object, metadata?: object }} payload
   * @returns {Promise<{data: {success: true, data: {event_key, matched, recipients, outboxRows}}}>}
   */
  testSend: (payload) => httpClient.post(`${BASE}/test-send`, payload),
};
