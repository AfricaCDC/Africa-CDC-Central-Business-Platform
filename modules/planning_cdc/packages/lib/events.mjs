/**
 * @rbm/lib/events — ESM source.
 *
 * Mirror of ./events.js (CJS) for frontend bundlers. Both files MUST stay
 * in lockstep.
 */

import { ENTITY_TYPES } from './enums.mjs';

// eslint-disable-next-line cdc-rbm/no-inline-status-map -- event-action verbs, not status values
export const EVENT_ACTIONS = Object.freeze({
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

export const CHANNELS = Object.freeze({
  EMAIL:  'email',
  IN_APP: 'in_app',
  BOTH:   'both',
});

export const RECIPIENT_SCOPES = Object.freeze({
  ACTOR:                       'actor',
  ACTOR_DIVISION_HOD:          'actor_division_hod',
  ACTOR_DIRECTORATE_DIRECTOR:  'actor_directorate_director',
  ENTITY_RESPONSIBLE:          'entity_responsible',
  ENTITY_DIVISION_HOD:         'entity_division_hod',
  ENTITY_MAIN_HOD:             'entity_main_hod',
  ENTITY_CONTRIB_HODS:         'entity_contrib_hods',
  ENTITY_OWNER:                'entity_owner',
  ENTITY_PREVIOUS_OWNER:       'entity_previous_owner', // e.g. the preparer a report was taken from
  ROLE_ALL:                    'role_all',
  ROLE_ALL_ACTIVE:             'role_all_active',
  FOCAL_OF_MAIN:               'focal_of_main',
  ENTITY_DIVISION_ME_OFFICER:  'entity_division_me_officer',
});

export function toEntityType(entityType) {
  const known = new Set(Object.values(ENTITY_TYPES));
  const normalized = String(entityType || '').trim();
  if (!normalized) throw new Error('toEntityType: entityType is required');
  const upper = normalized.toUpperCase();
  if (!known.has(upper)) return normalized.toLowerCase();
  return upper.toLowerCase();
}

export function buildEventKey(entityType, action) {
  if (!action) throw new Error('buildEventKey: action is required');
  const normalizedAction = String(action).trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]*$/.test(normalizedAction)) {
    throw new Error(`buildEventKey: invalid action "${action}"`);
  }
  return `${toEntityType(entityType)}.${normalizedAction}`;
}
