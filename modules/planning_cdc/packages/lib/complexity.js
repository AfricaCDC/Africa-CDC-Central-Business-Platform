'use strict';

/**
 * @rbm/lib/complexity — CJS mirror (D-20261026-01).
 *
 * Decision Complexity Screening of an AWP activity: the agreed interface
 * wording (screening question, five criteria, Low / Moderate / High), the
 * rating anchors and the provisional scoring bands of the guidance note.
 * Mirror of ./complexity.mjs (ESM). Both files MUST stay in lockstep.
 */

const COMPLEXITY_QUESTION = 'Does the implementation of this planned activity require complex decision-making?';

const COMPLEXITY_RATINGS = Object.freeze([
  { value: 1, label: 'Low' },
  { value: 2, label: 'Moderate' },
  { value: 3, label: 'High' },
]);

const COMPLEXITY_CRITERIA = Object.freeze([
  { key: 'information_requirements', label: 'Information Requirements', description: 'Level of evidence and analysis required',
    anchors: ['Existing reliable information is sufficient.', 'Additional evidence or analysis is needed.', 'Significant evidence gaps, conflicting sources or specialised analysis.'] },
  { key: 'stakeholder_involvement', label: 'Stakeholder Involvement', description: 'Level of engagement and coordination required',
    anchors: ['Few stakeholders; coordination within one unit.', 'Several units or partners need consultation.', 'Multiple institutions or sensitive interests require extensive coordination.'] },
  { key: 'scope_impact', label: 'Scope & Impact', description: 'Scale and potential organisational or programmatic impact',
    anchors: ['Limited effects on one activity or unit.', 'Effects across multiple units, programmes or locations.', 'Major strategic, organisational or cross-country implications.'] },
  { key: 'process_timeframe', label: 'Process Steps & Timeframe', description: 'Complexity of steps, approvals and delivery timelines',
    anchors: ['Routine steps and predictable approvals.', 'Several linked steps, approvals or time constraints.', 'Highly interdependent steps, critical approvals or severe time pressure.'] },
  { key: 'risk_uncertainty', label: 'Risk & Uncertainty', description: 'Level of uncertainty and potential consequences',
    anchors: ['Risks are familiar, manageable and low consequence.', 'Meaningful uncertainty requiring mitigation.', 'High uncertainty or potentially severe, difficult-to-reverse consequences.'] },
]);

// Provisional cut-offs for piloting, not approved institutional thresholds.
const COMPLEXITY_BANDS = Object.freeze([
  { key: 'LOWER', min: 5, max: 7, label: 'Lower complexity',
    action: 'Business Unit applies PAUSE AND THINK (DFAD), documents rationale and proceeds through normal approval.' },
  { key: 'MODERATE', min: 8, max: 11, label: 'Moderate complexity',
    action: 'Business Unit requests Decision Quality Team review for framing, evidence, options and analytical support; record action owner and deadline.' },
  { key: 'HIGH', min: 12, max: 15, label: 'High complexity',
    action: 'DQ Team supports analysis and coordinates referral to the Programmatic Delivery Committee (PDC) for validation where applicable; record decision and approvals.' },
]);

/**
 * Total score (5 to 15) and band of a complete set of ratings, or null while
 * a criterion is not rated yet.
 *
 * @param {Record<string, number|null|undefined>} ratings - keyed by criterion key, 1 to 3
 * @returns {{ total: number, band: object }|null}
 * @example scoreComplexity({ information_requirements: 2, stakeholder_involvement: 3, scope_impact: 2, process_timeframe: 1, risk_uncertainty: 2 }); // { total: 10, band: MODERATE }
 */
function scoreComplexity(ratings = {}) {
  const values = COMPLEXITY_CRITERIA.map((c) => Number(ratings[c.key]));
  if (values.some((v) => !(v >= 1 && v <= 3))) return null;
  const total = values.reduce((sum, v) => sum + v, 0);
  return { total, band: COMPLEXITY_BANDS.find((b) => total >= b.min && total <= b.max) };
}

module.exports = { COMPLEXITY_QUESTION, COMPLEXITY_RATINGS, COMPLEXITY_CRITERIA, COMPLEXITY_BANDS, scoreComplexity };
