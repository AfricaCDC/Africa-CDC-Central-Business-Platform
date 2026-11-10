// ── report-submitted-details / report-preparer-changed (D-20261013-07) ──

const { escape } = require('@rbm/lib/html');
const { TEMPLATES_BY_KEY } = require('../src/templates');

const details = TEMPLATES_BY_KEY['report-submitted-details'];
const preparer = TEMPLATES_BY_KEY['report-preparer-changed'];

const payload = {
  metadata: {
    reportType: 'Activity Report', code: '1.2.3.1', title: 'EQA <workshop>', division: 'DHIS',
    quarter: 'Q3', fiscalYear: '2026', submittedBy: 'Jane Doe',
    reportUrl: 'https://pra.africacdc.org/activity-report/4/report/12',
    fields: [{ label: 'Achievements', value: 'Line 1\nLine <2>' }, { label: 'Empty', value: '' }],
    attachments: [
      { name: 'list.pdf', url: 'https://x.sharepoint.com/list.pdf' },
      { name: 'evil', url: 'javascript:alert(1)' },
    ],
  },
};

describe('report-submitted-details template', () => {
  it('should render the report fields, escaped, with line breaks kept', () => {
    const html = details.render(payload);
    expect(html).toContain('EQA &lt;workshop&gt;');
    expect(html).toContain('Line 1<br>Line &lt;2&gt;');
    expect(html).not.toContain('>Empty<');
    expect(html).toContain('for your business unit (DHIS)');
  });

  it('should link http(s) attachments only', () => {
    const html = details.render(payload);
    expect(html).toContain(`href="${escape('https://x.sharepoint.com/list.pdf')}"`);
    expect(html).not.toContain('javascript:');
  });

  it('should say None without attachments and link to the report', () => {
    const html = details.render({ metadata: { ...payload.metadata, attachments: [] } });
    expect(html).toContain('None');
    expect(html).toContain(`href="${escape('https://pra.africacdc.org/activity-report/4/report/12')}"`);
  });

  it('should build the subject from the payload', () => {
    expect(details.subject(payload)).toBe('Activity Report submitted: 1.2.3.1 (Q3 2026)');
    expect(details.subject({})).toBe('Report submitted:');
  });
});

describe('report-preparer-changed template', () => {
  const data = { metadata: { code: '1.2.3.1', title: 'EQA', fromName: 'John', toName: 'Jane', changedBy: 'M&E', reason: 'Jane <led> it' } };

  it('should show the previous and new preparer, who changed it and why', () => {
    const html = preparer.render(data);
    expect(html).toContain('Previously prepared by');
    expect(html).toContain('John');
    expect(html).toContain('Now prepared by');
    expect(html).toContain('M&amp;E changed who prepared');
    expect(html).toContain('Jane &lt;led&gt; it');
  });

  it('should build the subject from the payload', () => {
    expect(preparer.subject(data)).toBe('Activity report 1.2.3.1 now prepared by Jane');
  });
});
