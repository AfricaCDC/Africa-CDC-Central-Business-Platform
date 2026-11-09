function buildSubtitle(instance, entityType) {
  const title = instance?.reportTitle;
  if (title) return title;
  return entityType || '—';
}

function buildStepLabel(currentStep) {
  if (currentStep?.step) return `Step ${currentStep.step} of 3`;
  return 'No pending step';
}

function textOrDash(value) {
  return value || '—';
}

function ReportRef({ code, separator, subtitle }) {
  return (
    <p className="text-[11px] text-gray-500">
      {code ? <strong>{code}</strong> : null}
      {separator}
      {subtitle}
    </p>
  );
}

function SummaryGrid({ instance, currentStep }) {
  return (
    <section className="mb-3 border border-gray-200 bg-white p-3 text-[11px]">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
        <dt className="font-semibold text-gray-600">Contributing division</dt>
        <dd>{textOrDash(instance?.contribOrg)}</dd>
        <dt className="font-semibold text-gray-600">Accountable division</dt>
        <dd>{textOrDash(instance?.mainOrg)}</dd>
        <dt className="font-semibold text-gray-600">Submitted by</dt>
        <dd>{textOrDash(instance?.submitterName)}</dd>
        <dt className="font-semibold text-gray-600">Current step</dt>
        <dd>{buildStepLabel(currentStep)}</dd>
      </dl>
    </section>
  );
}

/**
 * Header + summary card for the approval review page. Dumb component —
 * receives the instance + currentStep, no hooks.
 *
 * @param {object} props
 * @param {object|null} props.instance
 * @param {object|null} props.currentStep
 * @param {string|undefined} props.entityType
 * @param {() => void} props.onBack
 * @returns {JSX.Element}
 * @example
 * <ReviewHeader instance={instance} currentStep={step} entityType="ACTIVITY_REPORT" onBack={fn} />
 */
export default function ReviewHeader({ instance, currentStep, entityType, onBack }) {
  const code = instance?.reportCode;
  const subtitle = buildSubtitle(instance, entityType);
  const separator = code && instance?.reportTitle ? ' — ' : null;
  return (
    <>
      <header className="mb-3">
        <button type="button" onClick={onBack} className="mb-2 text-[11px] text-gray-600 underline">
          ← Back to inbox
        </button>
        <h1 className="text-[14px] font-semibold text-gray-800">
          Review contributor report
        </h1>
        <ReportRef code={code} separator={separator} subtitle={subtitle} />
      </header>
      <SummaryGrid instance={instance} currentStep={currentStep} />
    </>
  );
}
