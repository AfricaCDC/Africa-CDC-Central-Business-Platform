/**
 * Migration: Normalize division references
 *
 * Adds FK columns (→ division_codes.code) alongside existing free-text division
 * columns. Existing text columns are NOT dropped — backward compatible.
 *
 * Affected tables:
 *   - workplan_items.responsible_division_code
 *   - amert_activities.responsible_division_code
 *   - big_tickets.responsibility_code
 *   - pirs_completion_stats.responsible_code
 *   - focal_points.division_code
 *   - division_activity_reports.division_code
 *
 * Also creates junction table: item_contributing_divisions
 */

/**
 * Map free-text division strings → division_codes.code
 * Values that are person names or unmapped will be left NULL.
 */
const DIVISION_TEXT_TO_CODE = {
  // NCD
  'NCDs, Injuries and Mental health': 'NCD',
  'NCDs, Injuries and Mental Health Division': 'NCD',
  'PHC- NCDs, Injuries and Mental Health': 'NCD',
  // Community Health
  'Community Health System and Health Promotion': 'CHSISD',
  'PHC-Community Health Systems and Health Promotion': 'CHSISD',
  // RMNCAH / SRH
  'RMNCAH': 'SRH',
  'RMNCAH Division': 'SRH',
  // Surveillance
  'Surveillance and Disease Intelligence': 'SDI',
  // One Health
  'One Health': 'OneH',
  // EPR
  'EPR': 'EPR',
  'EPR Division': 'EPR',
  // Labs
  'Centre for Laboratory Diagnostics and Systems': 'CLDS',
  // NPHI / PHIHSS
  'Centre for Public Health Institute and Health System Strengthening': 'PHIHSS',
  // Primary Health Care
  'Primary Health Care Center': 'PHC',
  'PHC-Infectious Diseases': 'PHC-ID',
  // Infectious Diseases
  'ID': 'ID',
  // Health Workforce
  'Health Workforce Development': 'Wkf',
  // Knowledge Management
  'Knowledge Management': 'KM',
  // R&D
  'R&D and Clinical Trials': 'SCI',
  // Digital Health
  'Digital Health, Health Information Systems and Data Governance': 'Digital',
  // Local Manufacturing
  'Local Manufacturing': 'PHAHM',
  // Youth
  'Youth Division/Programme': 'YOUTH',
  // RCCs — full names
  'Eastern Africa Regional Coordinating Centre': 'EARCC',
  'Eastern RCC': 'EARCC',
  'EARCC': 'EARCC',
  'Western Africa Regional Coordinating Centre': 'WARCC',
  'Western RCC': 'WARCC',
  'Central Africa Regional Coordinating Centre': 'CARCC',
  'Central RCC': 'CARCC',
  'Northern Africa Regional Coordinating Centre': 'NARCC',
  'Northern RCC': 'NARCC',
  'North RCC': 'NARCC',
  'Southern Africa Regional Coordinating Centre': 'SARCC',
  'Southern RCC': 'SARCC',
  // Partnerships
  'Partnership': 'PIC',
  'Partnership and International Cooperation': 'PIC',
  'Partnerships and International Cooperation': 'PIC',
  'Partnership and Resource Mobilisation': 'PIC',
  'Partnership + PIU': 'PIC',
  // Policy and Health Diplomacy
  'Policy and Health Diplomacy': 'PHD',
  // PIU
  'PIU': 'PIU',
  // Finance
  'Finance': 'FMG',
  'Finance Directorate': 'FMG',
  // Administration
  'Directorate of Admin': 'ADIM',
  'Directorate of Administration': 'ADIM',
  'Admin, Assets & Facility Mgt Unit': 'ASSET',
  // HR
  'HRMD': 'HRMD',
  'HRMD/Admin': 'HRMD',
  'Human Resource Management Division': 'HRMD',
  // MIS
  'Division of MIS': 'MIS',
  // Internal Oversight
  'Division of Internal Oversight': 'DIO',
  // Health Economics
  'Divison of Health Economics and Financing': 'HEP',
  'HEF Focal': 'HEP',
  // PRA / MELP
  'PRA': 'PRA',
  'PR&A': 'PRA',
  'MELP': 'MELP',
  // CPI
  'CPI': 'CPI',
  // DG
  'Office of the Director General': 'DG',
  'Executive Office': 'DG',
  // Legal
  'Legal Division': 'DDS',
  // Lusaka Agenda — no exact match, map to Cross-cutting
  'Lusaka Agenda Secretariat': 'Cross-cutting',
};

exports.up = async function (knex) {
  // ─────────────────────────────────────────────
  // 1. Add FK columns alongside existing free-text columns
  // ─────────────────────────────────────────────

  // workplan_items.responsible_division_code
  if (!(await knex.schema.hasColumn('workplan_items', 'responsible_division_code'))) {
    await knex.schema.alterTable('workplan_items', (t) => {
      t.string('responsible_division_code', 20).nullable().after('responsible_division');
      t.foreign('responsible_division_code')
        .references('code').inTable('division_codes')
        .onDelete('SET NULL');
      t.index('responsible_division_code', 'idx_wpi_div_code');
    });
  }

  // amert_activities.responsible_division_code
  if (!(await knex.schema.hasColumn('amert_activities', 'responsible_division_code'))) {
    await knex.schema.alterTable('amert_activities', (t) => {
      t.string('responsible_division_code', 20).nullable().after('responsible_division');
      t.foreign('responsible_division_code')
        .references('code').inTable('division_codes')
        .onDelete('SET NULL');
      t.index('responsible_division_code', 'idx_amert_act_div_code');
    });
  }

  // big_tickets.responsibility_code
  if (!(await knex.schema.hasColumn('big_tickets', 'responsibility_code'))) {
    await knex.schema.alterTable('big_tickets', (t) => {
      t.string('responsibility_code', 20).nullable().after('primary_responsibility');
      t.foreign('responsibility_code')
        .references('code').inTable('division_codes')
        .onDelete('SET NULL');
      t.index('responsibility_code', 'idx_bt_resp_code');
    });
  }

  // pirs_completion_stats.responsible_code
  if (!(await knex.schema.hasColumn('pirs_completion_stats', 'responsible_code'))) {
    await knex.schema.alterTable('pirs_completion_stats', (t) => {
      t.string('responsible_code', 20).nullable().after('responsible');
      t.foreign('responsible_code')
        .references('code').inTable('division_codes')
        .onDelete('SET NULL');
      t.index('responsible_code', 'idx_pirs_resp_code');
    });
  }

  // focal_points.division_code
  if (!(await knex.schema.hasColumn('focal_points', 'division_code'))) {
    await knex.schema.alterTable('focal_points', (t) => {
      t.string('division_code', 20).nullable().after('division_name');
      t.foreign('division_code')
        .references('code').inTable('division_codes')
        .onDelete('SET NULL');
      t.index('division_code', 'idx_fp_div_code');
    });
  }

  // division_activity_reports.division_code
  if (!(await knex.schema.hasColumn('division_activity_reports', 'division_code'))) {
    await knex.schema.alterTable('division_activity_reports', (t) => {
      t.string('division_code', 20).nullable().after('division');
      t.foreign('division_code')
        .references('code').inTable('division_codes')
        .onDelete('SET NULL');
      t.index('division_code', 'idx_dar_div_code');
    });
  }

  // ─────────────────────────────────────────────
  // 2. Create junction table: item_contributing_divisions
  // ─────────────────────────────────────────────

  if (!(await knex.schema.hasTable('item_contributing_divisions'))) {
    await knex.schema.createTable('item_contributing_divisions', (t) => {
      t.increments('id').primary();
      t.enum('item_type', ['workplan_item', 'indicator']).notNullable();
      t.integer('item_id').unsigned().notNullable();
      t.string('division_code', 20).notNullable()
        .references('code').inTable('division_codes')
        .onDelete('CASCADE');
      t.timestamps(true, true);

      t.unique(['item_type', 'item_id', 'division_code'], { indexName: 'uq_icd_type_item_div' });
      t.index(['item_type', 'item_id'], 'idx_icd_item');
    });
  }

  // ─────────────────────────────────────────────
  // 3. Data migration — populate FK columns from free-text
  // ─────────────────────────────────────────────

  // Skip data migration if reference tables are empty (fresh DB — seeds haven't run yet)
  const divCount = await knex('division_codes').count('* as c').first();
  if (!divCount.c) {
    console.log('  [233] Skipping data migration — division_codes empty (will be populated by seeds)');
    return;
  }

  // Build case-insensitive lookup (trim whitespace too)
  const lowerMap = {};
  for (const [text, code] of Object.entries(DIVISION_TEXT_TO_CODE)) {
    lowerMap[text.toLowerCase().trim()] = code;
  }

  // Helper: update rows in a table mapping a text column → FK column
  async function migrateColumn(table, textCol, fkCol) {
    const rows = await knex(table).whereNotNull(textCol).select('id', textCol);
    const updates = [];
    for (const row of rows) {
      const raw = (row[textCol] || '').trim();
      const code = lowerMap[raw.toLowerCase()];
      if (code) {
        updates.push({ id: row.id, code });
      }
    }
    // Batch update in chunks of 100
    for (let i = 0; i < updates.length; i += 100) {
      const chunk = updates.slice(i, i + 100);
      for (const { id, code } of chunk) {
        await knex(table).where('id', id).update({ [fkCol]: code });
      }
    }
  }

  await migrateColumn('workplan_items', 'responsible_division', 'responsible_division_code');
  await migrateColumn('amert_activities', 'responsible_division', 'responsible_division_code');
  await migrateColumn('big_tickets', 'primary_responsibility', 'responsibility_code');
  await migrateColumn('pirs_completion_stats', 'responsible', 'responsible_code');

  // Migrate focal_points.division_name → division_code
  // focal_points have structured names — build a secondary map
  const focalMap = {
    'NCDs, Injuries & Mental Health': 'NCD',
    'SRMNCAH / Reproductive Health': 'SRH',
    'Community Health System & Health Promotion': 'CHSISD',
    'Infectious Diseases': 'ID',
    'CLDS (Centre for Lab Diagnostics & Systems)': 'CLDS',
    'Health Workforce Development': 'Wkf',
    'National Public Health Institutes': 'NPHI',
    'Knowledge Management': 'KM',
    'R&D and Clinical Trials': 'SCI',
    'Research for Health System Strengthening': 'SCI',
    'Division of MIS': 'MIS',
    'Digital Health, HIS & Data Governance': 'Digital',
    'Administration, Facilities & Assets Mgmt': 'ASSET',
    'Human Resource Management': 'HR',
    'Supply Chain Management': 'SCM',
    'Finance': 'FMG',
    'Partnership & International Cooperation': 'PIC',
    'Policy and Health Diplomacy': 'PHD',
    'Communications': 'CPI',
    'Local Manufacturing': 'PHAHM',
    'Executive Office': 'DG',
    'Legal Affairs': 'DDS',
    'Health Economics & Financing': 'HEP',
    'Internal Oversight': 'DIO',
    'Planning, Reporting & Accountability': 'PRA',
    'Program Implementation Unit (PIU)': 'PIU',
    'Special Programmes — Youth Division': 'YOUTH',
    'PFM and Lusaka Agenda': 'Cross-cutting',
    'Western Africa RCC': 'WARCC',
    'Eastern Africa RCC': 'EARCC',
    'Central Africa RCC': 'CARCC',
    'Southern Africa RCC': 'SARCC',
    'Northern Africa RCC': 'NARCC',
    'Preparedness, Response & Resilience': 'EPR',
    'AMR & One Health': 'OneH',
    'Surveillance & Disease Intelligence': 'SDI',
  };

  const focalRows = await knex('focal_points').select('id', 'division_name');
  for (const row of focalRows) {
    const code = focalMap[row.division_name];
    if (code) {
      await knex('focal_points').where('id', row.id).update({ division_code: code });
    }
  }
};

exports.down = async function (knex) {
  // Drop junction table
  await knex.schema.dropTableIfExists('item_contributing_divisions');

  // Drop FK columns (reverse order of creation)
  const drops = [
    { table: 'division_activity_reports', col: 'division_code', idx: 'idx_dar_div_code' },
    { table: 'focal_points', col: 'division_code', idx: 'idx_fp_div_code' },
    { table: 'pirs_completion_stats', col: 'responsible_code', idx: 'idx_pirs_resp_code' },
    { table: 'big_tickets', col: 'responsibility_code', idx: 'idx_bt_resp_code' },
    { table: 'amert_activities', col: 'responsible_division_code', idx: 'idx_amert_act_div_code' },
    { table: 'workplan_items', col: 'responsible_division_code', idx: 'idx_wpi_div_code' },
  ];

  for (const { table, col, idx } of drops) {
    if (await knex.schema.hasColumn(table, col)) {
      await knex.schema.alterTable(table, (t) => {
        t.dropForeign(col);
        t.dropIndex(col, idx);
        t.dropColumn(col);
      });
    }
  }
};
