// ── report-reviewed / review-pending-reminder / report-removed (D-20261015-01) ──

const { TEMPLATES_BY_KEY } = require('../src/templates');

const reviewed = TEMPLATES_BY_KEY['report-reviewed'];
const reminder = TEMPLATES_BY_KEY['review-pending-reminder'];
const removed = TEMPLATES_BY_KEY['report-removed'];

const subjectOf = (entry, data) => (typeof entry.subject === 'function' ? entry.subject(data) : entry.subject);

describe('report-reviewed template', () => {
  const outcome = (decision, extra = {}) => ({
    metadata: {
      reportType: 'Activity Report', code: '1.2.3.1', title: 'EQA workshop', division: 'DHIS',
      quarter: 'Q3', fiscalYear: '2026', decision, reviewedBy: 'Moses K', ...extra,
    },
  });

  it('should render an approval as approved, read from metadata', () => {
    const html = reviewed.render(outcome('APPROVED'));
    expect(html).toContain('Activity Report Approved');
    expect(html).toContain('1.2.3.1');
    expect(html).toContain('DHIS');
    expect(html).not.toContain('resubmit');
    expect(subjectOf(reviewed, outcome('APPROVED'))).toBe('Activity Report 1.2.3.1 approved (Q3 2026)');
  });

  it('should treat a validated indicator report as approved', () => {
    expect(reviewed.render(outcome('VALIDATED'))).toContain('Approved');
  });

  it('should render a rejection with its escaped reason', () => {
    const html = reviewed.render(outcome('REJECTED', { reason: 'Missing <list>' }));
    expect(html).toContain('Rejected');
    expect(html).toContain('Missing &lt;list&gt;');
    expect(html).toContain('resubmit');
    expect(subjectOf(reviewed, outcome('REJECTED'))).toBe('Activity Report 1.2.3.1 rejected (Q3 2026)');
  });

  it('should still read top-level fields of older payloads', () => {
    expect(reviewed.render({ decision: 'APPROVED', code: 'X.1' })).toContain('X.1');
    expect(subjectOf(reviewed, {})).toBe('Report Review Decision');
  });
});

describe('review-pending-reminder template', () => {
  const data = {
    metadata: {
      count: 2,
      reviewUrl: 'https://pra.africacdc.org/review-submissions',
      items: [
        { type: 'Activity report', code: '1.2.3.1', title: 'EQA <workshop>', division: 'DHIS', period: 'Q3 2026', since: '2026-10-01' },
        { type: 'Indicator report', code: '1.2.3', title: 'Labs', division: 'KM', period: 'Q3 2026', since: '' },
      ],
    },
  };

  it('should list every waiting report, escaped, with a link to review submissions', () => {
    const html = reminder.render(data);
    expect(html).toContain('2 reports are waiting');
    expect(html).toContain('EQA &lt;workshop&gt;');
    expect(html).toContain('waiting since 2026-10-01');
    expect(html).toContain('review-submissions"');
    expect(subjectOf(reminder, data)).toBe('2 reports waiting for your review');
  });

  it('should use the singular for one report', () => {
    const one = { metadata: { items: [data.metadata.items[0]] } };
    expect(reminder.render(one)).toContain('1 report is waiting');
    expect(subjectOf(reminder, one)).toBe('1 report waiting for your review');
  });
});

describe('report-removed template', () => {
  const data = {
    metadata: {
      heading: 'Indicator marked not applicable', message: 'Out of the count.',
      reportType: 'Indicator report', code: '1.2.3', title: 'Labs', division: 'KM',
      quarter: 'Q3', fiscalYear: '2026', by: 'Jane Doe', reason: 'Not <ours>',
      reportUrl: 'https://pra.africacdc.org/quarterly-report/4?q=Q3',
    },
  };

  it('should render the heading, who removed it and the escaped reason', () => {
    const html = removed.render(data);
    expect(html).toContain('Indicator marked not applicable');
    expect(html).toContain('Jane Doe');
    expect(html).toContain('Not &lt;ours&gt;');
    expect(html).toContain('Open the platform');
    expect(subjectOf(removed, data)).toBe('Indicator marked not applicable: 1.2.3 (Q3 2026)');
  });

  it('should omit the button and reason when absent', () => {
    const html = removed.render({ metadata: { ...data.metadata, reportUrl: '', reason: '' } });
    expect(html).not.toContain('Open the platform');
    expect(html).not.toContain('Reason');
  });
});
