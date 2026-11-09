// ── notificationResolvers — registry & dispatch unit tests ──
//
// Verifies every resolver in the registry plus the `resolveRecipients`
// dispatcher contract:
//   - never throws (catches inner exceptions, returns {error})
//   - dedupes user IDs and filters falsy values
//   - returns {error: 'UNKNOWN_RESOLVER:...'} for unknown scopes
//
// All knex calls run through the shared mock from tests/setup.js. Each
// resolver is exercised at least once for its happy + empty-input path.

const {
  resolvers,
  resolveRecipients,
  RESOLVER_KEYS,
} = require('../../src/services/notificationResolvers');
const { ORG_LEVEL_TYPES } = require('@rbm/lib/enums');

// Knex mock helper — separate from the shared global so we can program
// .first() calls in deterministic order without colliding with a route
// suite's chain.
function makeKnex() {
  return global.__makeKnexMock();
}

describe('RESOLVER_KEYS — registry shape', () => {
  it('exposes the canonical 13 resolver keys', () => {
    expect(RESOLVER_KEYS.sort()).toEqual([
      'actor',
      'actor_directorate_director',
      'actor_division_hod',
      'entity_contrib_hods',
      'entity_division_hod',
      'entity_division_me_officer',
      'entity_main_hod',
      'entity_owner',
      'entity_previous_owner',
      'entity_responsible',
      'focal_of_main',
      'role_all',
      'role_all_active',
    ]);
  });
});

describe('actor resolver', () => {
  it('returns [actor.id] when actor is present', async () => {
    const ids = await resolvers.actor({}, { id: 7 }, makeKnex(), {});
    expect(ids).toEqual([7]);
  });
  it('returns [] when actor is null', async () => {
    expect(await resolvers.actor({}, null, makeKnex(), {})).toEqual([]);
  });
});

describe('actor_division_hod resolver', () => {
  it('chases alias and returns the canonical HoD', async () => {
    const knex = makeKnex();
    knex.__chain.first
      .mockResolvedValueOnce({ code: 'D-ALIAS', alias_of: 'D-CANON' })
      .mockResolvedValueOnce({ responsible_user_id: 88 });

    const ids = await resolvers.actor_division_hod({}, { division_code: 'D-ALIAS' }, knex, {});
    expect(ids).toEqual([88]);
  });

  it('returns [] when division has no canonical row', async () => {
    const knex = makeKnex();
    knex.__chain.first.mockResolvedValueOnce(undefined);
    const ids = await resolvers.actor_division_hod({}, { division_code: 'D-X' }, knex, {});
    expect(ids).toEqual([]);
  });

  it('returns [] when actor has no division_code', async () => {
    const ids = await resolvers.actor_division_hod({}, {}, makeKnex(), {});
    expect(ids).toEqual([]);
  });
});

describe('actor_directorate_director resolver', () => {
  it('walks up from the actor division to the directorate row and returns its responsible', async () => {
    const knex = makeKnex();
    knex.__chain.first
      .mockResolvedValueOnce({ code: 'D1', alias_of: null, parent_code: 'DIR-A', level_type: ORG_LEVEL_TYPES.DIVISION, responsible_user_id: 5 })
      .mockResolvedValueOnce({ code: 'DIR-A', alias_of: null, parent_code: null, level_type: ORG_LEVEL_TYPES.DIRECTORATE, responsible_user_id: 12 });
    const ids = await resolvers.actor_directorate_director(
      {}, { division_code: 'D1' }, knex, {});
    expect(ids).toEqual([12]); // the division head (5) is skipped
  });

  it('returns [] when the directorate has no director', async () => {
    const knex = makeKnex();
    knex.__chain.first
      .mockResolvedValueOnce({ code: 'DIR-A', alias_of: null, parent_code: null, level_type: ORG_LEVEL_TYPES.DIRECTORATE, responsible_user_id: null });
    expect(await resolvers.actor_directorate_director(
      {}, { directorate_code: 'DIR-A' }, knex, {})).toEqual([]);
  });

  it('returns [] when actor has no division', async () => {
    expect(await resolvers.actor_directorate_director(
      {}, {}, makeKnex(), {})).toEqual([]);
  });
});

describe('entity_responsible resolver', () => {
  it('returns [responsible_user_id]', async () => {
    expect(await resolvers.entity_responsible(
      { responsible_user_id: 21 }, null, makeKnex(), {})).toEqual([21]);
  });
  it('returns [] when missing', async () => {
    expect(await resolvers.entity_responsible({}, null, makeKnex(), {})).toEqual([]);
  });
});

describe('entity_owner resolver', () => {
  it('returns [owner_user_id]', async () => {
    expect(await resolvers.entity_owner(
      { owner_user_id: 44 }, null, makeKnex(), {})).toEqual([44]);
  });
  it('returns [] when missing', async () => {
    expect(await resolvers.entity_owner({}, null, makeKnex(), {})).toEqual([]);
  });
});

describe('entity_previous_owner resolver (D-20261013-07)', () => {
  it('should return the user the entity was taken from', async () => {
    expect(await resolvers.entity_previous_owner({ previous_owner_user_id: 5, owner_user_id: 7 }, null, makeKnex(), {})).toEqual([5]);
  });
  it('should return [] when there was no previous owner', async () => {
    expect(await resolvers.entity_previous_owner({ owner_user_id: 7 }, null, makeKnex(), {})).toEqual([]);
  });
});

describe('entity_division_hod resolver', () => {
  it('prefers responsible_division_code over division_code', async () => {
    const knex = makeKnex();
    knex.__chain.first
      .mockResolvedValueOnce({ code: 'D-RESP', alias_of: null, responsible_user_id: 71 });

    const ids = await resolvers.entity_division_hod(
      { responsible_division_code: 'D-RESP', division_code: 'D-OTHER' },
      null, knex, {});
    expect(ids).toEqual([71]);
  });

  it('falls back to division_code when responsible_division_code is missing', async () => {
    const knex = makeKnex();
    knex.__chain.first
      .mockResolvedValueOnce({ code: 'D-OTHER', alias_of: null, responsible_user_id: 72 });
    const ids = await resolvers.entity_division_hod(
      { division_code: 'D-OTHER' }, null, knex, {});
    expect(ids).toEqual([72]);
  });
});

describe('entity_division_hod resolver — escalation (D-20261009-03)', () => {
  it('returns the directorate director when the division has no head', async () => {
    const knex = makeKnex();
    knex.__chain.first
      .mockResolvedValueOnce({ code: 'LABU', alias_of: null, parent_code: 'CLDS', responsible_user_id: null })
      .mockResolvedValueOnce({ code: 'CLDS', alias_of: null, parent_code: 'CLSN', responsible_user_id: null })
      .mockResolvedValueOnce({ code: 'CLSN', alias_of: null, parent_code: null, responsible_user_id: 70 });
    const ids = await resolvers.entity_division_hod({ division_code: 'LABU' }, null, knex, {});
    expect(ids).toEqual([70]);
  });
});

describe('entity_main_hod resolver', () => {
  it('walks the main → accountable → responsible → division fallback chain', async () => {
    const knex = makeKnex();
    knex.__chain.first
      .mockResolvedValueOnce({ code: 'D-MAIN', alias_of: null, responsible_user_id: 81 });
    const ids = await resolvers.entity_main_hod(
      { main_division_code: 'D-MAIN' }, null, knex, {});
    expect(ids).toEqual([81]);
  });
});

describe('entity_contrib_hods resolver', () => {
  it('parses a JSON-string contributing_divisions and resolves each HoD', async () => {
    const knex = makeKnex();
    // Promise.all interleaves: both canonical lookups fire before either
    // responsible_user_id lookup (microtask scheduling).
    knex.__chain.first
      .mockResolvedValueOnce({ code: 'D1', alias_of: null, responsible_user_id: 91 })   // hod D1
      .mockResolvedValueOnce({ code: 'D2', alias_of: null, responsible_user_id: 92 });  // hod D2
    const ids = await resolvers.entity_contrib_hods(
      { contributing_divisions: JSON.stringify(['D1', 'D2']) }, null, knex, {});
    expect(ids.sort()).toEqual([91, 92]);
  });

  it('handles already-parsed array and returns [] for missing values', async () => {
    const knex = makeKnex();
    knex.__chain.first
      .mockResolvedValueOnce({ code: 'D1', alias_of: null })
      .mockResolvedValueOnce({ responsible_user_id: null });
    const ids = await resolvers.entity_contrib_hods(
      { contributing_divisions: ['D1'] }, null, knex, {});
    expect(ids).toEqual([]);
  });

  it('returns [] when contributing_divisions is malformed JSON', async () => {
    const ids = await resolvers.entity_contrib_hods(
      { contributing_divisions: 'not-json' }, null, makeKnex(), {});
    expect(ids).toEqual([]);
  });

  it('returns [] when contributing_divisions is missing', async () => {
    const ids = await resolvers.entity_contrib_hods({}, null, makeKnex(), {});
    expect(ids).toEqual([]);
  });
});

describe('focal_of_main resolver', () => {
  it('returns every focal person of the canonical division (D-20261106-09)', async () => {
    const knex = makeKnex();
    knex.__chain.first.mockResolvedValueOnce({ code: 'D-MAIN', alias_of: null });
    knex.__chain.then.mockImplementationOnce((resolve) => Promise.resolve([{ user_id: 33 }, { user_id: '41' }]).then(resolve));
    const ids = await resolvers.focal_of_main(
      { main_division_code: 'D-MAIN' }, null, knex, {});
    expect(ids).toEqual([33, 41]);
    expect(knex).toHaveBeenCalledWith('user_divisions');
    expect(knex.__chain.where).toHaveBeenCalledWith({ division_code: 'D-MAIN', role: 'FOCAL_PERSON' });
  });

  it('returns [] when the division has no focal person', async () => {
    const knex = makeKnex();
    knex.__chain.first.mockResolvedValueOnce({ code: 'D-MAIN', alias_of: null });
    expect(await resolvers.focal_of_main(
      { main_division_code: 'D-MAIN' }, null, knex, {})).toEqual([]);
  });
});

describe('entity_division_me_officer resolver', () => {
  it('returns [m_and_e_user_id] for the canonical division (H-6)', async () => {
    const knex = makeKnex();
    knex.__chain.first
      .mockResolvedValueOnce({ code: 'D-MAIN', alias_of: null })
      .mockResolvedValueOnce({ m_and_e_user_id: 47 });
    const ids = await resolvers.entity_division_me_officer(
      { division_code: 'D-MAIN' }, null, knex, {});
    expect(ids).toEqual([47]);
  });

  it('walks the main → accountable → responsible → division fallback chain', async () => {
    const knex = makeKnex();
    knex.__chain.first
      .mockResolvedValueOnce({ code: 'D-MAIN', alias_of: null })
      .mockResolvedValueOnce({ m_and_e_user_id: 50 });
    const ids = await resolvers.entity_division_me_officer(
      { main_division_code: 'D-MAIN', division_code: 'D-OTHER' }, null, knex, {});
    expect(ids).toEqual([50]);
  });

  it('returns [] when the division has no M&E officer assigned', async () => {
    const knex = makeKnex();
    knex.__chain.first
      .mockResolvedValueOnce({ code: 'D-MAIN', alias_of: null })
      .mockResolvedValueOnce({ m_and_e_user_id: null });
    expect(await resolvers.entity_division_me_officer(
      { division_code: 'D-MAIN' }, null, knex, {})).toEqual([]);
  });

  it('returns [] when no division code is present on the entity', async () => {
    expect(await resolvers.entity_division_me_officer(
      {}, null, makeKnex(), {})).toEqual([]);
  });
});

describe('role_all / role_all_active resolvers', () => {
  it('role_all returns distinct user IDs for the given role code', async () => {
    const knex = makeKnex();
    knex.__chain.then.mockImplementationOnce((r) =>
      Promise.resolve([{ id: 1 }, { id: 2 }, { id: 3 }]).then(r));
    const ids = await resolvers.role_all(
      {}, null, knex, { recipient_role: 'SYSTEM_ADMIN' });
    expect(ids).toEqual([1, 2, 3]);
  });

  it('role_all returns [] when no recipient_role is provided', async () => {
    const ids = await resolvers.role_all({}, null, makeKnex(), {});
    expect(ids).toEqual([]);
  });

  it('role_all_active applies the ACTIVE status filter', async () => {
    const knex = makeKnex();
    knex.__chain.then.mockImplementationOnce((r) =>
      Promise.resolve([{ id: 9 }]).then(r));
    const ids = await resolvers.role_all_active(
      {}, null, knex, { recipient_role: 'HEAD_OF_DIVISION' });
    expect(ids).toEqual([9]);
    // Should narrow on users.status = ACTIVE
    expect(knex.__chain.where).toHaveBeenCalledWith('users.status', 'ACTIVE');
  });
});

describe('resolveRecipients dispatcher', () => {
  it('returns UNKNOWN_RESOLVER for an unregistered scope', async () => {
    const out = await resolveRecipients(
      { recipient_scope: 'definitely_not_a_scope' }, {}, null, makeKnex());
    expect(out).toEqual({ userIds: [], error: 'UNKNOWN_RESOLVER:definitely_not_a_scope' });
  });

  it('returns UNKNOWN_RESOLVER for a missing scope', async () => {
    const out = await resolveRecipients({}, {}, null, makeKnex());
    expect(out).toEqual({ userIds: [], error: 'UNKNOWN_RESOLVER:undefined' });
  });

  it('dedupes and filters falsy IDs from the resolver output', async () => {
    // Use the `actor` resolver via dispatcher — simplest invariant test.
    const out = await resolveRecipients(
      { recipient_scope: 'actor' }, {}, { id: 7 }, makeKnex());
    expect(out).toEqual({ userIds: [7], error: null });
  });

  it('catches resolver exceptions and returns {error}', async () => {
    const knex = makeKnex();
    knex.__chain.first.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const out = await resolveRecipients(
      { recipient_scope: 'actor_division_hod' },
      {}, { division_code: 'D-X' }, knex);
    expect(out).toEqual({ userIds: [], error: 'boom' });
  });
});
