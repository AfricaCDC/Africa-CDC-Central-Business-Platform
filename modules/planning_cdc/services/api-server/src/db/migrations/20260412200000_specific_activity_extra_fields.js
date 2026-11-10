/**
 * Add extra fields to plan_nodes for the full Specific Activity form
 * matching the Africa CDC activity template:
 *   - implementation_at_rcc (Yes/No)
 *   - secondary_division_code
 *   - description (short description)
 *   - budgeting_arrangement (Extramural/Intramural)
 *   - primary_funding_source
 *   - other_funding_source
 *   - grant_name
 *   - location
 *   - is_operational (Yes/No)
 *
 * All nullable since existing rows won't have these values.
 * Idempotent: guarded by hasColumn.
 */

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('plan_nodes'))) return;

  await knex.schema.alterTable('plan_nodes', (t) => {
    if (!knex.schema.hasColumn) return; // safety
  });

  const cols = (await knex.raw('SHOW COLUMNS FROM plan_nodes'))[0].map(c => c.Field);
  const add = [];

  if (!cols.includes('implementation_at_rcc'))
    add.push(knex.raw("ALTER TABLE plan_nodes ADD COLUMN implementation_at_rcc TINYINT(1) NULL AFTER activity_type"));
  if (!cols.includes('secondary_division_code'))
    add.push(knex.raw("ALTER TABLE plan_nodes ADD COLUMN secondary_division_code VARCHAR(20) NULL AFTER responsible_division_code"));
  if (!cols.includes('description'))
    add.push(knex.raw("ALTER TABLE plan_nodes ADD COLUMN description TEXT NULL AFTER title"));
  if (!cols.includes('budgeting_arrangement'))
    add.push(knex.raw("ALTER TABLE plan_nodes ADD COLUMN budgeting_arrangement ENUM('Extramural','Intramural') NULL AFTER budget_main"));
  if (!cols.includes('primary_funding_source'))
    add.push(knex.raw("ALTER TABLE plan_nodes ADD COLUMN primary_funding_source VARCHAR(200) NULL AFTER budgeting_arrangement"));
  if (!cols.includes('other_funding_source'))
    add.push(knex.raw("ALTER TABLE plan_nodes ADD COLUMN other_funding_source VARCHAR(200) NULL AFTER primary_funding_source"));
  if (!cols.includes('grant_name'))
    add.push(knex.raw("ALTER TABLE plan_nodes ADD COLUMN grant_name VARCHAR(200) NULL AFTER other_funding_source"));
  if (!cols.includes('location'))
    add.push(knex.raw("ALTER TABLE plan_nodes ADD COLUMN location VARCHAR(300) NULL AFTER end_date"));
  if (!cols.includes('is_operational'))
    add.push(knex.raw("ALTER TABLE plan_nodes ADD COLUMN is_operational TINYINT(1) NULL AFTER location"));

  for (const q of add) await q;
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('plan_nodes'))) return;
  const drop = ['implementation_at_rcc','secondary_division_code','description',
    'budgeting_arrangement','primary_funding_source','other_funding_source',
    'grant_name','location','is_operational'];
  for (const col of drop) {
    const has = (await knex.raw(`SHOW COLUMNS FROM plan_nodes LIKE '${col}'`))[0];
    if (has.length) await knex.raw(`ALTER TABLE plan_nodes DROP COLUMN ${col}`);
  }
};
