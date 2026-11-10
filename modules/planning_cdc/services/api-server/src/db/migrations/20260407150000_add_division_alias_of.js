/**
 * Division aliases.
 *
 * Some rows in `division_codes` are historical duplicates of other rows
 * (e.g. HRMD is literally labelled "Human Resource Management Division
 * (alias)"). Rather than delete them — which would break any FK that still
 * points at them — we add an `alias_of` self-FK so each alias row can
 * point at its canonical twin.
 *
 *   HRMD → HR
 *   CLSN → DIR_CLSN       (the "(global)" suffix row)
 *   HP   → PHC-HP         (the "(alias EE)" row)
 *   RCC  → DIR_R          (the generic "Regional Coordinating Centres" row)
 *   LMHC → PHAHM          (second "Local Manufacturing" row)
 *
 * Tree UI hides rows where alias_of IS NOT NULL by default. Detail page of
 * the canonical shows "Known aliases: [list]". FKs keep working, legacy
 * data is preserved.
 *
 * Idempotent: re-runs only add the column if missing and only mark a row
 * as alias if its alias_of is still null.
 */

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('division_codes'))) return;

  const cols = await knex('information_schema.columns')
    .select('column_name')
    .where({ table_schema: knex.client.database(), table_name: 'division_codes' });
  const have = new Set(cols.map(c => c.column_name || c.COLUMN_NAME));

  if (!have.has('alias_of')) {
    await knex.schema.alterTable('division_codes', t => {
      t.string('alias_of', 20).nullable().after('parent_code');
    });
    try {
      await knex.schema.alterTable('division_codes', t => {
        t.foreign('alias_of', 'fk_div_alias_of')
          .references('code').inTable('division_codes')
          .onDelete('SET NULL');
        t.index('alias_of', 'idx_div_alias_of');
      });
    } catch (e) { /* re-run → already exists */ }
  }

  const KNOWN_ALIASES = [
    { alias: 'HRMD', canonical: 'HR' },
    { alias: 'CLSN', canonical: 'DIR_CLSN' },
    { alias: 'HP',   canonical: 'PHC-HP' },
    { alias: 'RCC',  canonical: 'DIR_R' },
    { alias: 'LMHC', canonical: 'PHAHM' },
  ];

  for (const { alias, canonical } of KNOWN_ALIASES) {
    const row = await knex('division_codes').where('code', alias).first();
    if (!row || row.alias_of) continue;
    const target = await knex('division_codes').where('code', canonical).first();
    if (!target) continue; // target doesn't exist on this DB → skip safely
    await knex('division_codes').where('code', alias).update({ alias_of: canonical });
  }
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('division_codes'))) return;
  await knex.schema.alterTable('division_codes', t => {
    try { t.dropForeign('alias_of', 'fk_div_alias_of'); } catch (e) {}
    try { t.dropIndex('alias_of', 'idx_div_alias_of'); } catch (e) {}
    t.dropColumn('alias_of');
  });
};
