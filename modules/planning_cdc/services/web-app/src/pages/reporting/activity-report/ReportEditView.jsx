import SearchSelect from '@/components/shared/SearchSelect';
import VerificationUpload from '@/components/shared/VerificationUpload';
import { LOCATION_OPTIONS } from '@/utils/locationOptions';
import { fmtBudgetCompact } from '@rbm/lib/formatters';
import { MISSION_TYPE_LABELS, MISSION_TYPES_WITHOUT_PLANNED_OBJECTIVES } from '@rbm/lib/enums';
import { Section, Row, NumberedField, INPUT } from './ReportFormParts';
import { OtherStaffPicker, MemberStatesPicker } from './ReportPickers';
import MissionTypeDetails from './MissionTypeDetails';
import NotStartedSection from './NotStartedSection';
import { SUMMARY_FIELDS, OPTIONAL_FIELDS, calcDuration, budgetCodesOf } from './reportTemplate';
import { blockNegativeKeys, nonNegative } from '@/utils/nonNegative';

const daysLabel = (d) => (d == null ? '—' : `${d} day${d !== 1 ? 's' : ''}`);

/**
 * Editable activity report, laid out as the Africa CDC Activity Reporting
 * Template: background (items 4-9), activity summary (10), the section of the
 * chosen mission type, logistics (11), then the optional extras.
 * @param {{ form: object, set: Function, activity: object, staffOptions: object[],
 *   reportId: number|null, quarter: string, fiscalYear: string, onEvidenceChange: Function }} props
 * @returns {JSX.Element}
 * @example <ReportEditView form={form} set={set} activity={activity} staffOptions={[]} reportId={42} fiscalYear="2026" onEvidenceChange={setCount} />
 */
export default function ReportEditView({ form, set, activity, staffOptions, reportId, quarter, fiscalYear, onEvidenceChange }) {
  const codes = budgetCodesOf(activity);
  const objectivesHint = MISSION_TYPES_WITHOUT_PLANNED_OBJECTIVES.includes(form.mission_type)
    ? 'Describe the objectives of this activity'
    : 'Prefilled from the activity description entered at planning; adjust if needed';
  const textField = (f) => (
    <NumberedField key={f.key} n={f.n} label={f.label} value={form[f.key]} onChange={(v) => set(f.key, v)} placeholder={f.placeholder} rows={f.rows} />
  );

  return (
    <>
      <NotStartedSection form={form} set={set} quarter={quarter} fiscalYear={fiscalYear} />
      <Section title="Background">
        {/* Chosen when the activity was created, never typed here (D-20261105-01). */}
        <Row n="4" label="Activity and mission type">
          <p className="py-1.5 text-[11px] text-gray-800">
            {MISSION_TYPE_LABELS[form.mission_type] || 'Not set: choose it on the specific activity.'}
            <span className="ml-2 text-[10px] text-gray-500">From the specific activity</span>
          </p>
        </Row>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Row n="6" label="Start date">
            <input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} className={INPUT} />
          </Row>
          <Row label="End date">
            <input type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} className={INPUT} />
          </Row>
          <Row label="Duration (days)">
            <input type="text" value={daysLabel(calcDuration(form.start_date, form.end_date))} disabled className={`${INPUT} bg-gray-50 text-gray-500`} />
          </Row>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Row n="7" label="Location">
            <SearchSelect value={form.location || null} onChange={(v) => set('location', v || '')} placeholder="— Select location —" options={LOCATION_OPTIONS} allowClear />
          </Row>
          <Row label="Venue">
            <input value={form.venue} onChange={(e) => set('venue', e.target.value)} placeholder="e.g. Africa CDC HQ, conference room B" className={INPUT} />
          </Row>
        </div>
        <Row n="8" label="Lead organiser">
          <SearchSelect value={form.lead_organiser || null} onChange={(v) => set('lead_organiser', v || '')} placeholder="— Select from CBP staff —" allowClear options={staffOptions} />
        </Row>
        <Row label="Other team members">
          <OtherStaffPicker value={form.other_staff} lead={form.lead_organiser} options={staffOptions} onChange={(v) => set('other_staff', v)} />
        </Row>
        <NumberedField n="9" label="Activity objectives" value={form.objectives} onChange={(v) => set('objectives', v)} placeholder={objectivesHint} />
      </Section>

      <Section title="10. Activity summary">
        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4">
          <Row n="10a" label="Number of participants">
            <input type="number" min="0" onKeyDown={blockNegativeKeys} value={form.participants_count} onChange={(e) => set('participants_count', nonNegative(e.target.value))} placeholder="0" className={INPUT} />
          </Row>
          <Row label="Member States covered">
            <MemberStatesPicker value={form.member_states} onChange={(v) => set('member_states', v)} />
          </Row>
        </div>
        {SUMMARY_FIELDS.map(textField)}
        <VerificationUpload
          reportId={reportId}
          parentType="activity_report"
          reportType="Specific Activities"
          entity={activity}
          fiscalYear={fiscalYear}
          onFilesChange={onEvidenceChange}
        />
      </Section>

      <MissionTypeDetails missionType={form.mission_type} details={form.type_details} onChange={(v) => set('type_details', v)} />

      <Section title="11. Activity logistics">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Row label="Budget code (from the CBP)">
            <input type="text" value={codes.join(', ') || 'No budget code on the broad activity'} disabled className={`${INPUT} bg-gray-50 text-gray-500`} />
          </Row>
          <Row label="Total cost used (USD) *">
            <input
              type="number" min="0" step="0.01" onKeyDown={blockNegativeKeys}
              value={form.actual_spend}
              onChange={(e) => set('actual_spend', nonNegative(e.target.value))}
              placeholder={`Budget: ${fmtBudgetCompact(activity.budget_main, '$0')}`}
              className={INPUT}
            />
          </Row>
        </div>
      </Section>

      <Section title="Additional information (optional)">
        {OPTIONAL_FIELDS.map(textField)}
      </Section>
    </>
  );
}
