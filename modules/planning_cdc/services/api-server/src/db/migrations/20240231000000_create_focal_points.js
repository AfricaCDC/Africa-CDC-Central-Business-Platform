/**
 * Migration: Create focal_points table
 *
 * Replaces all hardcoded division names and person names in workplan_items.
 * Single source of truth: division → focal person (CBP staff ID).
 *
 * workplan_items.responsible_division (free text) → focal_point_id (FK)
 */

exports.up = async function (knex) {
  // 1. Create focal_points table
  await knex.schema.createTable('focal_points', (t) => {
    t.increments('id').primary();
    t.string('directorate', 200).nullable();       // Directorate / Centre
    t.string('division_name', 200).notNullable();  // Official division name
    t.string('cbp_staff_id', 50).nullable();       // CBP staff ID of focal person
    t.string('focal_person_name', 200).nullable(); // Display name (read-only, from CBP)
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);

    t.unique('division_name');
  });

  // 2. Seed from official Focal Points Excel data
  await knex('focal_points').insert([
    { directorate: 'Executive Office',                           division_name: 'Executive Office',                              focal_person_name: 'Kidist Berhane' },
    { directorate: 'Executive Office',                           division_name: 'Legal Affairs',                                 focal_person_name: 'Christine Fortunate' },
    { directorate: 'Executive Office',                           division_name: 'Health Economics & Financing',                  focal_person_name: 'Dr. Elias Asfaw' },
    { directorate: 'Executive Office',                           division_name: 'Internal Oversight',                            focal_person_name: 'Sheila Koburungi' },
    { directorate: 'Executive Office',                           division_name: 'Planning, Reporting & Accountability',          focal_person_name: null },
    { directorate: 'Executive Office',                           division_name: 'Program Implementation Unit (PIU)',             focal_person_name: 'Dr. Micheal Olugbile' },
    { directorate: 'Executive Office',                           division_name: 'Special Programmes — Youth Division',           focal_person_name: 'Dr. Chrys Kaniki' },
    { directorate: 'Executive Office',                           division_name: 'PFM and Lusaka Agenda',                        focal_person_name: null },
    { directorate: 'Executive Office',                           division_name: 'Western Africa RCC',                           focal_person_name: 'Dr. Adunlola Adegoke' },
    { directorate: 'Executive Office',                           division_name: 'Eastern Africa RCC',                           focal_person_name: 'Diana Doyle' },
    { directorate: 'Executive Office',                           division_name: 'Central Africa RCC',                           focal_person_name: 'Dr. Kima Appollonia' },
    { directorate: 'Executive Office',                           division_name: 'Southern Africa RCC',                          focal_person_name: 'Tendai Chipendo' },
    { directorate: 'Executive Office',                           division_name: 'Northern Africa RCC',                          focal_person_name: 'Ahmed Ashmawy' },
    { directorate: 'Centre for Public Health Emergencies',       division_name: 'Preparedness, Response & Resilience',          focal_person_name: 'Edouard Nkunzimana' },
    { directorate: 'Centre for Public Health Emergencies',       division_name: 'AMR & One Health',                             focal_person_name: 'Dr. Yewande Alimi' },
    { directorate: 'Centre for Public Health Emergencies',       division_name: 'Surveillance & Disease Intelligence',          focal_person_name: 'Mallion Kangume' },
    { directorate: 'Centre for Primary Healthcare',              division_name: 'NCDs, Injuries & Mental Health',               focal_person_name: 'Betty Ingabire Kabarega' },
    { directorate: 'Centre for Primary Healthcare',              division_name: 'SRMNCAH / Reproductive Health',                focal_person_name: 'Ebba Secka' },
    { directorate: 'Centre for Primary Healthcare',              division_name: 'Community Health System & Health Promotion',   focal_person_name: 'Thaddee Niyoyitungira' },
    { directorate: 'Centre for Primary Healthcare',              division_name: 'Infectious Diseases',                          focal_person_name: 'Dr. Serge Batcho' },
    { directorate: 'Centre for Laboratory Systems & Diagnostics',division_name: 'CLDS (Centre for Lab Diagnostics & Systems)',  focal_person_name: 'Donewell Bangure' },
    { directorate: 'Centre for Public Health Institutions',      division_name: 'Health Workforce Development',                 focal_person_name: 'Dr. Tiruneh Amsalu Baye' },
    { directorate: 'Centre for Public Health Institutions',      division_name: 'National Public Health Institutes',            focal_person_name: 'Farha Hussein Elduma Abdalla' },
    { directorate: 'Dir. of Science & Innovations',              division_name: 'Knowledge Management',                         focal_person_name: 'Nebiyou' },
    { directorate: 'Dir. of Science & Innovations',              division_name: 'R&D and Clinical Trials',                      focal_person_name: 'Moses Bamutura' },
    { directorate: 'Dir. of Science & Innovations',              division_name: 'Research for Health System Strengthening',     focal_person_name: 'Tamrat' },
    { directorate: 'Dir. of Administration',                     division_name: 'Division of MIS',                              focal_person_name: 'Dennis Kibiye' },
    { directorate: 'Dir. of Administration',                     division_name: 'Digital Health, HIS & Data Governance',       focal_person_name: 'Judith Nguimfack' },
    { directorate: 'Dir. of Administration',                     division_name: 'Administration, Facilities & Assets Mgmt',    focal_person_name: 'Catherine Garba' },
    { directorate: 'Dir. of Administration',                     division_name: 'Human Resource Management',                   focal_person_name: 'Caroline Njiinu' },
    { directorate: 'Dir. of Administration',                     division_name: 'Supply Chain Management',                     focal_person_name: 'Noline Okech' },
    { directorate: 'Dir. of Finance',                            division_name: 'Finance',                                      focal_person_name: 'Nonofo Gelekhutle' },
    { directorate: 'Dir. External Relations & Strategic Engagement', division_name: 'Partnership & International Cooperation', focal_person_name: 'Meseret A. Yenehun' },
    { directorate: 'Dir. External Relations & Strategic Engagement', division_name: 'Policy and Health Diplomacy',             focal_person_name: 'Ereena Sackey' },
    { directorate: 'Dir. Communications & Public Information',   division_name: 'Communications',                               focal_person_name: 'Paidamoyo Magaya' },
    { directorate: 'PHAHM (Local Manufacturing)',                division_name: 'Local Manufacturing',                          focal_person_name: 'Yared Yiegezu Zegiorgis' },
  ]);

  // 3. Add focal_point_id to workplan_items (nullable FK)
  await knex.schema.alterTable('workplan_items', (t) => {
    t.integer('focal_point_id').unsigned().nullable().after('responsible_division');
    t.foreign('focal_point_id').references('id').inTable('focal_points').onDelete('SET NULL');
    t.index('focal_point_id', 'idx_wpi_focal_point');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('workplan_items', (t) => {
    t.dropForeign('focal_point_id');
    t.dropIndex('focal_point_id', 'idx_wpi_focal_point');
    t.dropColumn('focal_point_id');
  });
  await knex.schema.dropTableIfExists('focal_points');
};
