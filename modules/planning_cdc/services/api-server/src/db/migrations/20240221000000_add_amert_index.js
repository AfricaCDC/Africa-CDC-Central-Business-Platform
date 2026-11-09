/**
 * Add amert_index column to results and indicators tables
 * Stores the AMERT hierarchical code (e.g., 1, 1.1, 1.1.1)
 */
exports.up = async function(knex) {
  // Add amert_index to results table
  const hasResultsCol = await knex.schema.hasColumn('results', 'amert_index');
  if (!hasResultsCol) {
    await knex.schema.alterTable('results', t => {
      t.string('amert_index', 20).nullable().after('code');
    });
  }

  // Add amert_index to indicators table
  const hasIndicatorsCol = await knex.schema.hasColumn('indicators', 'amert_index');
  if (!hasIndicatorsCol) {
    await knex.schema.alterTable('indicators', t => {
      t.string('amert_index', 20).nullable().after('indicator_code');
    });
  }

  // ========================================
  // AMERT hierarchy mapping from Project Proposal 2026
  // Data operations below require seed data (tiers, results, indicators).
  // If tables are empty (fresh DB), skip — seeds + import scripts handle this.
  // ========================================
  const tiersCount = await knex('tiers').count('* as c').first();
  const resultsCount = await knex('results').count('* as c').first();
  if (!tiersCount.c || !resultsCount.c) {
    console.log('  [221] Skipping data operations — reference tables empty (will be populated by seeds)');
    return;
  }

  // Results: Map AMERT outcome/output index to DB results
  // OC-1 (id=1) = the single Outcome
  await knex('results').where('id', 1).update({ amert_index: 'OC' });

  // Outputs: AMERT uses outcome.output numbering
  const outputMapping = {
    2:  '1.1',   // Strengthened Integrated health systems
    3:  '2.1',   // Strengthened health-related surveillance
    4:  '2.2',   // Strengthened emergency preparedness
    5:  '2.3',   // Strengthened National Public Health Institutions
    6:  '2.4',   // Expanded clinical and public health laboratory
    7:  '4.1',   // Expanded health products, technology
    8:  '4.2',   // Enhanced digital and analytics
    9:  '4.3',   // Scaled-up public health workforce
    10: '4.4',   // Strengthened public health research
    11: '5.1',   // Strengthened RCC engagement
    12: '5.2',   // Strengthened governance
    13: '3.1',   // Secured and sustained financing
    14: '3.2',   // Coordinated partnerships
  };

  for (const [id, idx] of Object.entries(outputMapping)) {
    await knex('results').where('id', Number(id)).update({ amert_index: idx });
  }

  // T1 indicators: Outcome Indicators 1-5
  const t1Mapping = {
    21: '1',   // OC Indicator 1: UHC service index
    22: '2',   // OC Indicator 2: IHR implementation
    23: '3',   // OC Indicator 3: 15% government funding
    24: '4',   // OC Indicator 4: Quality health services
    25: '5',   // OC Indicator 5: Support systems
  };

  for (const [id, idx] of Object.entries(t1Mapping)) {
    await knex('indicators').where('id', Number(id)).update({ amert_index: idx });
  }

  // T2 indicators: Output Indicators X.Y.Z
  // Format: outcome_number.output_number.indicator_number
  const t2Mapping = {
    // Output 1.1 indicators (goal_id=2)
    26: '1.1.1',  // Reduction of premature mortality from NCDs
    27: '1.1.2',  // Ratio of 25 CHW per 10,000
    28: '1.1.3',  // Reduction of Maternal Mortality ratio
    29: '1.1.4',  // Coverage of DPT3 > 90%
    30: '1.1.5',  // Implementing Lusaka Agenda

    // Output 2.1 indicators (goal_id=3)
    31: '2.1.1',  // 7-1-7 timeline for public health events
    32: '2.1.2',  // Multisectoral one health coordination
    33: '2.1.3',  // Continental interactive analytic platform
    34: '2.1.4',  // Reduction in AMR incidence
    35: '2.1.5',  // Health Information Exchange standards

    // Output 2.2 indicators (goal_id=4)
    36: '2.2.1',  // Response to emergencies within 7 days
    37: '2.2.2',  // IHR core capacity status of 50%
    38: '2.2.3',  // Cross-border coordination mechanisms

    // Output 2.3 indicators (goal_id=5)
    39: '2.3.1',  // Legally established NPHIs
    40: '2.3.2',  // NPHI Centers of Excellence
    41: '2.3.3',  // NPHIs with improved capacity
    // Note: 2.3.4 in AMERT but we only have 3 indicators for this output in DB

    // Output 2.4 indicators (goal_id=6)
    42: '2.4.1',  // Laboratory governance and quality
    43: '2.4.2',  // Laboratory capacity geomaped
    44: '2.4.3',  // Molecular detection of pathogens
    45: '2.4.4',  // Access to quality diagnostics
    46: '2.4.5',  // Africa CDC laboratory operationalised

    // Output 3.1 indicators (goal_id=13)
    67: '3.1.1',  // Abuja declaration 15% allocation
    68: '3.1.2',  // External funding country-driven
    69: '3.1.3',  // Evidence-informed priority setting
    70: '3.1.4',  // Regional financing mechanisms

    // Output 3.2 indicators (goal_id=14)
    71: '3.2.1',  // Partners aligned with Africa CDC vision
    72: '3.2.2',  // Mobilized support toward strategic priorities
    // Note: 3.2.3 in AMERT but may need to add

    // Output 4.1 indicators (goal_id=7)
    47: '4.1.1',  // APPM procurement
    48: '4.1.2',  // Investment for local manufacturing
    49: '4.1.3',  // Infrastructure for manufacturing
    50: '4.1.4',  // Biotechnology for vaccines

    // Output 4.2 indicators (goal_id=8)
    51: '4.2.1',  // Digital health governance
    52: '4.2.2',  // Local digital health innovations
    // Note: AMERT has 4.2.2=Proportion PHCs digitalized, 4.2.3=adopting innovations
    // DB has only 2 indicators here

    // Output 4.3 indicators (goal_id=9)
    53: '4.3.1',  // Public health workforce needs
    54: '4.3.2',  // RCCNs established
    55: '4.3.3',  // Trained workforce increase
    56: '4.3.4',  // Retention rate workforce

    // Output 4.4 indicators (goal_id=10)
    57: '4.4.1',  // National Health Research Agenda
    58: '4.4.2',  // Research and development outputs
    59: '4.4.3',  // Knowledge generation and translation

    // Output 5.1 indicators (goal_id=11)
    60: '5.1.1',  // RCC functionality benchmarks
    61: '5.1.2',  // RCC initiatives health service delivery
    62: '5.1.3',  // Health improvements from RCC activities

    // Output 5.2 indicators (goal_id=12)
    63: '5.2.1',  // Africa CDC Statute 2.0
    64: '5.2.2',  // Diversity and disbursement efficiency
    65: '5.2.3',  // Human Resource capacity
    66: '5.2.4',  // Operational functions digitized
  };

  for (const [id, idx] of Object.entries(t2Mapping)) {
    await knex('indicators').where('id', Number(id)).update({ amert_index: idx });
  }

  // ========================================
  // Add outcome_indicator_id to results table
  // Links each Output to its parent Outcome Indicator (T1)
  // ========================================
  const hasOcIndCol = await knex.schema.hasColumn('results', 'outcome_indicator_id');
  if (!hasOcIndCol) {
    await knex.schema.alterTable('results', t => {
      t.integer('outcome_indicator_id').unsigned().nullable()
        .references('id').inTable('indicators').after('amert_index');
    });
  }

  // Map outputs to their parent Outcome Indicator
  // OC Indicator 1 (id=21) → Output 1.1 (id=2)
  // OC Indicator 2 (id=22) → Outputs 2.1-2.4 (ids 3,4,5,6)
  // OC Indicator 3 (id=23) → Outputs 3.1-3.2 (ids 13,14)
  // OC Indicator 4 (id=24) → Outputs 4.1-4.4 (ids 7,8,9,10)
  // OC Indicator 5 (id=25) → Outputs 5.1-5.2 (ids 11,12)
  const ocMapping = {
    2: 21,   // Output 1.1 → OC Indicator 1
    3: 22,   // Output 2.1 → OC Indicator 2
    4: 22,   // Output 2.2 → OC Indicator 2
    5: 22,   // Output 2.3 → OC Indicator 2
    6: 22,   // Output 2.4 → OC Indicator 2
    13: 23,  // Output 3.1 → OC Indicator 3
    14: 23,  // Output 3.2 → OC Indicator 3
    7: 24,   // Output 4.1 → OC Indicator 4
    8: 24,   // Output 4.2 → OC Indicator 4
    9: 24,   // Output 4.3 → OC Indicator 4
    10: 24,  // Output 4.4 → OC Indicator 4
    11: 25,  // Output 5.1 → OC Indicator 5
    12: 25,  // Output 5.2 → OC Indicator 5
  };

  for (const [resultId, ocIndId] of Object.entries(ocMapping)) {
    await knex('results').where('id', Number(resultId)).update({ outcome_indicator_id: ocIndId });
  }

  // ========================================
  // Insert missing T2 indicators from AMERT
  // ========================================

  // Missing 2.3.4: Percentage of NPHIs linked to collaborative initiatives (already in DB as id=41)
  // Actually id=41 name matches - it's already there as code 4.3, so the mapping above is correct

  // Missing 3.2.3: Number of MS with structured strategy for community health needs
  const existing3_2_3 = await knex('indicators')
    .where('goal_id', 14)
    .where('indicator_name', 'like', '%structured strategy%')
    .first();
  if (!existing3_2_3) {
    await knex('indicators').insert({
      indicator_code: '13.3',
      amert_index: '3.2.3',
      indicator_name: 'Number of Member States with a structured strategy to identify and address community and public health needs',
      indicator_type: 'Outcome',
      tier_id: 2,
      goal_id: 14,
      baseline_value: '40',
      target_fy1: '45',
      target_fy2: '50',
      target_fy3: '55',
      is_active: true,
    });
  }

  // Missing 4.2.2 (AMERT): Proportion of PHCs with health systems digitalized
  // DB has 4.2.1 (id=51) and 4.2.2=adopting innovations (id=52)
  // Need to insert 4.2.2 (proportion PHCs) and re-index 52 to 4.2.3
  const existing4_2_2 = await knex('indicators')
    .where('goal_id', 8)
    .where('indicator_name', 'like', '%PHC%digital%')
    .first();
  if (!existing4_2_2) {
    await knex('indicators').insert({
      indicator_code: '7.2b',
      amert_index: '4.2.2',
      indicator_name: 'Proportion of PHCs with health systems digitalized',
      indicator_type: 'Outcome',
      tier_id: 2,
      goal_id: 8,
      baseline_value: '0',
      target_fy1: '20',
      target_fy2: '35',
      target_fy3: '45',
      is_active: true,
    });
    // Update existing id=52 from 4.2.2 to 4.2.3
    await knex('indicators').where('id', 52).update({ amert_index: '4.2.3' });
  }
};

exports.down = async function(knex) {
  const hasOcIndCol = await knex.schema.hasColumn('results', 'outcome_indicator_id');
  if (hasOcIndCol) {
    await knex.schema.alterTable('results', t => {
      t.dropColumn('outcome_indicator_id');
    });
  }

  const hasResultsCol = await knex.schema.hasColumn('results', 'amert_index');
  if (hasResultsCol) {
    await knex.schema.alterTable('results', t => {
      t.dropColumn('amert_index');
    });
  }

  const hasIndicatorsCol = await knex.schema.hasColumn('indicators', 'amert_index');
  if (hasIndicatorsCol) {
    await knex.schema.alterTable('indicators', t => {
      t.dropColumn('amert_index');
    });
  }

  // Remove inserted indicators
  await knex('indicators').where('amert_index', '3.2.3').del();
  await knex('indicators').where('amert_index', '4.2.2').del();
};
