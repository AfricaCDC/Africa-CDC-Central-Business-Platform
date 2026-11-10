/**
 * Microsoft Entra ID (Outlook SSO) — link column.
 *
 * Stores the Microsoft Object ID (oid claim from the id_token) so we
 * can match a returning SSO user back to their local `users` row
 * without relying solely on email (emails can change; the oid is
 * immutable for the lifetime of the Entra user).
 *
 * Nullable by design: users created manually via /admin/users won't
 * have an oid until they log in via Microsoft for the first time,
 * at which point the callback handler fills it in.
 *
 * Idempotent: only adds the column if missing.
 */
exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('users'))) return;
  if (await knex.schema.hasColumn('users', 'microsoft_oid')) return;

  await knex.schema.alterTable('users', (t) => {
    // Microsoft oid is a GUID (36 chars) but we use 64 to be safe.
    t.string('microsoft_oid', 64).nullable().after('email');
  });

  // Unique index so two local users can never claim the same Entra
  // identity. Done as a try/catch because some older MySQL installs
  // don't accept UNIQUE on a nullable VARCHAR — we still want the
  // column even if the unique constraint fails.
  try {
    await knex.schema.alterTable('users', (t) => {
      t.unique('microsoft_oid', 'uq_users_microsoft_oid');
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[migration] skipped unique index on users.microsoft_oid:', e.message);
  }
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('users'))) return;
  if (!(await knex.schema.hasColumn('users', 'microsoft_oid'))) return;

  try {
    await knex.schema.alterTable('users', (t) => {
      t.dropUnique('microsoft_oid', 'uq_users_microsoft_oid');
    });
  } catch (e) { /* best effort */ }

  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('microsoft_oid');
  });
};
