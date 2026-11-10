/**
 * division_codes.is_country_office + country_code — an org unit can be marked
 * as a country office of one AU member state (D-20261026-05).
 *
 * The level (directorate / division / unit) keeps its own rules; the flag only
 * says the unit is a country office and for which country (ISO 3166-1
 * alpha-3, list in @rbm/lib/countries). Idempotent.
 */

'use strict';

exports.up = async (knex) => {
  const hasFlag = await knex.schema.hasColumn('division_codes', 'is_country_office');
  const hasCountry = await knex.schema.hasColumn('division_codes', 'country_code');
  if (hasFlag && hasCountry) return;
  await knex.schema.alterTable('division_codes', (t) => {
    if (!hasFlag) t.boolean('is_country_office').notNullable().defaultTo(false);
    if (!hasCountry) t.string('country_code', 3).nullable();
  });
};

exports.down = async (knex) => {
  for (const column of ['country_code', 'is_country_office']) {
    if (await knex.schema.hasColumn('division_codes', column)) {
      await knex.schema.alterTable('division_codes', (t) => { t.dropColumn(column); });
    }
  }
};
