/**
 * Adds the funding sources Lenny flagged in round-2 feedback (H-3):
 *   · "Japan Funds" — a real donor missing from the original seed
 *   · "Other"       — explicit catch-all; must sort LAST in the combobox
 *
 * This does NOT mutate the already-applied 20260602000000_reference_values
 * migration (a migration is immutable once it has run in any environment).
 * It is fully idempotent: INSERT … ON CONFLICT (type, value) IGNORE, so a
 * re-run or an env where the values already exist is a no-op.
 *
 * "Other" gets a deliberately high sort_order so the curated list always keeps
 * it at the bottom, however many real sources are added later. The combobox
 * stays free-text (this table only supplies suggestions — see referenceService).
 */

const NEW_FUNDING_SOURCES = [
  { value: 'Japan Funds', sort_order: 100 },
  { value: 'Other', sort_order: 9999 },
];

exports.up = async function up(knex) {
  // The base migration both creates and seeds the table; if it has not run yet
  // there is nothing to extend (these rows are not load-bearing for the schema).
  const exists = await knex.schema.hasTable('reference_values');
  if (!exists) return;

  const rows = NEW_FUNDING_SOURCES.map(({ value, sort_order }) => ({
    type: 'FUNDING_SOURCE',
    value,
    sort_order,
    active: true,
  }));
  await knex('reference_values').insert(rows).onConflict(['type', 'value']).ignore();
};

exports.down = async function down(knex) {
  const exists = await knex.schema.hasTable('reference_values');
  if (!exists) return;
  await knex('reference_values')
    .where({ type: 'FUNDING_SOURCE' })
    .whereIn('value', NEW_FUNDING_SOURCES.map((r) => r.value))
    .del();
};
