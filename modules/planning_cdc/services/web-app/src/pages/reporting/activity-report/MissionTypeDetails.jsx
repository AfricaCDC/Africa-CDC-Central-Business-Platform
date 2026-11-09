import { MISSION_TYPE_FIELDS, MISSION_TYPE_LABELS } from '@rbm/lib/enums';
import { Section, Row, INPUT, NarrativeBlock } from './ReportFormParts';
import { blockNegativeKeys, nonNegative } from '@/utils/nonNegative';

/**
 * The template's "additional specific information" for the chosen activity
 * and mission type: official engagement, event or training. Renders nothing
 * for the types the template gives no extra section.
 * @param {{ missionType: string, details: object, onChange?: Function, readOnly?: boolean }} props
 *   onChange receives the whole updated details object.
 * @returns {JSX.Element|null}
 * @example <MissionTypeDetails missionType="TRAINING" details={form.type_details} onChange={v => set('type_details', v)} />
 */
export default function MissionTypeDetails({ missionType, details, onChange, readOnly = false }) {
  const fields = MISSION_TYPE_FIELDS[missionType];
  if (!fields) return null;
  const title = `Specific information: ${MISSION_TYPE_LABELS[missionType].replace(/^[IVX]+\.\s*/, '')}`;

  if (readOnly) {
    if (!fields.some((f) => details[f.key] !== undefined && details[f.key] !== '')) return null;
    return (
      <Section title={title}>
        {fields.map((f) => <NarrativeBlock key={f.key} label={f.label} value={details[f.key]} />)}
      </Section>
    );
  }

  const handleChange = (key, value) => onChange({ ...details, [key]: value });
  const counts = fields.filter((f) => f.kind === 'number');
  const texts = fields.filter((f) => f.kind !== 'number');

  return (
    <Section title={title}>
      {counts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {counts.map((f) => (
            <Row key={f.key} label={f.label}>
              <input
                type="number"
                min="0"
                step="1"
                onKeyDown={blockNegativeKeys}
                value={details[f.key] ?? ''}
                onChange={(e) => handleChange(f.key, nonNegative(e.target.value))}
                className={INPUT}
              />
            </Row>
          ))}
        </div>
      )}
      {texts.map((f) => (
        <Row key={f.key} label={f.label}>
          {f.kind === 'line' ? (
            <input value={details[f.key] ?? ''} onChange={(e) => handleChange(f.key, e.target.value)} placeholder={f.hint} className={INPUT} />
          ) : (
            <textarea
              value={details[f.key] ?? ''}
              onChange={(e) => handleChange(f.key, e.target.value)}
              placeholder={f.hint}
              rows={3}
              className={`${INPUT} resize-none placeholder:text-gray-300`}
            />
          )}
        </Row>
      ))}
    </Section>
  );
}
