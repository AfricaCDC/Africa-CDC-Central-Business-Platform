/**
 * D-20260902-02 — `division_codes.division_cbp_id`: bind each platform unit to
 * its CBP division by STABLE ID rather than by name.
 *
 * CBP exposes 42 divisions (id + name) and stamps `divisionId` / `divisionName`
 * on every staff record, but the names do not map 1:1 onto `division_name`
 * ("Laboratory Networks and Systems" vs "Laboratory Systems", "Digital Health
 * and Information Systems" vs "Digital Health Informations Systems"): only 7 of
 * 42 match exactly. Fuzzy matching recovers most of them but silently mis-files
 * the rest, which is precisely the failure mode that broke the user import
 * (D-20260902-01: matching on a mutable label instead of the stable id).
 *
 * The column is nullable on purpose — 14 CBP divisions have no platform
 * counterpart (TBD, PIU, IMST - External…) and some platform units have no CBP
 * one. UNIQUE so a CBP division can never be claimed by two platform units.
 */

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('division_codes'))) return;
  if (await knex.schema.hasColumn('division_codes', 'division_cbp_id')) return;

  await knex.schema.alterTable('division_codes', (t) => {
    t.string('division_cbp_id', 32).nullable()
      .comment('CBP division id (staff.divisionId). NULL = not mapped yet.');
    t.unique(['division_cbp_id'], 'uq_division_codes_cbp_id');
  });
  console.log('[20260902100000] division_codes.division_cbp_id added (nullable, unique)');
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('division_codes'))) return;
  if (!(await knex.schema.hasColumn('division_codes', 'division_cbp_id'))) return;
  await knex.schema.alterTable('division_codes', (t) => {
    t.dropUnique(['division_cbp_id'], 'uq_division_codes_cbp_id');
    t.dropColumn('division_cbp_id');
  });
};
