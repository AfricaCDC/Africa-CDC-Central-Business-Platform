/**
 * @rbm/lib/events — Notification wizard constants (D-20260417-01).
 *
 * Pure data module — re-exported as-is from `.mjs`. No runtime dependencies.
 * The actual `emitEvent` + resolver registry lives in
 *   services/api-server/src/services/eventBusService.js
 * because it requires a DB (knex) connection.
 *
 * Consuming call sites do:
 *   const { EVENT_ACTIONS, buildEventKey } = require('@rbm/lib/events');
 *   const { emitEvent } = require('../services/eventBusService');
 *
 * Spec: docs/specs/notification-wizard.md §6.1
 */

const { ENTITY_TYPES } = require('./enums');

/**
 * The 12 canonical verbs an event key can end in. Keep in sync with the
 * catalog in `services/api-server/src/db/seeds/04_notification_events.js`.
 * Adding a verb here also requires a new entry in the seed.
 */
// eslint-disable-next-line cdc-rbm/no-inline-status-map -- event-action verbs, not status values; keys intentionally reuse workflow vocabulary
const EVENT_ACTIONS = Object.freeze({
  CREATED:                'created',
  UPDATED:                'updated',
  DELETED:                'deleted',
  SUBMITTED:              'submitted',
  APPROVED:               'approved',
  REJECTED:               'rejected',
  CANCELLED:              'cancelled',
  EDITED:                 'edited',
  STATUS_CHANGED:         'status_changed',
  ASSIGNED:               'assigned',
  UNASSIGNED:             'unassigned',
  DEADLINE_APPROACHING:   'deadline_approaching',
});

const CHANNELS = Object.freeze({
  EMAIL:  'email',
  IN_APP: 'in_app',
  BOTH:   'both',
});

/**
 * Recipient-scope resolver names. The admin UI dropdown renders this list;
 * the resolver registry in eventBusService must implement each one
 * (parametric scopes like `role_all:ROLE_CODE` are prefix-matched).
 */
const RECIPIENT_SCOPES = Object.freeze({
  ACTOR:                       'actor',
  ACTOR_DIVISION_HOD:          'actor_division_hod',
  ACTOR_DIRECTORATE_DIRECTOR:  'actor_directorate_director',
  ENTITY_RESPONSIBLE:          'entity_responsible',
  ENTITY_DIVISION_HOD:         'entity_division_hod',
  ENTITY_MAIN_HOD:             'entity_main_hod',
  ENTITY_CONTRIB_HODS:         'entity_contrib_hods',
  ENTITY_OWNER:                'entity_owner',
  ENTITY_PREVIOUS_OWNER:       'entity_previous_owner', // e.g. the preparer a report was taken from
  ROLE_ALL:                    'role_all',          // prefix — use with buildRoleAll()
  ROLE_ALL_ACTIVE:             'role_all_active',   // prefix
  FOCAL_OF_MAIN:               'focal_of_main',
  ENTITY_DIVISION_ME_OFFICER:  'entity_division_me_officer',
});

/**
 * Convert an `ENTITY_TYPES` enum value to the lowercase snake_case form
 * used in event keys. Inverse of the schema's `entity_type` column.
 *
 * @param {string} entityType - e.g. 'PLAN_NODE'
 * @returns {string} e.g. 'plan_node'
 * @throws {Error} if entityType is not a known ENTITY_TYPES value.
 *
 * @example
 *   toEntityType(ENTITY_TYPES.PLAN_NODE) // => 'plan_node'
 */
function toEntityType(entityType) {
  const known = new Set(Object.values(ENTITY_TYPES));
  const normalized = String(entityType || '').trim();
  if (!normalized) throw new Error('toEntityType: entityType is required');
  // Already lowercase? accept if upper-case round-trips match an ENTITY_TYPES value.
  const upper = normalized.toUpperCase();
  if (!known.has(upper)) {
    // Non-ENTITY_TYPES value — the catalog extends with additional entity
    // types not yet in the shared enum (AMERT_*, ACTIVITY_REPORT, ...).
    // Return a safe lowercase form; the seed enforces the authoritative list.
    return normalized.toLowerCase();
  }
  return upper.toLowerCase();
}

/**
 * Build the `<entity_type>.<action>` event key used by `emitEvent`.
 * Validates action against EVENT_ACTIONS but accepts extended actions
 * for domains like `contrib_submitted` — those must exist in the seed.
 *
 * @param {string} entityType - any ENTITY_TYPES value or extended catalog type
 * @param {string} action - a value from EVENT_ACTIONS or an extended action
 * @returns {string} fully-qualified event key, e.g. 'plan_node.submitted'
 * @throws {Error} when either argument is missing or malformed.
 *
 * @example
 *   buildEventKey(ENTITY_TYPES.PLAN_NODE, EVENT_ACTIONS.SUBMITTED)
 *   // => 'plan_node.submitted'
 */
function buildEventKey(entityType, action) {
  if (!action) throw new Error('buildEventKey: action is required');
  const normalizedAction = String(action).trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]*$/.test(normalizedAction)) {
    throw new Error(`buildEventKey: invalid action "${action}"`);
  }
  return `${toEntityType(entityType)}.${normalizedAction}`;
}

module.exports = {
  EVENT_ACTIONS,
  CHANNELS,
  RECIPIENT_SCOPES,
  toEntityType,
  buildEventKey,
};
