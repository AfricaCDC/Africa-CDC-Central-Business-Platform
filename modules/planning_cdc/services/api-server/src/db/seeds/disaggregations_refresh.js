// Seed/refresh indicator_disaggregations from disaggregations.json
// (monorepo root). Matches existing rows by `name` (case-insensitive) to
// preserve ids, then upserts code+options+category+sort_order. New rows
// inserted. Runs as a standard knex seed: `npx knex seed:run`.
const fs = require('fs');
const path = require('path');

// Category mapping — hand-curated so non-Demographics rows don't all
// fall into "General". Any name not listed goes to "Other".
const CATEGORY = {
  'Sex':                                         'Demographics',
  'Age by Group':                                'Demographics',
  'Member States (MS)':                          'Geography',
  'Region':                                      'Geography',
  'Regional Coordinating Centres (RCCs)':        'Geography',
  'Facility Type':                               'Health Infrastructure',
  'Type of Centre of Excellence (CoE)':          'Health Infrastructure',
  'Type of Staff Hired':                         'Workforce',
  'Type of Contract':                            'Workforce',
  'New Hires Onboarding Period':                 'Workforce',
  'Grade Level':                                 'Workforce',
  'Enrollment Status (Training, Fellowships etc.)': 'Workforce',
  'Type of Separation':                          'Workforce',
  'Training Type':                               'Training & Capacity',
  'Training Programs Areas':                     'Training & Capacity',
  'Type of Person Trained':                      'Training & Capacity',
  'Cadre by Category':                           'Training & Capacity',
  'Field Epidemiology Training Program (FETP)':  'Training & Capacity',
  'Type of SimEX':                               'Public Health Events',
  'Disease Event Type':                          'Public Health Events',
  'Type of Pathogen':                            'Public Health Events',
  'Type of Hazard':                              'Public Health Events',
  'Disease Type':                                'Public Health Events',
  'Type of PHE Preparedness and Response Plans': 'Public Health Events',
  'Type of Sector (One Health)':                 'One Health',
  'Level of One Health Integration':             'One Health',
  'Manufacturing Product by Type':               'Manufacturing & Commodities',
  'Category of Goods':                           'Manufacturing & Commodities',
  'Type of Service':                             'Services & Technical Assistance',
  'Technical Assistance by Type':                'Services & Technical Assistance',
  'Partner Type':                                'Partnerships & Funding',
  'Type of MoU':                                 'Partnerships & Funding',
  'Funding Type':                                'Partnerships & Funding',
  'Investment Cases Developed & by Category':    'Partnerships & Funding',
  'Legal Instrument Developed by Type':          'Legal & Governance',
  'Type of Due Diligence':                       'Legal & Governance',
  'Type of Issue':                               'Legal & Governance',
  'RCCE Reach':                                  'Communication',
  'Type of Media Reach':                         'Communication',
  'Digitization/Automation Status':              'Digital',
};

// Legacy name → new name (so we don't create a duplicate row for the
// old "AU Region" and can just rename it to "Region").
const LEGACY_RENAME = {
  'AU Region':     'Region',
  'Member States': 'Member States (MS)',
};

exports.seed = async function seed(db) {
  const jsonPath = path.resolve(__dirname, '../../../../../disaggregations.json');
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const entries = raw.disaggregations;
  console.log(`Loaded ${entries.length} disaggregations from file`);

  // Rename legacy rows first so the later name match works.
  for (const [oldName, newName] of Object.entries(LEGACY_RENAME)) {
    const hit = await db('indicator_disaggregations').whereRaw('LOWER(name)=?', [oldName.toLowerCase()]).first();
    if (hit) {
      await db('indicator_disaggregations').where('id', hit.id).update({ name: newName });
      console.log(`  • renamed '${oldName}' → '${newName}' (id ${hit.id})`);
    }
  }

  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    const name = e.label;
    const category = CATEGORY[name] || 'Other';
    const optionsJson = JSON.stringify(e.options || []);
    const existing = await db('indicator_disaggregations')
      .whereRaw('LOWER(name)=?', [name.toLowerCase()])
      .first();
    if (existing) {
      await db('indicator_disaggregations').where('id', existing.id).update({
        code: e.code, options: optionsJson, category, sort_order: i,
      });
      updated += 1;
    } else {
      await db('indicator_disaggregations').insert({
        name, code: e.code, options: optionsJson, category, sort_order: i,
      });
      inserted += 1;
    }
  }

  const total = await db('indicator_disaggregations').count('* as n').first();
  console.log(`\nDone. inserted=${inserted}  updated=${updated}  total in DB=${total.n}`);
};
