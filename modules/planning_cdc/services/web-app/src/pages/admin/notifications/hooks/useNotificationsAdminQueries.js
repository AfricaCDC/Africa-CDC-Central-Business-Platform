/**
 * useNotificationsAdminQueries — React Query hooks for the Notification Wizard
 * admin UI. Components only consume these hooks; no direct axios calls.
 *
 * Spec: docs/specs/notification-wizard.md §6.3 — Decision: D-20260417-01
 */

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { notificationsApi } from '../../../../services/notifications.api';

const KEYS = {
  events:        ['notifications', 'events'],
  templates:     ['notifications', 'templates'],
  resolvers:     ['notifications', 'resolvers'],
  subscriptions: (params) => ['notifications', 'subscriptions', params || {}],
  subscription:  (id) => ['notifications', 'subscription', String(id)],
};

const STALE_REFERENCE = 60 * 60 * 1000; // 1h — catalog is rarely changed
const STALE_LIST = 2 * 60 * 1000;       // 2 min

const unwrap = (r) => (r?.data?.data ?? r?.data);

/** @returns {import('@tanstack/react-query').UseQueryResult} */
export function useNotificationEvents() {
  return useQuery({
    queryKey: KEYS.events,
    queryFn: () => notificationsApi.listEvents().then(unwrap),
    staleTime: STALE_REFERENCE,
  });
}

/** @returns {import('@tanstack/react-query').UseQueryResult} */
export function useNotificationTemplates() {
  return useQuery({
    queryKey: KEYS.templates,
    queryFn: () => notificationsApi.listTemplates().then(unwrap),
    staleTime: STALE_REFERENCE,
  });
}

/** @returns {import('@tanstack/react-query').UseQueryResult} */
export function useNotificationResolvers() {
  return useQuery({
    queryKey: KEYS.resolvers,
    queryFn: () => notificationsApi.listResolvers().then(unwrap),
    staleTime: STALE_REFERENCE,
  });
}

/**
 * @param {object} [params] forwarded as query string
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export function useNotificationSubscriptions(params) {
  return useQuery({
    queryKey: KEYS.subscriptions(params),
    queryFn: () => notificationsApi.listSubscriptions(params).then(unwrap),
    placeholderData: keepPreviousData,
    staleTime: STALE_LIST,
  });
}

/**
 * @param {string|number} id
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export function useNotificationSubscription(id) {
  return useQuery({
    queryKey: KEYS.subscription(id),
    queryFn: () => notificationsApi.getSubscription(id).then(unwrap),
    enabled: Boolean(id),
    staleTime: STALE_LIST,
  });
}

const SUBS_KEY = ['notifications', 'subscriptions'];

/** @returns {import('@tanstack/react-query').UseMutationResult} */
export function useCreateSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => notificationsApi.createSubscription(payload).then(unwrap),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUBS_KEY });
    },
  });
}

/** @returns {import('@tanstack/react-query').UseMutationResult} */
export function useUpdateSubscription(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => notificationsApi.updateSubscription(id, payload).then(unwrap),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUBS_KEY });
      qc.invalidateQueries({ queryKey: KEYS.subscription(id) });
    },
  });
}

/** @returns {import('@tanstack/react-query').UseMutationResult} */
export function useToggleSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }) =>
      notificationsApi.toggleSubscription(id, isActive).then(unwrap),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: SUBS_KEY });
      qc.invalidateQueries({ queryKey: KEYS.subscription(vars.id) });
    },
  });
}

/** @returns {import('@tanstack/react-query').UseMutationResult} */
export function useDeleteSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => notificationsApi.deleteSubscription(id).then(unwrap),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUBS_KEY });
    },
  });
}

/**
 * Send a synthetic event through the wizard. Returns dispatch counts.
 * Not cached — every call hits the backend, no list to invalidate.
 *
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useTestSend() {
  // eslint-disable-next-line cdc-rbm/require-invalidate-queries -- read-only test send, no cached list to refresh
  return useMutation({
    mutationFn: (payload) => notificationsApi.testSend(payload).then(unwrap),
  });
}
