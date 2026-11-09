/**
 * Notification scope resolvers (D-20260417-01).
 *
 * Registry of named functions that turn a (subscription, entity, actor,
 * knex) tuple into a list of user IDs to notify. Each key here matches a
 * value of `RECIPIENT_SCOPES` in `@rbm/lib/events`.
 *
 * Resolver contract:
 *   async (entity, actor, knex, subscription) => number[] (user IDs)
 *
 * Never throw: return [] on any "no-match" condition. The event bus
 * catches any exception and logs via `audit_events.action =
 * 'WORKFLOW_EVENT_RESOLVER_FAILED'` (eventBusService), so a broken
 * resolver can never fail the originating route.
 *
 * Spec: docs/specs/notification-wizard.md §7
 */

const { ORG_LEVEL_TYPES } = require('@rbm/lib/enums');
const { resolveHolderUpChain } = require('./divisionAliasService');
const { DIVISION_ASSIGNMENT_ROLES } = require('@rbm/lib/user-divisions');

/**
 * Chase an alias row to its canonical division code. Aliases never chain
 * (see 20260407150000_add_division_alias_of.js) so a single lookup suffices.
 */
async function resolveCanonicalDivision(knex, divisionCode) {
  if (!divisionCode) return null;
  const row = await knex('division_codes')
    .where('code', divisionCode)
    .select('code', 'alias_of')
    .first();
  if (!row) return null;
  return row.alias_of || row.code;
}

/**
 * Find the user_id of the approver for a division: its HoD
 * (responsible_user_id), or, when the division has none, the nearest
 * responsible up the parent chain (its directorate's director). Same rule
 * as the workflow engine (D-20261009-03). Returns `[]` when nobody is
 * assigned up the chain. Alias-aware.
 */
async function findHodOfDivisionCode(knex, divisionCode) {
  if (!divisionCode) return [];
  const id = await resolveHolderUpChain(knex, divisionCode, 'responsible_user_id');
  return id ? [id] : [];
}

/** Every focal person of the division: its FOCAL_PERSON rows (D-20261106-09). Alias-aware. */
async function findFocalOfDivisionCode(knex, divisionCode) {
  if (!divisionCode) return [];
  const canonical = await resolveCanonicalDivision(knex, divisionCode);
  if (!canonical) return [];
  const rows = await knex('user_divisions')
    .where({ division_code: canonical, role: DIVISION_ASSIGNMENT_ROLES.FOCAL_PERSON })
    .orderBy('id')
    .select('user_id');
  return rows.map((r) => Number(r.user_id));
}

/**
 * Find the M&E officer (`m_and_e_user_id` on the canonical division row)
 * for a given division code. Returns `[]` if no canonical row or no M&E
 * officer assigned. Alias-aware. Used to route a division's quarterly
 * report to its own M&E officer (H-6) rather than all M&E officers.
 */
async function findMeOfficerOfDivisionCode(knex, divisionCode) {
  if (!divisionCode) return [];
  const canonical = await resolveCanonicalDivision(knex, divisionCode);
  if (!canonical) return [];
  const row = await knex('division_codes')
    .where('code', canonical)
    .select('m_and_e_user_id')
    .first();
  return row?.m_and_e_user_id ? [row.m_and_e_user_id] : [];
}

/**
 * Parse the `contributing_divisions` column (may be a JSON string or
 * already-parsed array). Swallow parse errors.
 */
function parseContributingDivisions(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Dynamic resolver for `role_all:ROLE_CODE` subscriptions. The scope
 * string arrives as `role_all` or `role_all_active`; the role code comes
 * from the subscription.recipient_role column.
 */
async function findAllUsersWithRole(knex, roleCode, { activeOnly = false } = {}) {
  if (!roleCode) return [];
  let q = knex('user_roles')
    .join('roles', 'roles.id', 'user_roles.role_id')
    .join('users', 'users.id', 'user_roles.user_id')
    .where('roles.code', roleCode);
  if (activeOnly) q = q.where('users.status', 'ACTIVE');
  const rows = await q.distinct('users.id').select('users.id');
  return rows.map((r) => r.id);
}

/**
 * The resolver registry.
 *
 * entity: the row that triggered the event (may be partial — routes can
 * pass `{ id, responsible_user_id, main_division_code, ... }`).
 * actor:  the acting user (`req.user`), may be null for cron events.
 * knex:   the DB connection / transaction to use.
 * subscription: the `notification_subscriptions` row (used for role_all).
 */
const resolvers = {
  actor: async (_entity, actor) => (actor?.id ? [actor.id] : []),

  actor_division_hod: async (_entity, actor, knex) =>
    findHodOfDivisionCode(knex, actor?.division_code),

  actor_directorate_director: async (_entity, actor, knex) => {
    // The director is the responsible_user_id of the directorate row
    // (level_type = directorate) above the actor's division.
    const code = actor?.directorate_code || actor?.division_code;
    if (!code) return [];
    const id = await resolveHolderUpChain(knex, code, 'responsible_user_id', {
      minLevel: ORG_LEVEL_TYPES.DIRECTORATE,
    });
    return id ? [id] : [];
  },

  entity_responsible: async (entity) =>
    entity?.responsible_user_id ? [entity.responsible_user_id] : [],

  entity_owner: async (entity) =>
    entity?.owner_user_id ? [entity.owner_user_id] : [],

  // The person the entity was taken from, e.g. the previous preparer of an
  // activity report (activity_report.preparer_changed, D-20261013-07).
  entity_previous_owner: async (entity) =>
    entity?.previous_owner_user_id ? [entity.previous_owner_user_id] : [],

  entity_division_hod: async (entity, _actor, knex) =>
    findHodOfDivisionCode(knex, entity?.responsible_division_code || entity?.division_code),

  entity_main_hod: async (entity, _actor, knex) => {
    const code = entity?.main_division_code
      || entity?.accountable_division_code
      || entity?.responsible_division_code
      || entity?.division_code;
    return findHodOfDivisionCode(knex, code);
  },

  entity_contrib_hods: async (entity, _actor, knex) => {
    const codes = parseContributingDivisions(entity?.contributing_divisions);
    const nested = await Promise.all(codes.map((c) => findHodOfDivisionCode(knex, c)));
    return nested.flat();
  },

  focal_of_main: async (entity, _actor, knex) => {
    const code = entity?.main_division_code
      || entity?.accountable_division_code
      || entity?.division_code;
    return findFocalOfDivisionCode(knex, code);
  },

  entity_division_me_officer: async (entity, _actor, knex) => {
    const code = entity?.main_division_code
      || entity?.accountable_division_code
      || entity?.responsible_division_code
      || entity?.division_code;
    return findMeOfficerOfDivisionCode(knex, code);
  },

  role_all: async (_entity, _actor, knex, subscription) =>
    findAllUsersWithRole(knex, subscription?.recipient_role),

  role_all_active: async (_entity, _actor, knex, subscription) =>
    findAllUsersWithRole(knex, subscription?.recipient_role, { activeOnly: true }),
};

/**
 * Add the out-of-office delegate of each recipient (D-20261105-09): while a
 * delegation is active, the delegate receives a copy of the delegator's
 * platform emails. No chains.
 *
 * @param {number[]} ids
 * @param {import('knex').Knex} knex
 * @returns {Promise<number[]>}
 */
async function withDelegates(ids, knex) {
  if (!ids.length) return ids;
  const day = new Date().toISOString().slice(0, 10);
  try {
    const rows = await knex('approval_delegations')
      .whereIn('delegator_id', ids).whereNull('revoked_at')
      .where('starts_on', '<=', day).where('ends_on', '>=', day)
      .select('delegate_id');
    return [...ids, ...(rows || []).map((r) => Number(r.delegate_id))];
  } catch {
    return ids; // a delegation lookup failure must never drop the original recipients
  }
}

/**
 * Resolve a subscription to a list of user IDs. Never throws — returns
 * `[]` for unknown scopes (and logs via the caller).
 *
 * @param {object} subscription - row from notification_subscriptions
 * @param {object} entity
 * @param {object|null} actor
 * @param {import('knex').Knex} knex
 * @returns {Promise<{userIds: number[], error: string|null}>}
 */
async function resolveRecipients(subscription, entity, actor, knex) {
  const scope = subscription?.recipient_scope;
  const fn = resolvers[scope];
  if (!fn) {
    return { userIds: [], error: `UNKNOWN_RESOLVER:${scope}` };
  }
  try {
    const ids = await fn(entity, actor, knex, subscription);
    const own = (ids || []).filter(Boolean);
    const deduped = Array.from(new Set(await withDelegates(own, knex)));
    return { userIds: deduped, error: null };
  } catch (err) {
    return { userIds: [], error: err?.message || 'RESOLVER_THREW' };
  }
}

module.exports = {
  resolvers,
  resolveRecipients,
  // exported for tests / admin UI listing
  RESOLVER_KEYS: Object.keys(resolvers),
};
