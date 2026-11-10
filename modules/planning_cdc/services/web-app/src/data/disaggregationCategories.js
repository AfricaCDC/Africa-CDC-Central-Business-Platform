/**
 * Disaggregation categories from the official Africa CDC quarterly reporting
 * template ("template indicators disagregated.docx").
 *
 * Each category is a structured object:
 *   {
 *     key:        unique slug used in the JSON payload
 *     label:      human-readable name shown in the UI
 *     description (optional): one-line tooltip
 *     options:    array of { key, label } — value entered per option
 *     special?:   one of 'member_states' (renders the multi-select picker
 *                 instead of plain numeric inputs)
 *     icon?:      lucide icon name (optional, for visual grouping)
 *     group:      logical grouping shown in the picker
 *   }
 *
 * Sums: each category's option values should add up to the total Results
 * Achieved when the disaggregation is exhaustive (e.g. Sex). The form shows
 * a live sum check but does not block submission — the user knows best when
 * partial breakdowns are acceptable.
 */

export const DISAGGREGATION_CATEGORIES = [
  // ── Demographics ────────────────────────────────────────────────
  {
    key: 'sex',
    label: 'Sex',
    group: 'Demographics',
    description: 'Breakdown by biological sex',
    options: [
      { key: 'male',   label: 'Male' },
      { key: 'female', label: 'Female' },
    ],
  },
  {
    key: 'age_group',
    label: 'Age by Group',
    group: 'Demographics',
    description: 'Standard WHO age brackets',
    options: [
      { key: 'under_5',     label: '<5 years (Under-five children)' },
      { key: 'school_age',  label: '5–14 years (School-age children)' },
      { key: 'youth',       label: '15–24 years (Youth)' },
      { key: 'reproductive',label: '15–49 years (Reproductive Age)' },
      { key: 'older_adult', label: '50–60 years (Older Adults)' },
      { key: 'elderly',     label: '60+ years (Elderly Population)' },
    ],
  },

  // ── Geography ───────────────────────────────────────────────────
  {
    key: 'member_states',
    label: 'Member States (MS)',
    group: 'Geography',
    description: 'Multi-select from the 55 AU member states + total count',
    special: 'member_states',
    options: [],
  },
  {
    key: 'region',
    label: 'AU Region',
    group: 'Geography',
    description: 'AU geographic regions',
    options: [
      { key: 'central',  label: 'Central'  },
      { key: 'eastern',  label: 'Eastern'  },
      { key: 'southern', label: 'Southern' },
      { key: 'northern', label: 'Northern' },
      { key: 'western',  label: 'Western'  },
    ],
  },
  {
    key: 'rcc',
    label: 'Regional Coordinating Centres (RCCs)',
    group: 'Geography',
    options: [
      { key: 'central',  label: 'Central'  },
      { key: 'eastern',  label: 'Eastern'  },
      { key: 'southern', label: 'Southern' },
      { key: 'northern', label: 'Northern' },
      { key: 'western',  label: 'Western'  },
    ],
  },

  // ── Health Facilities ───────────────────────────────────────────
  {
    key: 'facility_type',
    label: 'Facility Type',
    group: 'Facilities',
    options: [
      { key: 'primary',   label: 'Primary'   },
      { key: 'secondary', label: 'Secondary' },
      { key: 'tertiary',  label: 'Tertiary'  },
    ],
  },

  // ── Workforce / HR ──────────────────────────────────────────────
  {
    key: 'staff_hired_type',
    label: 'Type of Staff Hired',
    group: 'Workforce',
    options: [
      { key: 'internal', label: 'Internal' },
      { key: 'external', label: 'External' },
    ],
  },
  {
    key: 'contract_type',
    label: 'Type of Contract',
    group: 'Workforce',
    options: [
      { key: 'regular',     label: 'Regular'     },
      { key: 'fixed_term',  label: 'Fixed-term'  },
      { key: 'short_term',  label: 'Short-term'  },
      { key: 'consultancy', label: 'Consultancy' },
      { key: 'seconded',    label: 'Seconded'    },
    ],
  },
  {
    key: 'grade_level',
    label: 'Grade Level',
    group: 'Workforce',
    options: [
      { key: 'p1_p2',  label: 'P1–P2' },
      { key: 'p3_p4',  label: 'P3–P4' },
      { key: 'p5_plus',label: 'P5 & Above' },
    ],
  },
  {
    key: 'separation_type',
    label: 'Type of Separation',
    group: 'Workforce',
    options: [
      { key: 'voluntary',   label: 'Voluntary'   },
      { key: 'involuntary', label: 'Involuntary' },
    ],
  },
  {
    key: 'cadre',
    label: 'Cadre by Category',
    group: 'Workforce',
    options: [
      { key: 'medical',          label: 'Medical Staff' },
      { key: 'non_medical',      label: 'Non-Medical Staff' },
      { key: 'technical',        label: 'Technical Staff' },
      { key: 'admin',            label: 'Administrative Staff' },
      { key: 'hcw',              label: 'Healthcare Workers' },
      { key: 'pho',              label: 'Public Health Officers' },
      { key: 'crvs',             label: 'CRVS' },
      { key: 'health_managers',  label: 'Health Managers' },
      { key: 'data_managers',    label: 'Health Information Officers / Data Managers / M&E' },
      { key: 'senior_officials', label: 'Senior Management / Officials' },
      { key: 'epidemiologists',  label: 'Field Epidemiologists' },
      { key: 'csos',             label: 'CSOs' },
      { key: 'media',            label: 'Media' },
      { key: 'service_providers',label: 'Service Providers' },
      { key: 'frontline',        label: 'Frontline Workers' },
      { key: 'chws',             label: 'Community Health Workers' },
      { key: 'other',            label: 'Others' },
    ],
  },
  {
    key: 'person_trained_type',
    label: 'Type of Person Trained',
    group: 'Workforce',
    options: [
      { key: 'internal', label: 'Internal' },
      { key: 'external', label: 'External' },
    ],
  },

  // ── Training ────────────────────────────────────────────────────
  {
    key: 'training_type',
    label: 'Training Type',
    group: 'Training',
    options: [
      { key: 'long_term',          label: 'Long-term Courses (6 Months & Above)' },
      { key: 'short_term',         label: 'Short-term Courses (3–6 Months or Below)' },
      { key: 'peer_to_peer',       label: 'Peer-to-peer Learning' },
      { key: 'conferences',        label: 'Conferences' },
      { key: 'webinars',           label: 'Webinars' },
      { key: 'symposiums',         label: 'Symposiums' },
      { key: 'afphc',              label: 'Africa CDC Public Health Corps (AfPHC)' },
      { key: 'scholarship',        label: 'Scholarship Health Programmes' },
      { key: 'kofi_annan',         label: 'Kofi Annan Fellowship Programme' },
      { key: 'other_fellowship',   label: 'Other Fellowships Programmes' },
      { key: 'young_pro',          label: 'Young Professional Programmes' },
      { key: 'other',              label: 'Others' },
    ],
  },
  {
    key: 'training_areas',
    label: 'Training Programs Areas',
    group: 'Training',
    options: [
      { key: 'supply_chain',     label: 'Supply Chain & Logistics Management' },
      { key: 'surveillance',     label: 'Surveillance & Disease Intelligence' },
      { key: 'data_science',     label: 'Data Science and Visualization' },
      { key: 'ai_ml',            label: 'Artificial Intelligence, Modelling and Machine Learning' },
      { key: 'compliance_ethics',label: 'Compliance and Ethics' },
      { key: 'mel',              label: 'Monitoring and Evaluation' },
      { key: 'risk_management',  label: 'Risk Management' },
      { key: 'legal_affairs',    label: 'Legal Affairs' },
      { key: 'rcce_sbc',         label: 'RCCE / SBC' },
      { key: 'research_km',      label: 'Research & Knowledge Management' },
      { key: 'digital_health',   label: 'Digital Health, IT' },
      { key: 'other',            label: 'Others' },
    ],
  },
  {
    key: 'fetp_level',
    label: 'Field Epidemiology Training Program (FETP)',
    group: 'Training',
    options: [
      { key: 'frontline',    label: 'Frontline'    },
      { key: 'intermediate', label: 'Intermediate' },
    ],
  },

  // ── Public Health Emergency ─────────────────────────────────────
  {
    key: 'simex_type',
    label: 'Type of SimEX',
    group: 'Public Health Emergency',
    description: 'Simulation exercises',
    options: [
      { key: 'ttx',         label: 'Advanced Tabletop (TTX)' },
      { key: 'drill',       label: 'Drill' },
      { key: 'full_scale',  label: 'Full-Scale' },
      { key: 'functional',  label: 'Functional' },
    ],
  },
  {
    key: 'disease_event_type',
    label: 'Disease Event Type',
    group: 'Public Health Emergency',
    options: [
      { key: 'infectious',     label: 'Infectious Disease'    },
      { key: 'zoonotic',       label: 'Zoonotic Disease'      },
      { key: 'food_waterborne',label: 'Food / Waterborne Disease' },
      { key: 'environmental',  label: 'Environmental Hazard'  },
    ],
  },
  {
    key: 'pathogen_type',
    label: 'Type of Pathogen',
    group: 'Public Health Emergency',
    options: [
      { key: 'vhf',                  label: 'VHF (Viral Haemorrhagic Fever)' },
      { key: 'epidemic_prone',       label: 'Other Epidemic-prone pathogens' },
    ],
  },
  {
    key: 'hazard_type',
    label: 'Type of Hazard',
    group: 'Public Health Emergency',
    options: [
      { key: 'biological',  label: 'Biological (Bacteria, Viruses, Parasites, Mycotoxins)' },
      { key: 'chemical',    label: 'Chemical (Pesticides, residues, heavy metals, contaminants)' },
      { key: 'physical',    label: 'Physical (Glass, metal fragments, plastic, pest droppings)' },
      { key: 'allergenic',  label: 'Allergenic (EU 14 listed allergens — peanuts, milk, etc.)' },
      { key: 'radiological',label: 'Radiological (radioactive contamination)' },
    ],
  },
  {
    key: 'disease_type',
    label: 'Disease Type',
    group: 'Public Health Emergency',
    options: [
      { key: 'hiv',     label: 'HIV' },
      { key: 'tb',      label: 'TB' },
      { key: 'malaria', label: 'Malaria' },
      { key: 'ntds',    label: 'NTDs' },
      { key: 'mpox',    label: 'Mpox' },
      { key: 'ebola',   label: 'Ebola' },
      { key: 'marburg', label: 'Marburg' },
      { key: 'cholera', label: 'Cholera' },
      { key: 'hf',      label: 'Haemorrhagic Fever' },
      { key: 'other',   label: 'Others' },
    ],
  },
  {
    key: 'phe_plan_type',
    label: 'Type of PHE Preparedness & Response Plans',
    group: 'Public Health Emergency',
    options: [
      { key: 'naphs',         label: 'National Action Planning for Health Security (NAPHS)' },
      { key: 'multi_hazard',  label: 'Multi-Hazard and Multi-Sectoral Plan' },
      { key: 'contingency',   label: 'Contingency Plan' },
    ],
  },

  // ── One Health ──────────────────────────────────────────────────
  {
    key: 'oh_sector',
    label: 'Type of Sector (One Health)',
    group: 'One Health',
    options: [
      { key: 'animal',      label: 'Animal'      },
      { key: 'human',       label: 'Human'       },
      { key: 'environment', label: 'Environment' },
    ],
  },
  {
    key: 'oh_integration',
    label: 'Level of OH Integration',
    group: 'One Health',
    options: [
      { key: 'human_animal',         label: 'Human–Animal (Partial One Health)' },
      { key: 'human_animal_env',     label: 'Human–Animal–Environment (Full One Health)' },
    ],
  },

  // ── Labs / Manufacturing / CoE ─────────────────────────────────
  {
    key: 'coe_type',
    label: 'Type of Centre of Excellence (CoE)',
    group: 'Labs & Manufacturing',
    options: [
      { key: 'regional_lab',   label: 'Regional Reference Lab' },
      { key: 'national_lab',   label: 'National Diagnostic Lab' },
      { key: 'biobank_node',   label: 'Specialized Biobank Node' },
      { key: 'manufacturing',  label: 'Manufacturing' },
    ],
  },
  {
    key: 'product_type',
    label: 'Product by Type',
    group: 'Labs & Manufacturing',
    options: [
      { key: 'vaccine',     label: 'Vaccine'     },
      { key: 'diagnostic',  label: 'Diagnostic'  },
      { key: 'therapeutic', label: 'Therapeutic' },
    ],
  },
  {
    key: 'goods_category',
    label: 'Category of Goods',
    group: 'Labs & Manufacturing',
    options: [
      { key: 'medical',     label: 'Medical (Vaccines, Therapeutics, Diagnostics)' },
      { key: 'non_medical', label: 'Non-Medical (IPC items, equipment, office assets)' },
    ],
  },
  {
    key: 'service_type',
    label: 'Type of Service',
    group: 'Procurement & Services',
    options: [
      { key: 'consultancy_it',   label: 'Consultancy IT'   },
      { key: 'software_facility',label: 'Software Facility Management' },
      { key: 'maintenance',      label: 'Maintenance'      },
      { key: 'temp_staffing',    label: 'Temporary Staffing' },
    ],
  },

  // ── Technical Assistance ───────────────────────────────────────
  {
    key: 'ta_type',
    label: 'Technical Assistance by Type',
    group: 'Technical Assistance',
    options: [
      { key: 'financial',         label: 'Financial Support' },
      { key: 'technical',         label: 'Technical Support' },
      { key: 'infrastructure',    label: 'Infrastructure Support' },
      { key: 'mass_campaign',     label: 'Mass Campaign' },
      { key: 'expert_deployment', label: 'Expert Deployment' },
      { key: 'advocacy_rm',       label: 'Advocacy & Resource Mobilization' },
      { key: 'rcce_sbc',          label: 'RCCE & SBC (Demand Generation)' },
      { key: 'strategic_doc',     label: 'Strategic / Policy Documents (Framework, SOP, Toolkit, etc.)' },
      { key: 'logistical',        label: 'Logistical Support (vaccines, PPE, IEC, equipment, CCE)' },
      { key: 'social_events',     label: 'Social Events (Side Events, Health Walk/Talk)' },
      { key: 'health_education',  label: 'Health Education & Promotion' },
      { key: 'conferences',       label: 'Conferences / Symposia / Webinars' },
      { key: 'coordination',      label: 'Coordination platforms, TWGs, Taskforces, COPs' },
      { key: 'capacity_building', label: 'Capacity Building & Training' },
      { key: 'workshops',         label: 'Workshops / Meetings' },
      { key: 'other',             label: 'Others' },
    ],
  },

  // ── Partners & Funding ─────────────────────────────────────────
  {
    key: 'partner_type',
    label: 'Partner Type',
    group: 'Partners & Funding',
    options: [
      { key: 'government',         label: 'Government / Member States' },
      { key: 'academic',           label: 'Academic' },
      { key: 'private_sector',     label: 'Private Sector' },
      { key: 'development_partner',label: 'Development Partner' },
      { key: 'implementing_partner',label: 'Implementing Partner' },
      { key: 'donor',              label: 'Donor' },
    ],
  },
  {
    key: 'mou_type',
    label: 'Type of MoU',
    group: 'Partners & Funding',
    options: [
      { key: 'member_states', label: 'Member States' },
      { key: 'recs',          label: 'RECs' },
      { key: 'partners',      label: 'Partners' },
    ],
  },
  {
    key: 'funding_type',
    label: 'Funding Type',
    group: 'Partners & Funding',
    options: [
      { key: 'domestic',     label: 'Domestic' },
      { key: 'donor',        label: 'Donor' },
      { key: 'both',         label: 'Both (Domestic + Donor)' },
    ],
  },
  {
    key: 'investment_cases',
    label: 'Investment Cases Developed by Category',
    group: 'Partners & Funding',
    options: [
      { key: 'internal_total', label: 'Total Number Internally' },
      { key: 'external_total', label: 'Total Number Externally' },
      { key: 'chws',           label: 'CHWs' },
      { key: 'rcce',           label: 'RCCE' },
      { key: 'phc',            label: 'PHC' },
      { key: 'oh',             label: 'One Health' },
      { key: 'nphi',           label: 'NPHI' },
      { key: 'ncds',           label: 'NCDs' },
      { key: 'mh',             label: 'Mental Health' },
      { key: 'lab',            label: 'Lab' },
      { key: 'other',          label: 'Others' },
    ],
  },

  // ── Legal / Compliance ─────────────────────────────────────────
  {
    key: 'legal_instrument_type',
    label: 'Legal Instrument Developed by Type',
    group: 'Legal & Compliance',
    options: [
      { key: 'biosafety',  label: 'Biosafety and Biosecurity Laws' },
      { key: 'ipc',        label: 'IPC Laws' },
      { key: 'nphi',       label: 'NPHI Laws' },
      { key: 'pheocs',     label: 'PHEOCs Laws' },
      { key: 'other',      label: 'Others' },
    ],
  },
  {
    key: 'due_diligence_type',
    label: 'Type of Due Diligence',
    group: 'Legal & Compliance',
    options: [
      { key: 'internal', label: 'Internal' },
      { key: 'external', label: 'External' },
    ],
  },
  {
    key: 'issue_type',
    label: 'Type of Issue',
    group: 'Legal & Compliance',
    options: [
      { key: 'ethical',    label: 'Ethical'    },
      { key: 'compliance', label: 'Compliance' },
      { key: 'legal',      label: 'Legal'      },
    ],
  },

  // ── Communications & Outreach ──────────────────────────────────
  {
    key: 'rcce_reach',
    label: 'RCCE Reach',
    group: 'Communications',
    options: [
      { key: 'community_engagement', label: 'Community Engagement Platforms' },
      { key: 'social_media',         label: 'Social Media' },
      { key: 'digital',              label: 'Digital Platforms' },
      { key: 'other',                label: 'Others' },
    ],
  },
  {
    key: 'media_reach_type',
    label: 'Type of Media Reach',
    group: 'Communications',
    options: [
      { key: 'social_media',  label: 'Social Media (Facebook, X/Twitter, WhatsApp, LinkedIn, YouTube)' },
      { key: 'interactive',   label: 'Interactive (Websites, Blogs, Polls, Podcasts, video streaming)' },
      { key: 'traditional',   label: 'Traditional (TV, Radio, Newspapers, Magazines, Billboards, Posters)' },
      { key: 'interpersonal', label: 'Interpersonal (SMS, Phone Calls, Video Calls)' },
    ],
  },
];

/**
 * Logical group labels used by the disaggregation picker UI to organise
 * categories into collapsible sections.
 *
 * @type {string[]}
 */
export const DISAGGREGATION_GROUPS = [
  'Demographics',
  'Geography',
  'Facilities',
  'Workforce',
  'Training',
  'Public Health Emergency',
  'One Health',
  'Labs & Manufacturing',
  'Procurement & Services',
  'Technical Assistance',
  'Partners & Funding',
  'Legal & Compliance',
  'Communications',
];

/**
 * Look up a disaggregation category descriptor by its slug key.
 *
 * @param {string} key — category slug (e.g. 'sex', 'age_group')
 * @returns {object|undefined} matching category object or undefined if not found
 */
export const findCategory = (key) => DISAGGREGATION_CATEGORIES.find(c => c.key === key);
