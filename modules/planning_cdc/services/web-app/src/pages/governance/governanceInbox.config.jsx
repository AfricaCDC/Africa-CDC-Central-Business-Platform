import { APPROVAL_ENTITIES, STATUSES } from '@rbm/lib/enums';
import {
  Clock, CheckCircle2, AlertCircle, MessageSquare, XCircle,
} from 'lucide-react';

/**
 * Relative "time ago" label for a date string.
 *
 * @param {string} dateStr
 * @returns {string}
 */
export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/** Route per approval entity (keyed by APPROVAL_ENTITIES — single source). */
const ENTITY_ROUTES = {
  [APPROVAL_ENTITIES.ACTIVITY_REPORT]: () => '/review-submissions?tab=activities',
  [APPROVAL_ENTITIES.INDICATOR_DIVISION_REPORT]: () => '/review-submissions?tab=reports',
  [APPROVAL_ENTITIES.PLAN_NODE]: (id) => `/plan/node/${id}`,
};

/**
 * Build the navigation URL for an approval entity.
 *
 * @param {string} entityType - one of APPROVAL_ENTITIES
 * @param {number|string} entityId
 * @returns {string|null}
 * @example getEntityUrl(APPROVAL_ENTITIES.PLAN_NODE, 4) // '/plan/node/4'
 */
export function getEntityUrl(entityType, entityId) {
  const build = ENTITY_ROUTES[entityType];
  return build ? build(entityId) : null;
}

/**
 * Title-case a governance entity-type code into a display label
 * (e.g. `STRATEGIC_PLAN` → `Strategic Plan`). Derived from the code so there
 * are no hardcoded label strings to drift from the enum.
 *
 * @param {string} type - an ENTITY_TYPES value
 * @returns {string}
 */
export function formatEntityType(type) {
  if (!type) return '';
  return String(type)
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

// Notification-type → icon/colour. A Map (not an object literal) so it is not
// taken for a status→style map: these keys are notification_type values. The
// two that share the status vocabulary reuse STATUSES (single source).
const NOTIF_ICON_ENTRIES = [
  ['APPROVAL_REQUIRED', { icon: Clock, color: 'text-amber-500' }],
  [STATUSES.APPROVED, { icon: CheckCircle2, color: 'text-emerald-500' }],
  [STATUSES.REJECTED, { icon: XCircle, color: 'text-red-500' }],
  ['CHANGES_REQUESTED', { icon: MessageSquare, color: 'text-orange-500' }],
  ['STATUS_CHANGE', { icon: AlertCircle, color: 'text-blue-500' }],
];
const NOTIF_ICONS = new Map(NOTIF_ICON_ENTRIES);

/**
 * Resolve the icon config for a notification type (defaults to STATUS_CHANGE).
 *
 * @param {string} notificationType
 * @returns {{ icon: Function, color: string }}
 */
export function getNotifIcon(notificationType) {
  return NOTIF_ICONS.get(notificationType) || NOTIF_ICONS.get('STATUS_CHANGE');
}
