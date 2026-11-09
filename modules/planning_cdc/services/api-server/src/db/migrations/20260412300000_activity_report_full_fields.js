/**
 * Add full Activity Report fields (ACTREP1-19 spec) to activity_reports.
 * Many are auto-filled from the linked specific activity (plan_node).
 */

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('activity_reports'))) return;
  const cols = (await knex.raw('SHOW COLUMNS FROM activity_reports'))[0].map(c => c.Field);
  const add = [];

  if (!cols.includes('start_date'))
    add.push("ADD COLUMN start_date DATE NULL AFTER location");
  if (!cols.includes('end_date'))
    add.push("ADD COLUMN end_date DATE NULL AFTER start_date");
  if (!cols.includes('duration_days'))
    add.push("ADD COLUMN duration_days INT NULL AFTER end_date");
  if (!cols.includes('lead_organiser'))
    add.push("ADD COLUMN lead_organiser VARCHAR(300) NULL AFTER duration_days");
  if (!cols.includes('other_staff'))
    add.push("ADD COLUMN other_staff TEXT NULL AFTER lead_organiser");
  if (!cols.includes('member_states'))
    add.push("ADD COLUMN member_states TEXT NULL AFTER participants_count");
  if (!cols.includes('methodology'))
    add.push("ADD COLUMN methodology TEXT NULL AFTER member_states");
  if (!cols.includes('indicator_achievement'))
    add.push("ADD COLUMN indicator_achievement TEXT NULL AFTER methodology");
  if (!cols.includes('means_of_verification'))
    add.push("ADD COLUMN means_of_verification TEXT NULL AFTER indicator_achievement");
  if (!cols.includes('findings_recommendations'))
    add.push("ADD COLUMN findings_recommendations TEXT NULL AFTER means_of_verification");
  if (!cols.includes('total_budget'))
    add.push("ADD COLUMN total_budget DECIMAL(15,2) NULL AFTER actual_spend");
  if (!cols.includes('budget_code'))
    add.push("ADD COLUMN budget_code VARCHAR(50) NULL AFTER total_budget");

  if (add.length) {
    await knex.raw(`ALTER TABLE activity_reports ${add.join(', ')}`);
  }
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('activity_reports'))) return;
  const drop = ['start_date','end_date','duration_days','lead_organiser','other_staff',
    'member_states','methodology','indicator_achievement','means_of_verification',
    'findings_recommendations','total_budget','budget_code'];
  for (const col of drop) {
    const has = (await knex.raw(`SHOW COLUMNS FROM activity_reports LIKE '${col}'`))[0];
    if (has.length) await knex.raw(`ALTER TABLE activity_reports DROP COLUMN ${col}`);
  }
};
