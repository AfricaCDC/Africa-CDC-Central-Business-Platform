import VerificationUpload from '@/components/shared/VerificationUpload';
import { MISSION_TYPE_LABELS } from '@rbm/lib/enums';
import { Section, NarrativeBlock, Fact } from './ReportFormParts';
import { splitNames } from './ReportPickers';
import MissionTypeDetails from './MissionTypeDetails';
import { NotStartedNotice } from './NotStartedSection';
import { SUMMARY_FIELDS, OPTIONAL_FIELDS, calcDuration, budgetCodesOf } from './reportTemplate';

const longDate = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '');

function Chips({ names, className }) {
  return (
    <div className="flex flex-wrap gap-1">
      {names.map((n) => <span key={n} className={`text-[10px] px-2 py-0.5 ${className}`}>{n}</span>)}
    </div>
  );
}

/**
 * Read-only activity report (submitted or approved), in template order.
 * @param {{ form: object, activity: object, reportId: number, fiscalYear: string }} props
 * @returns {JSX.Element}
 * @example <ReportReadView form={form} activity={activity} reportId={42} fiscalYear="2026" />
 */
export default function ReportReadView({ form, activity, reportId, fiscalYear }) {
  const duration = calcDuration(form.start_date, form.end_date);
  const spend = form.actual_spend === '' ? '' : `$${Number(form.actual_spend).toLocaleString()}`;
  const block = (f) => <NarrativeBlock key={f.key} label={f.label.replace(/ \*$/, '')} value={form[f.key]} highlight={f.highlight} />;

  return (
    <>
      <NotStartedNotice form={form} />
      <Section title="Background">
        <Fact label="4. Activity and mission type">{MISSION_TYPE_LABELS[form.mission_type] || ''}</Fact>
        <Fact label="6. Dates">
          {[longDate(form.start_date), longDate(form.end_date)].filter(Boolean).join(' to ')}
          {duration != null && ` (${duration} day${duration !== 1 ? 's' : ''})`}
        </Fact>
        <Fact label="7. Location">{form.location}</Fact>
        <Fact label="Venue">{form.venue}</Fact>
        <Fact label="8. Lead organiser">{form.lead_organiser}</Fact>
        <Fact label="Other team members">
          {form.other_staff && <Chips names={splitNames(form.other_staff)} className="bg-gray-100 border border-gray-200 text-gray-700" />}
        </Fact>
        <NarrativeBlock label="9. Activity objectives" value={form.objectives} />
      </Section>

      <Section title="10. Activity summary">
        <Fact label="10a. Participants">{form.participants_count === '' ? '' : String(form.participants_count)}</Fact>
        <Fact label={`Member States (${form.member_states.length})`}>
          {form.member_states.length > 0 && <Chips names={form.member_states} className="font-medium bg-[#D97706]/10 text-[#B45309]" />}
        </Fact>
        {SUMMARY_FIELDS.map(block)}
        <VerificationUpload reportId={reportId} parentType="activity_report" reportType="Specific Activities" entity={activity} fiscalYear={fiscalYear} readOnly />
      </Section>

      <MissionTypeDetails missionType={form.mission_type} details={form.type_details} readOnly />

      <Section title="11. Activity logistics">
        <Fact label="Budget code">{budgetCodesOf(activity).join(', ')}</Fact>
        <Fact label="Total cost used">{spend}</Fact>
      </Section>

      {OPTIONAL_FIELDS.some((f) => form[f.key]) && (
        <Section title="Additional information">{OPTIONAL_FIELDS.map(block)}</Section>
      )}
    </>
  );
}
