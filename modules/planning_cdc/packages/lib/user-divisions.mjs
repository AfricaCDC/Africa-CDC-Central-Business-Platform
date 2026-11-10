/**
 * @rbm/lib/user-divisions — ESM source (constants only).
 *
 * Mirror of the constants in ./user-divisions.js (CJS) for frontend
 * bundlers. The knex-based resolvers stay CJS-only (server side). Keep the
 * values in lockstep with ./user-divisions.js.
 */

export const DIVISION_ASSIGNMENT_ROLES = Object.freeze({
  FOCAL_PERSON: 'FOCAL_PERSON',
  HEAD_OF_DIVISION: 'HEAD_OF_DIVISION',
  DIRECTOR: 'DIRECTOR',
  ME_OFFICER: 'ME_OFFICER',
  MEMBER: 'MEMBER',
});

export const DIVISION_ASSIGNMENT_ROLE_LIST = Object.freeze(
  Object.values(DIVISION_ASSIGNMENT_ROLES),
);

export const DIVISION_ASSIGNMENT_ROLE_LABELS = Object.freeze({
  [DIVISION_ASSIGNMENT_ROLES.MEMBER]: 'Member',
  [DIVISION_ASSIGNMENT_ROLES.FOCAL_PERSON]: 'Focal Person',
  // One concept for users: the Responsible person (single holder) of a
  // division or directorate. The stored role (HEAD_OF_DIVISION / DIRECTOR)
  // follows level_type and is chosen by divisionAssignmentService.
  [DIVISION_ASSIGNMENT_ROLES.HEAD_OF_DIVISION]: 'Responsible person',
  [DIVISION_ASSIGNMENT_ROLES.DIRECTOR]: 'Responsible person',
  [DIVISION_ASSIGNMENT_ROLES.ME_OFFICER]: 'M&E Officer',
});
