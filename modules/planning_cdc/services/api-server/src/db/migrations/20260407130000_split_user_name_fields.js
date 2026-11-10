/**
 * Split users.full_name into title + first_name + middle_name + last_name.
 *
 * `full_name` stays as a denormalised cache so legacy code paths and the
 * UI table can keep reading a single field. New writes compute full_name
 * by concatenating the structured fields.
 *
 * Backfill: best-effort split of existing full_name. Words like "Dr" / "Prof"
 * get hoisted into the title column. The first remaining word is the first
 * name, the last word is the last name, anything in between becomes middle.
 *
 * Idempotent: column adds + backfill only run on first invocation.
 */
exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('users'))) return;

  const cols = await knex('information_schema.columns')
    .select('column_name')
    .where({ table_schema: knex.client.database(), table_name: 'users' });
  const have = new Set(cols.map(c => c.column_name || c.COLUMN_NAME));

  await knex.schema.alterTable('users', t => {
    if (!have.has('title'))       t.string('title', 20).nullable();
    if (!have.has('first_name'))  t.string('first_name', 100).nullable();
    if (!have.has('middle_name')) t.string('middle_name', 100).nullable();
    if (!have.has('last_name'))   t.string('last_name', 100).nullable();
  });

  // ── Backfill from existing full_name ────────────────────────
  // Skip rows that already have first_name set (idempotent re-run).
  const TITLES = new Set(['Mr', 'Mrs', 'Ms', 'Mx', 'Dr', 'Dr.', 'Prof', 'Prof.', 'Rev', 'Eng', 'Hon', 'Sir', 'Madam']);

  const users = await knex('users')
    .select('id', 'full_name', 'first_name')
    .whereNotNull('full_name');

  for (const u of users) {
    if (u.first_name) continue; // already split
    const raw = String(u.full_name || '').trim();
    if (!raw) continue;
    const parts = raw.split(/\s+/);
    let title = null;
    // Hoist a leading title token if it matches the whitelist
    if (parts.length > 1 && TITLES.has(parts[0].replace(/\.$/, '') + (parts[0].endsWith('.') ? '' : '')) ) {
      title = parts.shift();
      // Normalize "Dr" → "Dr." for display consistency
      if (!title.endsWith('.') && (title === 'Dr' || title === 'Prof')) title = title + '.';
    }
    let first = null, middle = null, last = null;
    if (parts.length === 1) {
      first = parts[0];
    } else if (parts.length === 2) {
      [first, last] = parts;
    } else {
      first = parts[0];
      last = parts[parts.length - 1];
      middle = parts.slice(1, -1).join(' ');
    }
    await knex('users').where('id', u.id).update({
      title,
      first_name: first,
      middle_name: middle,
      last_name: last,
    });
  }
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('users'))) return;
  await knex.schema.alterTable('users', t => {
    t.dropColumn('title');
    t.dropColumn('first_name');
    t.dropColumn('middle_name');
    t.dropColumn('last_name');
  });
};
